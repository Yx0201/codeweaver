import { vectorSearch, type SearchResult as VectorSearchResult } from "@/lib/vector-search";
import { keywordSearch, type KeywordSearchResult } from "@/lib/keyword-search";
import { graphSearch, type GraphSearchResult } from "@/lib/graph-search";
import { rerank } from "@/lib/reranker";
import { rewriteQuery, type RewriteMode } from "@/lib/query-rewriter";
import { generateEmbedding } from "@/lib/embedding";
import { prisma } from "@/lib/prisma";
import { RRF_K, DEFAULT_VECTOR_TOP_K, DEFAULT_KEYWORD_TOP_K, DEFAULT_FUSION_TOP_K, DEFAULT_RERANKER_TOP_K, DEFAULT_FINAL_TOP_K } from "@/lib/config";

export interface HybridSearchResult {
  chunk_text: string;
  score: number;
  source: "vector" | "keyword" | "both" | "graph";
  rerank_score?: number;
  metadata: unknown;
}

export interface HybridSearchOptions {
  vectorTopK?: number;
  keywordTopK?: number;
  graphTopK?: number;
  fusionTopK?: number;
  rerankerTopK?: number;
  finalTopK?: number;
  useReranker?: boolean;
  useGraph?: boolean;
  queryRewriteMode?: RewriteMode;
}

/**
 * Reciprocal Rank Fusion (RRF) — pluggable fusion algorithm.
 *
 * RRF score for each document:  Σ 1 / (k + rank)
 * where k is a smoothing constant (default 60).
 */
function reciprocalRankFusion(
  resultLists: Array<{ results: { chunk_text: string; metadata?: unknown }[]; label: "vector" | "keyword" | "graph" }>,
  k: number = RRF_K
): Map<string, { score: number; sources: Set<"vector" | "keyword" | "graph">; metadata: unknown }> {
  const scores = new Map<
    string,
    { score: number; sources: Set<"vector" | "keyword" | "graph">; metadata: unknown }
  >();

  for (const { results, label } of resultLists) {
    results.forEach((r, rank) => {
      const key = r.chunk_text;
      const existing = scores.get(key) ?? {
        score: 0,
        sources: new Set<"vector" | "keyword" | "graph">(),
        metadata: r.metadata,
      };
      existing.score += 1 / (k + rank + 1);
      existing.sources.add(label);
      scores.set(key, existing);
    });
  }

  return scores;
}

/**
 * Hybrid search: combines vector search and keyword search via RRF reranking,
 * with optional cross-encoder reranking for higher precision.
 *
 * Pipeline: vector + keyword search → RRF fusion → (optional) reranker → final results
 */
export async function hybridSearch(
  query: string,
  knowledgeBaseId: number,
  vectorTopK: number = DEFAULT_VECTOR_TOP_K,
  keywordTopK: number = DEFAULT_KEYWORD_TOP_K,
  finalTopK: number = DEFAULT_FINAL_TOP_K,
  options: HybridSearchOptions = {}
): Promise<HybridSearchResult[]> {
  const {
    fusionTopK = DEFAULT_FUSION_TOP_K,
    rerankerTopK = DEFAULT_RERANKER_TOP_K,
    graphTopK = 10,
    useReranker = false,
    useGraph = false,
    queryRewriteMode,
  } = options;

  // Optional: rewrite query for better retrieval
  let vectorQuery = query;
  let keywordQuery = query;

  if (queryRewriteMode) {
    const rewritten = await rewriteQuery(query, queryRewriteMode);

    if (queryRewriteMode === "hyde" && rewritten.hypotheticalAnswer) {
      // HyDE: use hypothetical answer embedding for vector search,
      // but keep original query for keyword search
      vectorQuery = rewritten.hypotheticalAnswer;
      keywordQuery = query;
    } else if (queryRewriteMode === "rewrite") {
      vectorQuery = rewritten.rewritten;
      keywordQuery = rewritten.rewritten;
    } else if (queryRewriteMode === "expand" && rewritten.subQueries) {
      // Expand: run searches for each sub-query and merge
      return expandSearch(query, rewritten.subQueries, knowledgeBaseId, vectorTopK, keywordTopK, finalTopK, options);
    }
  }

  // Run searches in parallel (vector + keyword, optionally graph)
  const searchPromises = [
    vectorSearch(vectorQuery, knowledgeBaseId, vectorTopK),
    keywordSearch(keywordQuery, knowledgeBaseId, keywordTopK),
  ] as const;

  const [vectorResults, keywordResults] = await Promise.all(searchPromises);

  // Optional: graph search (runs in parallel if enabled)
  let graphResults: GraphSearchResult[] = [];
  if (useGraph) {
    try {
      graphResults = await graphSearch(query, knowledgeBaseId, graphTopK);
    } catch (err) {
      console.error("Graph search failed, skipping:", err);
    }
  }

  // Fuse with RRF (2-way or 3-way depending on graph)
  const resultLists: Array<{ results: { chunk_text: string; metadata?: unknown }[]; label: "vector" | "keyword" | "graph" }> = [
    { results: vectorResults, label: "vector" },
    { results: keywordResults, label: "keyword" },
  ];
  if (graphResults.length > 0) {
    resultLists.push({ results: graphResults, label: "graph" });
  }

  const fused = reciprocalRankFusion(resultLists);

  // Sort by fused score, take fusionTopK
  const sorted = [...fused.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, useReranker ? fusionTopK : finalTopK);

  // Build result array
  const fusedResults: HybridSearchResult[] = sorted.map(
    ([chunk_text, { score, sources, metadata }]) => ({
      chunk_text,
      score,
      source: sources.size > 1 ? "both" : ([...sources][0] as "vector" | "keyword" | "graph"),
      metadata: metadata ?? null,
    })
  );

  // Optional: apply cross-encoder reranker for higher precision
  let finalResults: HybridSearchResult[];
  if (useReranker && fusedResults.length > 0) {
    const documents = fusedResults.map((r) => r.chunk_text);
    const rerankResults = await rerank(query, documents, rerankerTopK);

    finalResults = rerankResults.map((rr) => {
      const original = fusedResults[rr.index];
      return {
        chunk_text: original.chunk_text,
        score: original.score,
        source: original.source,
        rerank_score: rr.relevance_score,
        metadata: original.metadata,
      };
    });
  } else {
    finalResults = fusedResults.slice(0, finalTopK);
  }

  // Resolve child chunks → parent chunks
  finalResults = await resolveParentChunks(finalResults);

  return finalResults;
}

/**
 * Expand search: run hybrid search for each sub-query and merge results via RRF.
 */
async function expandSearch(
  originalQuery: string,
  subQueries: string[],
  knowledgeBaseId: number,
  vectorTopK: number,
  keywordTopK: number,
  finalTopK: number,
  options: HybridSearchOptions
): Promise<HybridSearchResult[]> {
  const { useReranker = false, fusionTopK = DEFAULT_FUSION_TOP_K, rerankerTopK = DEFAULT_RERANKER_TOP_K } = options;

  // Run searches for each sub-query in parallel
  const allResults = await Promise.all(
    subQueries.map(async (subQuery) => {
      const [vec, kw] = await Promise.all([
        vectorSearch(subQuery, knowledgeBaseId, vectorTopK),
        keywordSearch(subQuery, knowledgeBaseId, keywordTopK),
      ]);
      return { vec, kw };
    })
  );

  // Merge all results into a single RRF fusion
  const resultLists: Array<{ results: { chunk_text: string; metadata?: unknown }[]; label: "vector" | "keyword" | "graph" }> = [];
  for (const { vec, kw } of allResults) {
    resultLists.push({ results: vec, label: "vector" });
    resultLists.push({ results: kw, label: "keyword" });
  }

  const fused = reciprocalRankFusion(resultLists);
  const sorted = [...fused.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, useReranker ? fusionTopK : finalTopK);

  const fusedResults: HybridSearchResult[] = sorted.map(
    ([chunk_text, { score, sources, metadata }]) => ({
      chunk_text,
      score,
      source: sources.size > 1 ? "both" : ([...sources][0] as "vector" | "keyword" | "graph"),
      metadata: metadata ?? null,
    })
  );

  if (useReranker && fusedResults.length > 0) {
    const documents = fusedResults.map((r) => r.chunk_text);
    const rerankResults = await rerank(originalQuery, documents, rerankerTopK);
    return resolveParentChunks(rerankResults.map((rr) => {
      const original = fusedResults[rr.index];
      return {
        chunk_text: original.chunk_text,
        score: original.score,
        source: original.source,
        rerank_score: rr.relevance_score,
        metadata: original.metadata,
      };
    }));
  }

  return resolveParentChunks(fusedResults.slice(0, finalTopK));
}

/**
 * Resolve child chunks to their parent chunks.
 *
 * Strategy: for each child chunk, APPEND the parent's text rather than replace.
 * This preserves the original result count and ranking while enriching context.
 * Multiple children mapping to the same parent will be deduplicated —
 * only the highest-scoring child is kept, with the parent text appended.
 */
async function resolveParentChunks(
  results: HybridSearchResult[]
): Promise<HybridSearchResult[]> {
  if (results.length === 0) return results;

  const childTexts = results.map((r) => r.chunk_text);

  const childRows = await prisma.$queryRawUnsafe<
    { chunk_text: string; parent_chunk_id: string }[]
  >(
    `SELECT chunk_text, parent_chunk_id FROM document_chunks
     WHERE chunk_text = ANY($1::text[]) AND parent_chunk_id IS NOT NULL`,
    childTexts
  );

  if (childRows.length === 0) return results;

  const childToParent = new Map<string, string>();
  for (const row of childRows) {
    childToParent.set(row.chunk_text, row.parent_chunk_id);
  }

  const parentIds = [...new Set(childToParent.values())];

  const parentRows = await prisma.$queryRawUnsafe<
    { id: string; chunk_text: string }[]
  >(
    `SELECT id, chunk_text FROM document_chunks WHERE id = ANY($1::uuid[])`,
    parentIds
  );

  const parentTextMap = new Map<string, string>();
  for (const row of parentRows) {
    parentTextMap.set(row.id, row.chunk_text);
  }

  // Deduplicate: if multiple children map to the same parent,
  // keep only the highest-scoring one, with parent text appended.
  const deduped = new Map<string, HybridSearchResult>();
  const nonChildResults: HybridSearchResult[] = [];

  for (const result of results) {
    const parentId = childToParent.get(result.chunk_text);
    if (parentId && parentTextMap.has(parentId)) {
      const parentText = parentTextMap.get(parentId)!;
      const existing = deduped.get(parentId);
      if (!existing || result.score > existing.score) {
        deduped.set(parentId, {
          ...result,
          chunk_text: parentText,
          source: result.source,
        });
      }
    } else {
      nonChildResults.push(result);
    }
  }

  return [...deduped.values(), ...nonChildResults]
    .sort((a, b) => (b.rerank_score ?? b.score) - (a.rerank_score ?? a.score));
}
