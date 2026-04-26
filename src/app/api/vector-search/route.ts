import { DEFAULT_FINAL_TOP_K, DEFAULT_KEYWORD_TOP_K, DEFAULT_VECTOR_TOP_K } from "@/lib/config";
import { searchKnowledgeBase, type RetrievalMode } from "@/lib/search-service";

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
}

export async function POST(req: Request) {
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
  } = body;

  if (!query || !knowledgeBaseId) {
    return Response.json(
      { error: "query and knowledgeBaseId are required" },
      { status: 400 }
    );
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
    }
  );

  return Response.json({ results });
}
