import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ fileId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { fileId } = await params;

  const file = await prisma.uploaded_files.findUnique({
    where: { id: fileId },
    select: { blob_url: true, filename: true, mime_type: true, file_data: true },
  });

  // 新数据:直接重定向到 Blob URL(走 CDN,不占服务器带宽)。
  if (file?.blob_url) {
    return NextResponse.redirect(file.blob_url, { status: 302 });
  }

  // 过渡兼容:存量记录只有 file_data(bytea),尚未迁移到 Blob。
  if (file?.file_data) {
    return new NextResponse(file.file_data, {
      headers: {
        "Content-Type": file.mime_type ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
      },
    });
  }

  return NextResponse.json({ error: "文件不存在" }, { status: 404 });
}
