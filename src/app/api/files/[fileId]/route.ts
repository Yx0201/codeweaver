import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSignedDownloadUrl } from "@/lib/blob";
import { requireUserId, unauthorized } from "@/lib/auth-guard";

interface RouteParams {
  params: Promise<{ fileId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { fileId } = await params;

  // findUnique 不支持跨表过滤,改 findFirst 并带 knowledge_base.user_id 校验,
  // 防止越权下载他人文件。
  const file = await prisma.uploaded_files.findFirst({
    where: { id: fileId, knowledge_base: { user_id: userId } },
    select: { blob_url: true, filename: true, mime_type: true, file_data: true },
  });

  // 新数据:为 private blob 生成签名下载 URL 后重定向(走 CDN)。
  if (file?.blob_url) {
    return NextResponse.redirect(getSignedDownloadUrl(file.blob_url), {
      status: 302,
    });
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
