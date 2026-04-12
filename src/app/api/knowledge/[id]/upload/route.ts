import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateEmbeddings } from "@/lib/embedding";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Parent chunk: large context window for LLM generation
const PARENT_CHUNK_SIZE = 1000;
const PARENT_CHUNK_OVERLAP = 200;

// Child chunk: retrieval units — 500 chars balances precision (small enough
// for accurate vector matching) with context (large enough to contain query terms).
// 300 chars was too small: key query terms often fell outside the chunk boundary.
const CHILD_CHUNK_SIZE = 500;
const CHILD_CHUNK_OVERLAP = 100;

/**
 * Streaming upload: returns NDJSON progress events.
 *
 * Events:
 *   { "type": "start",    "totalChunks": N }
 *   { "type": "progress", "completedChunks": M, "totalChunks": N }
 *   { "type": "complete", "fileId": "...", "totalChunks": N }
 *   { "type": "error",    "error": "..." }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const knowledgeBaseId = parseInt(id);

  if (isNaN(knowledgeBaseId)) {
    return NextResponse.json({ error: "无效的知识库ID" }, { status: 400 });
  }

  const kb = await prisma.knowledge_base.findUnique({
    where: { id: knowledgeBaseId },
  });
  if (!kb) {
    return NextResponse.json({ error: "知识库不存在" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "未上传文件" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const fileData = Buffer.from(arrayBuffer);
  const content = fileData.toString("utf-8");

  if (!content.trim()) {
    return NextResponse.json({ error: "文件内容为空" }, { status: 400 });
  }

  // Create file record with status "processing"
  const fileRecord = await prisma.uploaded_files.create({
    data: {
      knowledge_base_id: knowledgeBaseId,
      filename: file.name,
      file_size: BigInt(file.size),
      mime_type: file.type || "application/octet-stream",
      file_data: fileData,
      content,
      status: "processing",
    },
  });

  // Step 1: Split into parent chunks (large, for generation context)
  const parentSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: PARENT_CHUNK_SIZE,
    chunkOverlap: PARENT_CHUNK_OVERLAP,
  });

  let parentTexts: string[];
  try {
    parentTexts = await parentSplitter.splitText(content);
  } catch (error) {
    console.error("Text splitting failed:", error);
    await prisma.uploaded_files.update({
      where: { id: fileRecord.id },
      data: { status: "failed" },
    });
    return NextResponse.json(
      { error: "文件分块失败" },
      { status: 500 }
    );
  }

  // Step 2: Split each parent into child chunks (small, for precise retrieval)
  const childSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHILD_CHUNK_SIZE,
    chunkOverlap: CHILD_CHUNK_OVERLAP,
  });

  const parentChildMap: { parentText: string; parentId: string; childTexts: string[] }[] = [];
  let totalChildChunks = 0;

  for (const parentText of parentTexts) {
    const childTexts = await childSplitter.splitText(parentText);
    parentChildMap.push({ parentText, parentId: "", childTexts });
    totalChildChunks += childTexts.length;
  }

  // Create a streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      send({ type: "start", totalChunks: totalChildChunks + parentTexts.length });

      try {
        let completedChunks = 0;

        // Step 3: Insert parent chunks (no embedding, no keywords — parents are not searched)
        for (let i = 0; i < parentChildMap.length; i++) {
          const entry = parentChildMap[i];
          const parentRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
            `INSERT INTO document_chunks (file_id, chunk_text, chunk_order, chunk_type, metadata)
             VALUES ($1::uuid, $2, $3, 'parent', $4::jsonb)
             RETURNING id`,
            fileRecord.id,
            entry.parentText,
            i,
            JSON.stringify({ source: file.name })
          );
          entry.parentId = parentRows[0].id;
          completedChunks++;
          send({ type: "progress", completedChunks, totalChunks: totalChildChunks + parentTexts.length });
        }

        // Step 4: Insert child chunks with embeddings and keywords
        const BATCH_SIZE = 10;
        for (const entry of parentChildMap) {
          for (let i = 0; i < entry.childTexts.length; i += BATCH_SIZE) {
            const batch = entry.childTexts.slice(i, i + BATCH_SIZE);
            const embeddings = await generateEmbeddings(batch);

            for (let j = 0; j < batch.length; j++) {
              const vectorStr = `[${embeddings[j].join(",")}]`;
              await prisma.$executeRawUnsafe(
                `INSERT INTO document_chunks (file_id, chunk_text, embedding, keywords, chunk_order, chunk_type, parent_chunk_id, metadata)
                 VALUES ($1::uuid, $2, $3::vector, to_tsvector('jiebacfg', $2), $4, 'child', $5::uuid, $6::jsonb)`,
                fileRecord.id,
                batch[j],
                vectorStr,
                i + j,
                entry.parentId,
                JSON.stringify({ source: file.name })
              );
              completedChunks++;
            }

            send({ type: "progress", completedChunks, totalChunks: totalChildChunks + parentTexts.length });
          }
        }

        // Update file status to completed
        await prisma.uploaded_files.update({
          where: { id: fileRecord.id },
          data: { status: "completed" },
        });

        send({ type: "complete", fileId: fileRecord.id, totalChunks: completedChunks });
      } catch (error) {
        console.error("File processing failed:", error);
        await prisma.uploaded_files.update({
          where: { id: fileRecord.id },
          data: { status: "failed" },
        });
        send({ type: "error", error: "文件处理失败，请重试" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
    },
  });
}
