import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";

interface PageProps {
  params: Promise<{ id: string; fileId: string }>;
}

function formatFileSize(bytes: bigint | null): string {
  if (!bytes) return "未知大小";
  const size = Number(bytes);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export default async function FilePreviewPage({ params }: PageProps) {
  const { id, fileId } = await params;

  const file = await prisma.uploaded_files.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      filename: true,
      file_size: true,
      mime_type: true,
      upload_time: true,
      status: true,
      content: true,
      file_data: true,
    },
  });

  if (!file) notFound();

  const mimeType = file.mime_type ?? "text/plain";
  const isText = mimeType.startsWith("text/") || mimeType === "application/json";
  const isPdf = mimeType === "application/pdf";
  const isImage = mimeType.startsWith("image/");
  const hasData = !!file.file_data;

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="max-w-4xl mx-auto w-full flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={`/knowledge/${id}`}>
              <ArrowLeft />
            </Link>
          </Button>
          <FileText className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold truncate">{file.filename}</h1>
        </div>

        {/* Metadata */}
        <p className="text-xs text-muted-foreground mb-4 shrink-0">
          {formatFileSize(file.file_size)} ·{" "}
          {file.upload_time
            ? new Date(file.upload_time).toLocaleString("zh-CN")
            : "未知时间"}{" "}
          · {mimeType}
        </p>

        {/* Preview */}
        <div className="flex-1 min-h-0 rounded-xl border overflow-hidden bg-muted/30">
          {isPdf && hasData ? (
            <iframe
              src={`/api/files/${file.id}`}
              className="w-full h-full"
              title={file.filename}
            />
          ) : isImage && hasData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <div className="flex items-center justify-center h-full p-4">
              <img
                src={`/api/files/${file.id}`}
                alt={file.filename}
                className="max-w-full max-h-full object-contain rounded"
              />
            </div>
          ) : isText && file.content ? (
            <pre className="h-full overflow-auto p-4 text-sm font-mono whitespace-pre-wrap break-words leading-relaxed">
              {file.content}
            </pre>
          ) : file.content ? (
            <pre className="h-full overflow-auto p-4 text-sm font-mono whitespace-pre-wrap break-words leading-relaxed">
              {file.content}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <FileText className="w-10 h-10" />
              <p className="text-sm">暂无可预览的内容</p>
              {hasData && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/files/${file.id}`} target="_blank" rel="noopener noreferrer">
                    在新标签页中打开
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
