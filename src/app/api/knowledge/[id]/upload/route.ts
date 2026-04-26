import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { buildUploadMetadata, createInitialUploadState } from "@/lib/upload-processing";

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
  const content = fileData.toString("utf-8").replace(/\r\n?/g, "\n");

  if (!content.trim()) {
    return NextResponse.json({ error: "文件内容为空" }, { status: 400 });
  }

  const processState = createInitialUploadState();

  const fileRecord = await prisma.uploaded_files.create({
    data: {
      knowledge_base_id: knowledgeBaseId,
      filename: file.name,
      file_size: BigInt(file.size),
      mime_type: file.type || "application/octet-stream",
      file_data: fileData,
      content,
      status: "processing",
      metadata: buildUploadMetadata(processState) as unknown as Prisma.InputJsonValue,
    },
    select: {
      id: true,
      filename: true,
      status: true,
      metadata: true,
    },
  });

  return NextResponse.json({
    success: true,
    fileId: fileRecord.id,
    filename: fileRecord.filename,
    status: fileRecord.status,
    process: processState,
  });
}
