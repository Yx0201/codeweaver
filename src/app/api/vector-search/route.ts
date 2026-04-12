import { hybridSearch, type HybridSearchOptions } from "@/lib/hybrid-search";
import { DEFAULT_VECTOR_TOP_K, DEFAULT_KEYWORD_TOP_K, DEFAULT_FINAL_TOP_K } from "@/lib/config";

interface VectorSearchRequest {
  query: string;
  knowledgeBaseId: number;
  topK?: number;
  vectorTopK?: number;
  keywordTopK?: number;
  finalTopK?: number;
  useReranker?: boolean;
  rerankerTopK?: number;
  fusionTopK?: number;
  useGraph?: boolean;
  graphTopK?: number;
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
    useReranker,
    rerankerTopK,
    fusionTopK,
    useGraph,
    graphTopK,
  } = body;

  if (!query || !knowledgeBaseId) {
    return Response.json(
      { error: "query and knowledgeBaseId are required" },
      { status: 400 }
    );
  }

  const options: HybridSearchOptions = {
    useReranker: useReranker ?? true,
    rerankerTopK,
    fusionTopK,
    useGraph: useGraph ?? false,
    graphTopK,
  };

  const results = await hybridSearch(
    query,
    knowledgeBaseId,
    vectorTopK ?? topK ?? DEFAULT_VECTOR_TOP_K,
    keywordTopK ?? topK ?? DEFAULT_KEYWORD_TOP_K,
    finalTopK ?? topK ?? DEFAULT_FINAL_TOP_K,
    options
  );

  return Response.json({ results });
}
