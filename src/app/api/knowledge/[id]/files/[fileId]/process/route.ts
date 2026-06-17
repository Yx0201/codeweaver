import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { generateEmbeddings } from "@/lib/embedding";
import { toTsvectorInput } from "@/lib/tokenizer";
import {
  GRAPH_BUILD_CONCURRENCY,
  GRAPH_BUILD_MIN_CONCURRENCY,
  GRAPH_BUILD_MAX_CONCURRENCY,
  EMBEDDING_BATCH_SIZE,
} from "@/lib/config";
import { consumeRateLimitHits } from "@/lib/graph-extractor";
import { logGraphBuild } from "@/lib/graph-build-logger";
import {
  cleanupKnowledgeGraph,
  prepareKnowledgeGraphChunkIngestion,
  writeKnowledgeGraphChunkIngestion,
  type KnowledgeGraphChunkIngestion,
} from "@/lib/knowledge-graph";
import { buildNovelGraphChunks, buildNovelRetrievalChunks } from "@/lib/novel-chunking";
import { prisma } from "@/lib/prisma";
import {
  buildUploadMetadata,
  markPipelineCompleted,
  markPipelineFailed,
  moveToStage,
  parseUploadPipelineState,
  updateStepState,
  type UploadPipelineState,
} from "@/lib/upload-processing";

export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ id: string; fileId: string }>;
}

async function updateFileProcess(
  fileId: string,
  state: UploadPipelineState,
  status: string = "processing"
) {
  // Merge (not replace) so sibling metadata keys like graph_build_stats survive.
  await prisma.$executeRawUnsafe(
    `UPDATE uploaded_files
     SET status = $2,
         metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
     WHERE id = $1::uuid`,
    fileId,
    status,
    JSON.stringify(buildUploadMetadata(state))
  );
}

async function runRetrievalSplitStage(fileId: string, content: string, state: UploadPipelineState) {
  const parents = buildNovelRetrievalChunks(content);
  let childChunkCount = 0;

  await prisma.document_chunks.deleteMany({
    where: { file_id: fileId },
  });

  for (const parent of parents) {
    // Generate the parent id in the app layer instead of relying on
    // `RETURNING id`. On Neon's serverless driver, depending on RETURNING to
    // thread the id into the subsequent child inserts proved unreliable and
    // produced parent_chunk_id values that violated the FK. An explicit UUID
    // removes that dependency entirely.
    const parentId = randomUUID();

    await prisma.$executeRawUnsafe(
      `INSERT INTO document_chunks (id, file_id, chunk_text, chunk_order, chunk_type, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, 'parent', $5::jsonb)`,
      parentId,
      fileId,
      parent.text,
      parent.order,
      JSON.stringify({
        ...parent.metadata,
        chapterTitle: parent.chapterTitle,
        volumeTitle: parent.volumeTitle,
      })
    );

    childChunkCount += parent.childChunks.length;

    if (parent.childChunks.length === 0) continue;

    // Batch all children of this parent into a single multi-row INSERT —
    // one network round-trip instead of N (Neon serverless charges a
    // round-trip per statement, which is what stalled the split stage).
    const values: string[] = [];
    const params: unknown[] = [];
    parent.childChunks.forEach((chunkText, index) => {
      const base = index * 7;
      values.push(
        `($${base + 1}::uuid, $${base + 2}::uuid, $${base + 3}, to_tsvector('simple', $${base + 4}), $${base + 5}, 'child', $${base + 6}::uuid, $${base + 7}::jsonb)`
      );
      params.push(
        randomUUID(),
        fileId,
        chunkText,
        toTsvectorInput(chunkText),
        index,
        parentId,
        JSON.stringify({
          documentType: "novel",
          strategy: "retrieval-child",
          chapterTitle: parent.chapterTitle,
          volumeTitle: parent.volumeTitle,
          parentOrder: parent.order,
        })
      );
    });

    await prisma.$executeRawUnsafe(
      `INSERT INTO document_chunks (id, file_id, chunk_text, keywords, chunk_order, chunk_type, parent_chunk_id, metadata)
       VALUES ${values.join(", ")}`,
      ...params
    );
  }

  let nextState = updateStepState(state, "retrieval", {
    status: "completed",
    progress: 100,
  });
  nextState = {
    ...nextState,
    counts: {
      ...nextState.counts,
      retrievalParentChunks: parents.length,
      retrievalChildChunks: childChunkCount,
    },
  };
  nextState = moveToStage(nextState, "embed");
  nextState = updateStepState(nextState, "embed", {
    status: "running",
    progress: childChunkCount === 0 ? 100 : 0,
  });

  if (childChunkCount === 0) {
    nextState = updateStepState(nextState, "embed", {
      status: "completed",
      progress: 100,
    });
    nextState = moveToStage(nextState, "graphSplit");
    nextState = updateStepState(nextState, "graphSplit", {
      status: "running",
      progress: 0,
    });
  }

  return nextState;
}

async function runEmbeddingStage(fileId: string, state: UploadPipelineState) {
  const rows = await prisma.$queryRawUnsafe<{ id: string; chunk_text: string }[]>(
    `SELECT id, chunk_text
     FROM document_chunks
     WHERE file_id = $1::uuid
       AND chunk_type = 'child'
       AND embedding IS NULL
     ORDER BY chunk_order ASC
     LIMIT $2`,
    fileId,
    EMBEDDING_BATCH_SIZE
  );

  if (rows.length > 0) {
    const embeddings = await generateEmbeddings(rows.map((row) => row.chunk_text));

    // Single round-trip batch update: UPDATE ... FROM (VALUES ...) matches each
    // row id to its vector, instead of one UPDATE statement per chunk.
    const values: string[] = [];
    const params: unknown[] = [];
    rows.forEach((row, index) => {
      const b = index * 2;
      values.push(`($${b + 1}::uuid, $${b + 2}::vector)`);
      params.push(row.id, `[${embeddings[index].join(",")}]`);
    });
    await prisma.$executeRawUnsafe(
      `UPDATE document_chunks AS dc
       SET embedding = v.embedding
       FROM (VALUES ${values.join(", ")}) AS v(id, embedding)
       WHERE dc.id = v.id`,
      ...params
    );
  }

  const remainingRows = await prisma.$queryRawUnsafe<{ count: number }[]>(
    `SELECT COUNT(*)::int AS count
     FROM document_chunks
     WHERE file_id = $1::uuid
       AND chunk_type = 'child'
       AND embedding IS NULL`,
    fileId
  );
  const remaining = remainingRows[0]?.count ?? 0;
  const embeddedChunks = Math.max(0, state.counts.retrievalChildChunks - remaining);
  const progress =
    state.counts.retrievalChildChunks === 0
      ? 100
      : Math.round((embeddedChunks / state.counts.retrievalChildChunks) * 100);

  let nextState = {
    ...state,
    counts: {
      ...state.counts,
      embeddedChunks,
    },
  };
  nextState = updateStepState(nextState, "embed", {
    status: remaining === 0 ? "completed" : "running",
    progress,
  });

  if (remaining === 0) {
    nextState = moveToStage(nextState, "graphSplit");
    nextState = updateStepState(nextState, "graphSplit", {
      status: "running",
      progress: 0,
    });
  }

  return nextState;
}

async function runGraphSplitStage(
  knowledgeBaseId: number,
  fileId: string,
  content: string,
  state: UploadPipelineState
) {
  const graphChunks = buildNovelGraphChunks(content);

  await prisma.graph_chunks.deleteMany({
    where: { file_id: fileId },
  });
  await cleanupKnowledgeGraph(knowledgeBaseId);

  // Batch-insert all graph chunks in chunked multi-row INSERTs. On a remote
  // database (Neon) each statement is a network round-trip, so inserting
  // hundreds of rows one-by-one is what stalled this stage.
  const GRAPH_INSERT_BATCH = 100;
  for (let start = 0; start < graphChunks.length; start += GRAPH_INSERT_BATCH) {
    const batch = graphChunks.slice(start, start + GRAPH_INSERT_BATCH);
    const values: string[] = [];
    const params: unknown[] = [];
    batch.forEach((chunk, i) => {
      const b = i * 6;
      values.push(
        `($${b + 1}::uuid, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}::jsonb)`
      );
      params.push(
        fileId,
        chunk.text,
        chunk.order,
        chunk.chapterTitle ?? null,
        chunk.volumeTitle ?? null,
        JSON.stringify(chunk.metadata ?? {})
      );
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO graph_chunks (file_id, chunk_text, chunk_order, chapter_title, volume_title, metadata)
       VALUES ${values.join(", ")}`,
      ...params
    );
  }

  let nextState = updateStepState(state, "graphSplit", {
    status: "completed",
    progress: 100,
  });
  nextState = {
    ...nextState,
    counts: {
      ...nextState.counts,
      graphChunks: graphChunks.length,
      graphBuiltChunks: 0,
    },
  };
  nextState = moveToStage(nextState, "graphBuild");
  nextState = updateStepState(nextState, "graphBuild", {
    status: "running",
    progress: graphChunks.length === 0 ? 100 : 0,
  });

  if (graphChunks.length === 0) {
    nextState = updateStepState(nextState, "graphBuild", {
      status: "completed",
      progress: 100,
    });
    nextState = moveToStage(nextState, "finalize");
    nextState = updateStepState(nextState, "finalize", {
      status: "running",
      progress: 100,
    });
  }

  return nextState;
}

interface GraphBuildStats {
  startedAt?: string;
  successCount?: number;
  failCount?: number;
  totalExtractMs?: number;
  concurrency?: number;
}

function readGraphBuildStats(metadata: unknown): GraphBuildStats {
  if (metadata && typeof metadata === "object") {
    const stats = (metadata as Record<string, unknown>).graph_build_stats;
    if (stats && typeof stats === "object") return stats as GraphBuildStats;
  }
  return {};
}

async function runGraphBuildStage(
  knowledgeBaseId: number,
  fileId: string,
  fileMetadata: unknown,
  state: UploadPipelineState
) {
  const stats = readGraphBuildStats(fileMetadata);
  const concurrency = Math.min(
    Math.max(stats.concurrency ?? GRAPH_BUILD_CONCURRENCY, GRAPH_BUILD_MIN_CONCURRENCY),
    GRAPH_BUILD_MAX_CONCURRENCY
  );
  const startedAt = stats.startedAt ?? new Date().toISOString();

  const rows = await prisma.$queryRawUnsafe<{ id: string; chunk_text: string }[]>(
    `SELECT id, chunk_text
     FROM graph_chunks
     WHERE file_id = $1::uuid
       AND COALESCE(metadata ->> 'graph_processed', 'false') <> 'true'
     ORDER BY chunk_order ASC
     LIMIT $2`,
    fileId,
    concurrency
  );

  await logGraphBuild(fileId, {
    event: "batch_start",
    concurrency,
    chunkCount: rows.length,
  });

  const batchStart = Date.now();
  consumeRateLimitHits(); // reset counter for this batch

  const extractedRows = await Promise.all(
    rows.map(async (row) => {
      const chunkStart = Date.now();
      let graphError: string | null = null;
      let extraction: KnowledgeGraphChunkIngestion | null = null;

      try {
        extraction = await prepareKnowledgeGraphChunkIngestion(row.chunk_text);
        await logGraphBuild(fileId, {
          event: "chunk_done",
          chunkId: row.id,
          ms: Date.now() - chunkStart,
          entities: extraction.entities.length,
          relations: extraction.relations.length,
        });
      } catch (error) {
        graphError = error instanceof Error ? error.message : "未知图谱构建错误";
        console.warn(`Graph chunk extraction skipped for ${row.id}: ${graphError}`);
        await logGraphBuild(fileId, {
          event: "chunk_failed",
          chunkId: row.id,
          ms: Date.now() - chunkStart,
          error: graphError,
        });
      }

      return { row, extraction, graphError, ms: Date.now() - chunkStart };
    })
  );

  // Keep database writes serial so concurrent extraction cannot create duplicate entities.
  for (const { row, extraction, graphError: extractionError } of extractedRows) {
    let graphError = extractionError;
    try {
      if (extraction) {
        await writeKnowledgeGraphChunkIngestion({
          knowledgeBaseId,
          graphChunkId: row.id,
          extraction,
        });
      }
    } catch (error) {
      graphError = error instanceof Error ? error.message : "未知图谱构建错误";
      console.warn(`Graph chunk ingestion skipped for ${row.id}: ${graphError}`);
    }

    await prisma.$executeRawUnsafe(
      `UPDATE graph_chunks
       SET metadata = COALESCE(metadata, '{}'::jsonb)
         || jsonb_build_object(
              'graph_processed', true,
              'graph_error', $2::text
            )
       WHERE id = $1::uuid`,
      row.id,
      graphError
    );
  }

  const batchMs = Date.now() - batchStart;
  const batchSuccess = extractedRows.filter((r) => !r.graphError).length;
  const batchFail = extractedRows.length - batchSuccess;
  const batchExtractMs = extractedRows.reduce((sum, r) => sum + r.ms, 0);

  // AIMD concurrency control: halve on rate limiting, +1 on a clean batch.
  const rateLimitHits = consumeRateLimitHits();
  const nextConcurrency =
    rateLimitHits > 0
      ? Math.max(GRAPH_BUILD_MIN_CONCURRENCY, Math.floor(concurrency / 2))
      : Math.min(GRAPH_BUILD_MAX_CONCURRENCY, concurrency + 1);

  const remainingRows = await prisma.$queryRawUnsafe<{ count: number }[]>(
    `SELECT COUNT(*)::int AS count
     FROM graph_chunks
     WHERE file_id = $1::uuid
       AND COALESCE(metadata ->> 'graph_processed', 'false') <> 'true'`,
    fileId
  );
  const remaining = remainingRows[0]?.count ?? 0;

  await logGraphBuild(fileId, {
    event: "batch_done",
    successCount: batchSuccess,
    failCount: batchFail,
    ms: batchMs,
    rateLimitHits,
    nextConcurrency,
    remaining,
  });

  const newStats: GraphBuildStats = {
    startedAt,
    successCount: (stats.successCount ?? 0) + batchSuccess,
    failCount: (stats.failCount ?? 0) + batchFail,
    totalExtractMs: (stats.totalExtractMs ?? 0) + batchExtractMs,
    concurrency: nextConcurrency,
  };

  if (remaining === 0) {
    const totalChunks = (newStats.successCount ?? 0) + (newStats.failCount ?? 0);
    await logGraphBuild(fileId, {
      event: "build_done",
      totalChunks,
      success: newStats.successCount ?? 0,
      failed: newStats.failCount ?? 0,
      failRate: totalChunks > 0 ? (newStats.failCount ?? 0) / totalChunks : 0,
      totalExtractMs: newStats.totalExtractMs ?? 0,
      wallClockMs: Date.now() - new Date(startedAt).getTime(),
    });
  }

  // Persist stats alongside the pipeline state (merged into metadata later).
  await prisma.$executeRawUnsafe(
    `UPDATE uploaded_files
     SET metadata = COALESCE(metadata, '{}'::jsonb)
       || jsonb_build_object('graph_build_stats', $2::jsonb)
     WHERE id = $1::uuid`,
    fileId,
    JSON.stringify(newStats)
  );
  const graphBuiltChunks = Math.max(0, state.counts.graphChunks - remaining);
  const progress =
    state.counts.graphChunks === 0
      ? 100
      : Math.round((graphBuiltChunks / state.counts.graphChunks) * 100);

  let nextState = {
    ...state,
    counts: {
      ...state.counts,
      graphBuiltChunks,
    },
  };
  nextState = updateStepState(nextState, "graphBuild", {
    status: remaining === 0 ? "completed" : "running",
    progress,
  });

  if (remaining === 0) {
    nextState = moveToStage(nextState, "finalize");
    nextState = updateStepState(nextState, "finalize", {
      status: "running",
      progress: 100,
    });
  }

  return nextState;
}

async function runFinalizeStage(knowledgeBaseId: number, state: UploadPipelineState) {
  await cleanupKnowledgeGraph(knowledgeBaseId);

  let nextState = updateStepState(state, "finalize", {
    status: "completed",
    progress: 100,
  });
  nextState = markPipelineCompleted(nextState);
  return nextState;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id, fileId } = await params;
  const knowledgeBaseId = parseInt(id, 10);

  if (Number.isNaN(knowledgeBaseId)) {
    return NextResponse.json({ error: "无效的知识库ID" }, { status: 400 });
  }

  const file = await prisma.uploaded_files.findFirst({
    where: {
      id: fileId,
      knowledge_base_id: knowledgeBaseId,
    },
    select: {
      id: true,
      filename: true,
      status: true,
      metadata: true,
    },
  });

  if (!file) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  return NextResponse.json({
    fileId: file.id,
    filename: file.filename,
    status: file.status,
    process: parseUploadPipelineState(file.metadata),
  });
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id, fileId } = await params;
  const knowledgeBaseId = parseInt(id, 10);

  if (Number.isNaN(knowledgeBaseId)) {
    return NextResponse.json({ error: "无效的知识库ID" }, { status: 400 });
  }

  const file = await prisma.uploaded_files.findFirst({
    where: {
      id: fileId,
      knowledge_base_id: knowledgeBaseId,
    },
    select: {
      id: true,
      filename: true,
      content: true,
      status: true,
      metadata: true,
    },
  });

  if (!file) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const currentState = parseUploadPipelineState(file.metadata);
  if (!currentState) {
    return NextResponse.json({ error: "文件处理状态缺失" }, { status: 409 });
  }

  if (file.status === "completed" || (currentState.stage === "finalize" && currentState.completedAt)) {
    return NextResponse.json({
      fileId: file.id,
      filename: file.filename,
      status: "completed",
      process: currentState,
    });
  }

  try {
    let nextState = currentState;
    const content = file.content ?? "";

    if (currentState.stage === "retrieval") {
      nextState = await runRetrievalSplitStage(file.id, content, currentState);
      await updateFileProcess(file.id, nextState);
    } else if (currentState.stage === "embed") {
      nextState = await runEmbeddingStage(file.id, currentState);
      await updateFileProcess(file.id, nextState);
    } else if (currentState.stage === "graphSplit") {
      nextState = await runGraphSplitStage(knowledgeBaseId, file.id, content, currentState);
      await updateFileProcess(file.id, nextState);
    } else if (currentState.stage === "graphBuild") {
      nextState = await runGraphBuildStage(knowledgeBaseId, file.id, file.metadata, currentState);
      await updateFileProcess(file.id, nextState);
    } else if (currentState.stage === "finalize") {
      nextState = await runFinalizeStage(knowledgeBaseId, currentState);
      await updateFileProcess(file.id, nextState, "completed");

      return NextResponse.json({
        fileId: file.id,
        filename: file.filename,
        status: "completed",
        process: nextState,
      });
    }

    return NextResponse.json({
      fileId: file.id,
      filename: file.filename,
      status: nextState.completedAt ? "completed" : "processing",
      process: nextState,
    });
  } catch (error) {
    console.error("Async file processing failed:", error);
    const failedState = markPipelineFailed(
      currentState,
      error instanceof Error ? error.message : "文件处理失败"
    );
    await updateFileProcess(file.id, failedState, "failed");

    return NextResponse.json(
      {
        error: "文件处理失败，请重试",
        fileId: file.id,
        filename: file.filename,
        status: "failed",
        process: failedState,
      },
      { status: 500 }
    );
  }
}
