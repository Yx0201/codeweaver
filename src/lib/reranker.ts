import {
  JINA_API_KEY,
  JINA_RERANKER_URL,
  RERANKER_MODEL,
} from "./config";
import { emitTrace, type TraceCallback } from "./trace";

export interface RerankResult {
  index: number;
  relevance_score: number;
}

/**
 * Rerank documents using the Jina AI cloud reranker.
 *
 * Jina-compatible /rerank API:
 *   POST { query, documents, top_n, model }
 *   → { results: [{ index, relevance_score }] }
 *
 * On any failure (network, non-2xx) we degrade to the original retrieval
 * order so retrieval never breaks — reranking is a precision enhancement,
 * not a hard dependency.
 */
export async function rerank(
  query: string,
  documents: string[],
  topK: number = 8,
  onTrace?: TraceCallback
): Promise<RerankResult[]> {
  if (documents.length === 0) {
    emitTrace(
      "rerank",
      "skipped",
      0,
      { inputCount: 0, outputCount: 0, degraded: false, reason: "empty-input" },
      onTrace
    );
    return [];
  }

  const start = Date.now();
  try {
    const res = await fetch(JINA_RERANKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${JINA_API_KEY}`,
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
      const fallback = fallbackResults(documents, topK);
      emitTrace(
        "rerank",
        "done",
        Date.now() - start,
        {
          inputCount: documents.length,
          outputCount: fallback.length,
          degraded: true,
          reason: `http-${res.status}`,
          scores: fallback,
        },
        onTrace
      );
      return fallback;
    }

    const data = await res.json();
    const results: RerankResult[] = (data.results ?? data)
      .map((r: { index: number; relevance_score: number; score?: number }) => ({
        index: r.index,
        relevance_score: r.relevance_score ?? r.score ?? 0,
      }))
      .sort((a: RerankResult, b: RerankResult) => b.relevance_score - a.relevance_score)
      .slice(0, topK);

    emitTrace(
      "rerank",
      "done",
      Date.now() - start,
      {
        inputCount: documents.length,
        outputCount: results.length,
        degraded: false,
        scores: results,
      },
      onTrace
    );
    return results;
  } catch (err) {
    console.error("Reranker call failed, falling back to original order:", err);
    const fallback = fallbackResults(documents, topK);
    emitTrace(
      "rerank",
      "done",
      Date.now() - start,
      {
        inputCount: documents.length,
        outputCount: fallback.length,
        degraded: true,
        reason: "exception",
        error: err instanceof Error ? err.message : String(err),
        scores: fallback,
      },
      onTrace
    );
    return fallback;
  }
}

function fallbackResults(documents: string[], topK: number): RerankResult[] {
  return documents.slice(0, topK).map((_, i) => ({
    index: i,
    relevance_score: 1 - i / documents.length,
  }));
}
