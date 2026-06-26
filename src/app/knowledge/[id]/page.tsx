export const dynamic = "force-dynamic";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getKnowledgeGraphData } from "@/lib/knowledge-graph";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { parseUploadPipelineState } from "@/lib/upload-processing";
import { KnowledgeGraphPanel } from "./_components/knowledge-graph-panel";
import { UploadFileButton } from "./_components/upload-file-button";
import { FileList } from "./_components/file-list";
import { UploadProgressProvider } from "./_components/upload-progress-context";

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
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { id } = await params;
  const knowledgeBaseId = parseInt(id);

  if (isNaN(knowledgeBaseId)) notFound();

  // 先校验归属:不属于当前用户的 KB 直接 404,不暴露存在性。
  const owned = await prisma.knowledge_base.findFirst({
    where: { id: knowledgeBaseId, user_id: userId },
    select: { id: true },
  });
  if (!owned) notFound();

  const [knowledgeBase, files, graph] = await Promise.all([
    prisma.knowledge_base.findUnique({ where: { id: knowledgeBaseId } }),
    prisma.uploaded_files.findMany({
      where: { knowledge_base_id: knowledgeBaseId },
      orderBy: { upload_time: "desc" },
      // Select only the columns the list needs — never read file_data (bytea)
      // or content here. The Neon serverless driver parses bytea via
      // `new Buffer()`, which trips Node's DEP0005 deprecation and would also
      // drag the raw binary of every file across the wire for a list view.
      select: {
        id: true,
        filename: true,
        file_size: true,
        upload_time: true,
        status: true,
        mime_type: true,
        metadata: true,
      },
    }),
    getKnowledgeGraphData(knowledgeBaseId),
  ]);

  if (!knowledgeBase) notFound();

  return (
    <div className="px-6 py-8 md:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 border-b border-border pb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" asChild className="shrink-0">
              <Link href="/knowledge" aria-label="返回知识库列表">
                <ArrowLeft />
              </Link>
            </Button>
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
              <BookOpen className="size-5" strokeWidth={1.75} />
            </span>
            <h1 className="text-xl font-semibold tracking-tight">
              {knowledgeBase.name}
            </h1>
          </div>
          {knowledgeBase.description && (
            <p className="mt-3 max-w-prose pl-12 text-sm leading-relaxed text-muted-foreground">
              {knowledgeBase.description}
            </p>
          )}
        </div>

        <div className="mb-10">
          <KnowledgeGraphPanel graph={graph} />
        </div>

        <UploadProgressProvider knowledgeBaseId={knowledgeBaseId}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-medium tracking-tight">文件列表</h2>
              {files.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs tabular-nums text-muted-foreground ring-1 ring-border">
                  {files.length}
                </span>
              )}
            </div>
            <UploadFileButton knowledgeBaseId={knowledgeBaseId} />
          </div>

          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-muted-foreground">
              <span className="flex size-12 items-center justify-center rounded-xl bg-muted ring-1 ring-border">
                <FolderOpen className="size-6" strokeWidth={1.5} />
              </span>
              <p className="mt-4 font-medium text-foreground/80">暂无文件</p>
              <p className="mt-1 text-sm">上传文档后将自动解析并构建知识图谱</p>
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
                process: parseUploadPipelineState(f.metadata),
              }))}
            />
          )}
        </UploadProgressProvider>
      </div>
    </div>
  );
}
