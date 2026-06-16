import {
  JINA_API_KEY,
  JINA_RERANKER_URL,
  RERANKER_MODEL,
  RERANKER_URL,
} from "./config";

export interface RerankResult {
  index: number;
  relevance_score: number;
}

/**
 * Rerank documents using Jina AI (cloud) or a local Infinity service as
 * fallback when JINA_API_KEY is not configured.
 *
 * Both endpoints expose the same Jina-compatible /rerank API:
 *   POST { query, documents, top_n, model }
 *   → { results: [{ index, relevance_score }] }
 */
export async function rerank(
  query: string,
  documents: string[],
  topK: number = 8
): Promise<RerankResult[]> {
  if (documents.length === 0) return [];

  const useCloud = Boolean(JINA_API_KEY);
  const url = useCloud ? JINA_RERANKER_URL : `${RERANKER_URL}/rerank`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(useCloud ? { Authorization: `Bearer ${JINA_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        query,
        documents,
        top_n: topK,
        model: RERANKER_MODEL,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.error(`Reranker returned ${res.status}, falling back to original order`);
      return fallbackResults(documents, topK);
    }

    const data = await res.json();
    // Jina-compatible format: { results: [{ index, relevance_score }, ...] }
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
