import { graphSearch } from "@/lib/graph-search";
import { hybridSearch, type HybridSearchOptions, type HybridSearchResult } from "@/lib/hybrid-search";
import { withTrace, type TraceCallback } from "@/lib/trace";
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
  /** Override the graph channel in hybrid mode (defaults to enabled). */
  useGraph?: boolean;
}

export async function searchKnowledgeBase(
  query: string,
  knowledgeBaseId: number,
  searchMode: RetrievalMode,
  options: SearchKnowledgeBaseOptions = {},
  onTrace?: TraceCallback
): Promise<HybridSearchResult[]> {
  const {
    vectorTopK = DEFAULT_VECTOR_TOP_K,
    keywordTopK = DEFAULT_KEYWORD_TOP_K,
    finalTopK = DEFAULT_FINAL_TOP_K,
    rerankerTopK,
    fusionTopK,
    queryRewriteMode,
    useGraph,
  } = options;

  if (searchMode === "graph") {
    return withTrace(
      "graph_only_search",
      async () => {
        const results = await graphSearch(query, knowledgeBaseId, finalTopK);
        const mapped = results.map((result) => ({
          chunk_id: result.chunk_id,
          file_id: result.file_id,
          filename: result.filename,
          chunk_text: result.chunk_text,
          score: result.score,
          source: "graph" as const,
          metadata: result.metadata,
        }));
        return { result: mapped, data: { query, topK: finalTopK, count: mapped.length } };
      },
      onTrace
    );
  }

  const hybridOptions: HybridSearchOptions = {
    useReranker: searchMode === "hybrid",
    // Graph-augmented retrieval: in full hybrid mode the knowledge graph is a
    // third RRF channel by default; "fast" mode skips it for low latency.
    useGraph: useGraph ?? searchMode === "hybrid",
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
    hybridOptions,
    onTrace
  );
}
