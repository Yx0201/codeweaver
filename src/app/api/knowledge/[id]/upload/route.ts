import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateEmbeddings } from "@/lib/embedding";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ id: string }>;
}

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

  try {
    // Split text into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 100,
    });
    const chunks = await splitter.splitText(content);

    // Generate embeddings in batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const embeddings = await generateEmbeddings(batch);

      for (let j = 0; j < batch.length; j++) {
        const vectorStr = `[${embeddings[j].join(",")}]`;
        await prisma.$executeRawUnsafe(
          `INSERT INTO document_chunks (file_id, chunk_text, embedding, chunk_order, metadata)
           VALUES ($1::uuid, $2, $3::vector, $4, $5::jsonb)`,
          fileRecord.id,
          batch[j],
          vectorStr,
          i + j,
          JSON.stringify({ source: file.name })
        );
      }
    }

    // Update file status to completed
    await prisma.uploaded_files.update({
      where: { id: fileRecord.id },
      data: { status: "completed" },
    });

    return NextResponse.json({
      success: true,
      fileId: fileRecord.id,
      chunks: chunks.length,
    });
  } catch (error) {
    console.error("File processing failed:", error);
    await prisma.uploaded_files.update({
      where: { id: fileRecord.id },
      data: { status: "failed" },
    });
    return NextResponse.json(
      { error: "文件处理失败，请重试" },
      { status: 500 }
    );
  }
}
