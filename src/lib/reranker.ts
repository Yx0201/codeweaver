import { RERANKER_URL } from "./config";

export interface RerankResult {
  index: number;
  relevance_score: number;
}

/**
 * Rerank documents using the Infinity reranker service.
 *
 * Infinity serves cross-encoder reranking models (like bge-reranker-v2-m3)
 * with a Jina-compatible /rerank API on Apple Silicon.
 *
 * Falls back gracefully if the service is unavailable.
 */
export async function rerank(
  query: string,
  documents: string[],
  topK: number = 8
): Promise<RerankResult[]> {
  if (documents.length === 0) return [];

  try {
    const res = await fetch(`${RERANKER_URL}/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        documents,
        top_n: topK,
        model: "BAAI/bge-reranker-v2-m3",
      }),
      signal: AbortSignal.timeout(30_000), // 30s timeout (Rosetta emulation is slow)
    });

    if (!res.ok) {
      console.error(`Reranker returned ${res.status}, falling back to original order`);
      return fallbackResults(documents, topK);
    }

    const data = await res.json();
    // Infinity / Jina-compatible format: { results: [{ index, relevance_score }, ...] }
    const results: RerankResult[] = (data.results ?? data)
      .map((r: { index: number; relevance_score: number; score?: number }) => ({
        index: r.index,
        relevance_score: r.relevance_score ?? r.score ?? 0,
      }))
      .sort((a: RerankResult, b: RerankResult) => b.relevance_score - a.relevance_score)
      .slice(0, topK);

    return results;
  } catch (err) {
    console.error("Reranker call failed, falling back to original order:", err);
    return fallbackResults(documents, topK);
  }
}

function fallbackResults(documents: string[], topK: number): RerankResult[] {
  return documents.slice(0, topK).map((_, i) => ({
    index: i,
    relevance_score: 1 - i / documents.length,
  }));
}
