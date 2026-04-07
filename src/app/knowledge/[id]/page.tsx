import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, FileText, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { UploadFileButton } from "./_components/upload-file-button";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatFileSize(bytes: bigint | null): string {
  if (!bytes) return "未知大小";
  const size = Number(bytes);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(date: Date | null): string {
  if (!date) return "未知时间";
  return new Date(date).toLocaleString("zh-CN");
}

export default async function KnowledgeBasePage({ params }: PageProps) {
  const { id } = await params;
  const knowledgeBaseId = parseInt(id);

  if (isNaN(knowledgeBaseId)) notFound();

  const [knowledgeBase, files] = await Promise.all([
    prisma.knowledge_base.findUnique({ where: { id: knowledgeBaseId } }),
    prisma.uploaded_files.findMany({
      where: { knowledge_base_id: knowledgeBaseId },
      orderBy: { upload_time: "desc" },
    }),
  ]);

  if (!knowledgeBase) notFound();

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/knowledge">
              <ArrowLeft />
            </Link>
          </Button>
          <BookOpen className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-semibold">{knowledgeBase.name}</h1>
        </div>

        {knowledgeBase.description && (
          <p className="text-muted-foreground mb-6">
            {knowledgeBase.description}
          </p>
        )}

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">文件列表</h2>
          <UploadFileButton knowledgeBaseId={knowledgeBaseId} />
        </div>

        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FolderOpen className="w-12 h-12 mb-4" />
            <p>暂无文件</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {files.map((file) => (
              <Card key={file.id}>
                <CardContent className="flex items-center gap-3 py-3">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{file.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.file_size)} ·{" "}
                      {formatDate(file.upload_time)} ·{" "}
                      <span
                        className={
                          file.status === "completed"
                            ? "text-green-600"
                            : file.status === "failed"
                              ? "text-destructive"
                              : "text-yellow-600"
                        }
                      >
                        {file.status === "completed"
                          ? "已完成"
                          : file.status === "processing"
                            ? "处理中"
                            : file.status === "failed"
                              ? "处理失败"
                              : "已上传"}
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
