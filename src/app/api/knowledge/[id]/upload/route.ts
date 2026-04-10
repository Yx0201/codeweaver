import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateEmbeddings } from "@/lib/embedding";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ id: string }>;
}

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

  // Split text into chunks
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 100,
  });

  let chunks: string[];
  try {
    chunks = await splitter.splitText(content);
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

  const totalChunks = chunks.length;

  // Create a streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      send({ type: "start", totalChunks });

      try {
        const BATCH_SIZE = 10;
        let completedChunks = 0;

        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
          const batch = chunks.slice(i, i + BATCH_SIZE);
          const embeddings = await generateEmbeddings(batch);

          for (let j = 0; j < batch.length; j++) {
            const vectorStr = `[${embeddings[j].join(",")}]`;
            await prisma.$executeRawUnsafe(
              `INSERT INTO document_chunks (file_id, chunk_text, embedding, keywords, chunk_order, metadata)
               VALUES ($1::uuid, $2, $3::vector, to_tsvector('jiebacfg', $2), $4, $5::jsonb)`,
              fileRecord.id,
              batch[j],
              vectorStr,
              i + j,
              JSON.stringify({ source: file.name })
            );
            completedChunks++;
          }

          send({ type: "progress", completedChunks, totalChunks });
        }

        // Update file status to completed
        await prisma.uploaded_files.update({
          where: { id: fileRecord.id },
          data: { status: "completed" },
        });

        send({ type: "complete", fileId: fileRecord.id, totalChunks });
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
