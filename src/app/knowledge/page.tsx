export const dynamic = "force-dynamic";
import { FolderOpen } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { CreateKnowledgeDialog } from "./_components/create-knowledge-dialog";
import { KnowledgeBaseCard } from "./_components/knowledge-base-card";

export default async function KnowledgePage() {
  const knowledgeBases = await prisma.knowledge_base.findMany({
    orderBy: { created_at: "desc" },
    include: { _count: { select: { uploaded_files: true } } },
  });

  return (
    <div className="px-6 py-8 md:px-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-end justify-between gap-4 border-b border-border pb-6 mb-8">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
              Knowledge bases
            </p>
            <div className="mt-2 flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">知识库</h1>
              {knowledgeBases.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs tabular-nums text-muted-foreground ring-1 ring-border">
                  {knowledgeBases.length}
                </span>
              )}
            </div>
          </div>
          <CreateKnowledgeDialog />
        </div>

        {knowledgeBases.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-muted-foreground">
            <span className="flex size-12 items-center justify-center rounded-xl bg-muted ring-1 ring-border">
              <FolderOpen className="size-6" strokeWidth={1.5} />
            </span>
            <p className="mt-4 font-medium text-foreground/80">还没有知识库</p>
            <p className="text-sm mt-1">点击右上角按钮创建第一个知识库</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {knowledgeBases.map((kb) => (
              <KnowledgeBaseCard
                key={kb.id}
                id={kb.id}
                name={kb.name}
                description={kb.description}
                fileCount={kb._count.uploaded_files}
                createdAt={
                  kb.created_at
                    ? new Date(kb.created_at).toLocaleString("zh-CN")
                    : "未知时间"
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
