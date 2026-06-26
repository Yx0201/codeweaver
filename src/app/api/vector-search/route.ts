import { DEFAULT_FINAL_TOP_K, DEFAULT_KEYWORD_TOP_K, DEFAULT_VECTOR_TOP_K } from "@/lib/config";
import { searchKnowledgeBase, type RetrievalMode } from "@/lib/search-service";
import { prisma } from "@/lib/prisma";
import { requireUserId, unauthorized } from "@/lib/auth-guard";

interface VectorSearchRequest {
  query: string;
  knowledgeBaseId: number;
  topK?: number;
  vectorTopK?: number;
  keywordTopK?: number;
  finalTopK?: number;
  rerankerTopK?: number;
  fusionTopK?: number;
  searchMode?: RetrievalMode;
  useGraph?: boolean;
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body: VectorSearchRequest = await req.json();
  const {
    query,
    knowledgeBaseId,
    topK,
    vectorTopK,
    keywordTopK,
    finalTopK,
    rerankerTopK,
    fusionTopK,
    searchMode = "hybrid",
    useGraph,
  } = body;

  if (!query || !knowledgeBaseId) {
    return Response.json(
      { error: "query and knowledgeBaseId are required" },
      { status: 400 }
    );
  }

  // 校验当前用户拥有该知识库,防止越权检索他人数据。
  const owned = await prisma.knowledge_base.findFirst({
    where: { id: knowledgeBaseId, user_id: userId },
    select: { id: true },
  });
  if (!owned) {
    return Response.json({ error: "知识库不存在或无权访问" }, { status: 404 });
  }

  const results = await searchKnowledgeBase(
    query,
    knowledgeBaseId,
    searchMode,
    {
      vectorTopK: vectorTopK ?? topK ?? DEFAULT_VECTOR_TOP_K,
      keywordTopK: keywordTopK ?? topK ?? DEFAULT_KEYWORD_TOP_K,
      finalTopK: finalTopK ?? topK ?? DEFAULT_FINAL_TOP_K,
      rerankerTopK,
      fusionTopK,
      useGraph,
    }
  );

  return Response.json({ results });
}
