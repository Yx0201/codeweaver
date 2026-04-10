import { vectorSearch, type SearchResult as VectorSearchResult } from "@/lib/vector-search";
import { keywordSearch, type KeywordSearchResult } from "@/lib/keyword-search";

export interface HybridSearchResult {
  chunk_text: string;
  score: number;
  source: "vector" | "keyword" | "both";
  metadata: unknown;
}

/**
 * Reciprocal Rank Fusion (RRF) — pluggable fusion algorithm.
 *
 * RRF score for each document:  Σ 1 / (k + rank)
 * where k is a smoothing constant (default 60).
 *
 * This function is intentionally isolated so that future
 * fusion strategies (e.g., weighted sum, learned reranker)
 * can swap in by replacing only this module.
 */
function reciprocalRankFusion(
  vectorResults: VectorSearchResult[],
  keywordResults: KeywordSearchResult[],
  k: number = 60
): Map<string, { score: number; sources: Set<"vector" | "keyword"> }> {
  const scores = new Map<
    string,
    { score: number; sources: Set<"vector" | "keyword"> }
  >();

  vectorResults.forEach((r, rank) => {
    const key = r.chunk_text;
    const existing = scores.get(key) ?? {
      score: 0,
      sources: new Set<"vector" | "keyword">(),
    };
    existing.score += 1 / (k + rank + 1);
    existing.sources.add("vector");
    scores.set(key, existing);
  });

  keywordResults.forEach((r, rank) => {
    const key = r.chunk_text;
    const existing = scores.get(key) ?? {
      score: 0,
      sources: new Set<"vector" | "keyword">(),
    };
    existing.score += 1 / (k + rank + 1);
    existing.sources.add("keyword");
    scores.set(key, existing);
  });

  return scores;
}

/**
 * Hybrid search: combines vector search and keyword search via RRF reranking.
 *
 * @param query           The user query text
 * @param knowledgeBaseId The knowledge base to search in
 * @param vectorTopK      Number of results from vector search
 * @param keywordTopK     Number of results from keyword search
 * @param finalTopK       Number of results after RRF fusion
 */
export async function hybridSearch(
  query: string,
  knowledgeBaseId: number,
  vectorTopK: number = 5,
  keywordTopK: number = 5,
  finalTopK: number = 5
): Promise<HybridSearchResult[]> {
  // Run both searches in parallel
  const [vectorResults, keywordResults] = await Promise.all([
    vectorSearch(query, knowledgeBaseId, vectorTopK),
    keywordSearch(query, knowledgeBaseId, keywordTopK),
  ]);

  // Fuse with RRF
  const fused = reciprocalRankFusion(vectorResults, keywordResults);

  // Sort by fused score, take finalTopK
  const sorted = [...fused.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, finalTopK);

  // Lookup metadata from original results
  const metadataMap = new Map<string, unknown>();
  for (const r of vectorResults) metadataMap.set(r.chunk_text, r.metadata);
  for (const r of keywordResults) {
    if (!metadataMap.has(r.chunk_text)) metadataMap.set(r.chunk_text, r.metadata);
  }

  return sorted.map(([chunk_text, { score, sources }]) => ({
    chunk_text,
    score,
    source: sources.has("vector") && sources.has("keyword")
      ? "both" as const
      : (sources.values().next().value as "vector" | "keyword"),
    metadata: metadataMap.get(chunk_text) ?? null,
  }));
}
