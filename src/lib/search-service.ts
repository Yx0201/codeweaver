import { graphSearch } from "@/lib/graph-search";
import { hybridSearch, type HybridSearchOptions, type HybridSearchResult } from "@/lib/hybrid-search";
import {
  DEFAULT_FINAL_TOP_K,
  DEFAULT_KEYWORD_TOP_K,
  DEFAULT_VECTOR_TOP_K,
} from "@/lib/config";
import type { RewriteMode } from "@/lib/query-rewriter";

export type RetrievalMode = "hybrid" | "graph" | "fast";

export interface SearchKnowledgeBaseOptions {
  vectorTopK?: number;
  keywordTopK?: number;
  finalTopK?: number;
  rerankerTopK?: number;
  fusionTopK?: number;
  queryRewriteMode?: RewriteMode;
}

export async function searchKnowledgeBase(
  query: string,
  knowledgeBaseId: number,
  searchMode: RetrievalMode,
  options: SearchKnowledgeBaseOptions = {}
): Promise<HybridSearchResult[]> {
  const {
    vectorTopK = DEFAULT_VECTOR_TOP_K,
    keywordTopK = DEFAULT_KEYWORD_TOP_K,
    finalTopK = DEFAULT_FINAL_TOP_K,
    rerankerTopK,
    fusionTopK,
    queryRewriteMode,
  } = options;

  if (searchMode === "graph") {
    const results = await graphSearch(query, knowledgeBaseId, finalTopK);

    return results.map((result) => ({
      chunk_text: result.chunk_text,
      score: result.score,
      source: "graph",
      metadata: result.metadata,
    }));
  }

  const hybridOptions: HybridSearchOptions = {
    useReranker: searchMode === "hybrid",
    rerankerTopK,
    fusionTopK,
    queryRewriteMode,
  };

  return hybridSearch(
    query,
    knowledgeBaseId,
    vectorTopK,
    keywordTopK,
    finalTopK,
    hybridOptions
  );
}
