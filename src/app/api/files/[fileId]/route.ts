import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ fileId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { fileId } = await params;

  const file = await prisma.uploaded_files.findUnique({
    where: { id: fileId },
    select: { filename: true, mime_type: true, file_data: true },
  });

  if (!file || !file.file_data) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  return new NextResponse(file.file_data, {
    headers: {
      "Content-Type": file.mime_type ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
    },
  });
}
