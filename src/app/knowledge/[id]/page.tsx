import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getKnowledgeGraphData } from "@/lib/knowledge-graph";
import { prisma } from "@/lib/prisma";
import { KnowledgeGraphPanel } from "./_components/knowledge-graph-panel";
import { UploadFileButton } from "./_components/upload-file-button";
import { FileList } from "./_components/file-list";

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

  const [knowledgeBase, files, graph] = await Promise.all([
    prisma.knowledge_base.findUnique({ where: { id: knowledgeBaseId } }),
    prisma.uploaded_files.findMany({
      where: { knowledge_base_id: knowledgeBaseId },
      orderBy: { upload_time: "desc" },
    }),
    getKnowledgeGraphData(knowledgeBaseId),
  ]);

  if (!knowledgeBase) notFound();

  return (
    <div className="p-6">
      <div className="mx-auto max-w-7xl">
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

        <div className="mb-8">
          <KnowledgeGraphPanel graph={graph} />
        </div>

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
          <FileList
            knowledgeBaseId={knowledgeBaseId}
            files={files.map((f) => ({
              id: f.id,
              filename: f.filename,
              fileSize: formatFileSize(f.file_size),
              uploadTime: formatDate(f.upload_time),
              status: f.status,
            }))}
          />
        )}
      </div>
    </div>
  );
}
