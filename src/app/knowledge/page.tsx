import { BookOpen, FolderOpen } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { CreateKnowledgeDialog } from "./_components/create-knowledge-dialog";
import { KnowledgeBaseCard } from "./_components/knowledge-base-card";

export default async function KnowledgePage() {
  const knowledgeBases = await prisma.knowledge_base.findMany({
    orderBy: { created_at: "desc" },
    include: { _count: { select: { uploaded_files: true } } },
  });

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-semibold">知识库</h1>
          </div>
          <CreateKnowledgeDialog />
        </div>

        {knowledgeBases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FolderOpen className="w-12 h-12 mb-4" />
            <p>暂无知识库</p>
            <p className="text-sm mt-1">点击上方按钮创建知识库</p>
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
