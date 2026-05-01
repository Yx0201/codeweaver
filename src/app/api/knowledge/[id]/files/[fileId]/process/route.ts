import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { generateEmbeddings } from "@/lib/embedding";
import { GRAPH_BUILD_CONCURRENCY } from "@/lib/config";
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

export const maxDuration = 60;

const EMBEDDING_BATCH_SIZE = 8;

interface RouteParams {
  params: Promise<{ id: string; fileId: string }>;
}

async function updateFileProcess(
  fileId: string,
  state: UploadPipelineState,
  status: string = "processing"
) {
  await prisma.uploaded_files.update({
    where: { id: fileId },
    data: {
      status,
      metadata: buildUploadMetadata(state) as unknown as Prisma.InputJsonValue,
    },
  });
}

async function runRetrievalSplitStage(fileId: string, content: string, state: UploadPipelineState) {
  const parents = buildNovelRetrievalChunks(content);
  let childChunkCount = 0;

  await prisma.document_chunks.deleteMany({
    where: { file_id: fileId },
  });

  for (const parent of parents) {
    const parentRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO document_chunks (file_id, chunk_text, chunk_order, chunk_type, metadata)
       VALUES ($1::uuid, $2, $3, 'parent', $4::jsonb)
       RETURNING id`,
      fileId,
      parent.text,
      parent.order,
      JSON.stringify({
        ...parent.metadata,
        chapterTitle: parent.chapterTitle,
        volumeTitle: parent.volumeTitle,
      })
    );

    const parentId = parentRows[0]?.id;
    if (!parentId) {
      throw new Error("检索父 chunk 写入失败");
    }

    childChunkCount += parent.childChunks.length;

    for (let index = 0; index < parent.childChunks.length; index += 1) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO document_chunks (file_id, chunk_text, keywords, chunk_order, chunk_type, parent_chunk_id, metadata)
         VALUES ($1::uuid, $2, to_tsvector('jiebacfg', $2), $3, 'child', $4::uuid, $5::jsonb)`,
        fileId,
        parent.childChunks[index],
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
    }
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

    for (let index = 0; index < rows.length; index += 1) {
      const vector = `[${embeddings[index].join(",")}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE document_chunks
         SET embedding = $2::vector
         WHERE id = $1::uuid`,
        rows[index].id,
        vector
      );
    }
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

  for (const chunk of graphChunks) {
    await prisma.graph_chunks.create({
      data: {
        file_id: fileId,
        chunk_text: chunk.text,
        chunk_order: chunk.order,
        chapter_title: chunk.chapterTitle,
        volume_title: chunk.volumeTitle,
        metadata: chunk.metadata as Prisma.InputJsonValue,
      },
    });
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

async function runGraphBuildStage(
  knowledgeBaseId: number,
  fileId: string,
  state: UploadPipelineState
) {
  const rows = await prisma.$queryRawUnsafe<{ id: string; chunk_text: string }[]>(
    `SELECT id, chunk_text
     FROM graph_chunks
     WHERE file_id = $1::uuid
       AND COALESCE(metadata ->> 'graph_processed', 'false') <> 'true'
     ORDER BY chunk_order ASC
     LIMIT $2`,
    fileId,
    GRAPH_BUILD_CONCURRENCY
  );

  const extractedRows = await Promise.all(
    rows.map(async (row) => {
      let graphError: string | null = null;
      let extraction: KnowledgeGraphChunkIngestion | null = null;

      try {
        extraction = await prepareKnowledgeGraphChunkIngestion(row.chunk_text);
      } catch (error) {
        graphError = error instanceof Error ? error.message : "未知图谱构建错误";
        console.warn(`Graph chunk extraction skipped for ${row.id}: ${graphError}`);
      }

      return { row, extraction, graphError };
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

  const remainingRows = await prisma.$queryRawUnsafe<{ count: number }[]>(
    `SELECT COUNT(*)::int AS count
     FROM graph_chunks
     WHERE file_id = $1::uuid
       AND COALESCE(metadata ->> 'graph_processed', 'false') <> 'true'`,
    fileId
  );
  const remaining = remainingRows[0]?.count ?? 0;
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
      nextState = await runGraphBuildStage(knowledgeBaseId, file.id, currentState);
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
