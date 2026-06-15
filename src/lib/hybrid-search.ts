import { vectorSearch } from "@/lib/vector-search";
import { keywordSearch } from "@/lib/keyword-search";
import { graphSearch } from "@/lib/graph-search";
import { rerank } from "@/lib/reranker";
import { rewriteQuery, type RewriteMode } from "@/lib/query-rewriter";
import { prisma } from "@/lib/prisma";
import {
  RRF_K,
  DEFAULT_VECTOR_TOP_K,
  DEFAULT_KEYWORD_TOP_K,
  DEFAULT_FUSION_TOP_K,
  DEFAULT_RERANKER_TOP_K,
  DEFAULT_FINAL_TOP_K,
  DEFAULT_GRAPH_CHANNEL_TOP_K,
  MIN_RERANK_SCORE,
  MIN_RERANK_KEEP,
} from "@/lib/config";

type ChannelLabel = "vector" | "keyword" | "graph";

export interface HybridSearchResult {
  chunk_id: string;
  file_id: string;
  filename: string;
  chunk_text: string;
  score: number;
  source: ChannelLabel | "both";
  rerank_score?: number;
  metadata: unknown;
}

interface RrfFusedEntry {
  chunk_id: string;
  file_id: string;
  filename: string;
  chunk_text: string;
  score: number;
  sources: Set<ChannelLabel>;
  metadata: unknown;
}

export interface HybridSearchOptions {
  vectorTopK?: number;
  keywordTopK?: number;
  fusionTopK?: number;
  rerankerTopK?: number;
  finalTopK?: number;
  useReranker?: boolean;
  /** Include graph retrieval as a third RRF channel. */
  useGraph?: boolean;
  graphTopK?: number;
  queryRewriteMode?: RewriteMode;
}

interface ChannelResult {
  chunk_id: string;
  file_id: string;
  filename: string;
  chunk_text: string;
  metadata?: unknown;
}

/**
 * Reciprocal Rank Fusion (RRF) — pluggable fusion algorithm.
 *
 * RRF score for each document:  Σ 1 / (k + rank)
 * where k is a smoothing constant (default 60).
 *
 * Fusion key is `chunk_id` so the same chunk retrieved by multiple
 * channels (or multiple sub-queries) accumulates its rank scores.
 */
function reciprocalRankFusion(
  resultLists: Array<{
    results: ChannelResult[];
    label: ChannelLabel;
  }>,
  k: number = RRF_K
): Map<string, RrfFusedEntry> {
  const scores = new Map<string, RrfFusedEntry>();

  for (const { results, label } of resultLists) {
    results.forEach((r, rank) => {
      const key = r.chunk_id;
      const existing =
        scores.get(key) ??
        ({
          chunk_id: r.chunk_id,
          file_id: r.file_id,
          filename: r.filename,
          chunk_text: r.chunk_text,
          score: 0,
          sources: new Set<ChannelLabel>(),
          metadata: r.metadata,
        } as RrfFusedEntry);
      existing.score += 1 / (k + rank + 1);
      existing.sources.add(label);
      scores.set(key, existing);
    });
  }

  return scores;
}

function fusedEntryToResult(entry: RrfFusedEntry): HybridSearchResult {
  return {
    chunk_id: entry.chunk_id,
    file_id: entry.file_id,
    filename: entry.filename,
    chunk_text: entry.chunk_text,
    score: entry.score,
    source:
      entry.sources.size > 1 ? "both" : ([...entry.sources][0] as ChannelLabel),
    metadata: entry.metadata ?? null,
  };
}

/**
 * Fuse channel results, optionally rerank with a cross-encoder, apply the
 * low-score cutoff, then resolve child chunks to parents.
 */
async function fuseAndFinalize(
  query: string,
  resultLists: Array<{ results: ChannelResult[]; label: ChannelLabel }>,
  finalTopK: number,
  options: Pick<
    HybridSearchOptions,
    "useReranker" | "fusionTopK" | "rerankerTopK"
  >
): Promise<HybridSearchResult[]> {
  const {
    useReranker = false,
    fusionTopK = DEFAULT_FUSION_TOP_K,
    rerankerTopK = DEFAULT_RERANKER_TOP_K,
  } = options;

  const fused = reciprocalRankFusion(resultLists);

  const fusedResults: HybridSearchResult[] = [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, useReranker ? fusionTopK : finalTopK)
    .map(fusedEntryToResult);

  let finalResults: HybridSearchResult[];
  if (useReranker && fusedResults.length > 0) {
    const documents = fusedResults.map((r) => r.chunk_text);
    const rerankResults = await rerank(query, documents, rerankerTopK);

    const reranked = rerankResults.map((rr) => ({
      ...fusedResults[rr.index],
      rerank_score: rr.relevance_score,
    }));

    // Drop clearly irrelevant results so they never reach the LLM context
    // (protects faithfulness), but always keep a minimum to protect recall.
    finalResults =
      MIN_RERANK_SCORE > 0
        ? reranked.filter(
            (r, i) =>
              i < MIN_RERANK_KEEP || (r.rerank_score ?? 0) >= MIN_RERANK_SCORE
          )
        : reranked;
  } else {
    finalResults = fusedResults.slice(0, finalTopK);
  }

  return resolveParentChunks(finalResults);
}

/**
 * Hybrid search: vector + keyword (+ optional graph) retrieval fused via RRF,
 * with optional cross-encoder reranking for higher precision.
 *
 * Pipeline: multi-channel search → RRF fusion → (optional) reranker
 *           → low-score cutoff → child→parent resolution → final results
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
    useGraph = false,
    graphTopK = DEFAULT_GRAPH_CHANNEL_TOP_K,
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

  // Run all retrieval channels in parallel. Graph search may fail
  // independently (e.g. no graph built yet) without breaking the pipeline.
  const [vectorResults, keywordResults, graphResults] = await Promise.all([
    vectorSearch(vectorQuery, knowledgeBaseId, vectorTopK),
    keywordSearch(keywordQuery, knowledgeBaseId, keywordTopK),
    useGraph
      ? graphSearch(query, knowledgeBaseId, graphTopK).catch((err) => {
          console.error("Graph channel failed, continuing without it:", err);
          return [];
        })
      : Promise.resolve([]),
  ]);

  const resultLists: Array<{ results: ChannelResult[]; label: ChannelLabel }> =
    [
      { results: vectorResults, label: "vector" },
      { results: keywordResults, label: "keyword" },
    ];
  if (graphResults.length > 0) {
    resultLists.push({ results: graphResults, label: "graph" });
  }

  return fuseAndFinalize(query, resultLists, finalTopK, options);
}

/**
 * Expand search: run hybrid search for the original query AND each sub-query,
 * then merge all results via a single RRF fusion.
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
  // Always include the original query — sub-queries complement it,
  // they should not replace it.
  const queries = [originalQuery, ...subQueries.filter((q) => q !== originalQuery)];

  const allResults = await Promise.all(
    queries.map(async (q) => {
      const [vec, kw] = await Promise.all([
        vectorSearch(q, knowledgeBaseId, vectorTopK),
        keywordSearch(q, knowledgeBaseId, keywordTopK),
      ]);
      return { vec, kw };
    })
  );

  const resultLists: Array<{ results: ChannelResult[]; label: ChannelLabel }> =
    [];
  for (const { vec, kw } of allResults) {
    resultLists.push({ results: vec, label: "vector" });
    resultLists.push({ results: kw, label: "keyword" });
  }

  if (options.useGraph) {
    const graphResults = await graphSearch(
      originalQuery,
      knowledgeBaseId,
      options.graphTopK ?? DEFAULT_GRAPH_CHANNEL_TOP_K
    ).catch(() => []);
    if (graphResults.length > 0) {
      resultLists.push({ results: graphResults, label: "graph" });
    }
  }

  return fuseAndFinalize(originalQuery, resultLists, finalTopK, options);
}

/**
 * Resolve child chunks to their parent chunks.
 *
 * Multiple children mapping to the same parent are deduplicated —
 * only the highest-scoring child is kept, promoted to the parent text.
 * Results that are not document child chunks (parents, graph chunks)
 * pass through unchanged.
 */
async function resolveParentChunks(
  results: HybridSearchResult[]
): Promise<HybridSearchResult[]> {
  if (results.length === 0) return results;

  const chunkIds = results.map((r) => r.chunk_id);

  const childRows = await prisma.$queryRawUnsafe<
    { id: string; parent_chunk_id: string }[]
  >(
    `SELECT id, parent_chunk_id FROM document_chunks
     WHERE id = ANY($1::uuid[]) AND parent_chunk_id IS NOT NULL`,
    chunkIds
  );

  if (childRows.length === 0) return results;

  const childToParent = new Map<string, string>();
  for (const row of childRows) {
    childToParent.set(row.id, row.parent_chunk_id);
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

  // Deduplicate: if multiple children map to the same parent, keep only the
  // highest-scoring one. When we promote a child to its parent we ALSO have
  // to swap the chunk_id, otherwise the citation UI would point at the
  // (smaller) child row instead of the displayed parent text.
  const deduped = new Map<string, HybridSearchResult>();
  const nonChildResults: HybridSearchResult[] = [];

  for (const result of results) {
    const parentId = childToParent.get(result.chunk_id);
    if (parentId && parentTextMap.has(parentId)) {
      const parentText = parentTextMap.get(parentId)!;
      const existing = deduped.get(parentId);
      if (
        !existing ||
        (result.rerank_score ?? result.score) >
          (existing.rerank_score ?? existing.score)
      ) {
        deduped.set(parentId, {
          ...result,
          chunk_id: parentId,
          chunk_text: parentText,
        });
      }
    } else {
      nonChildResults.push(result);
    }
  }

  return [...deduped.values(), ...nonChildResults]
    .sort((a, b) => (b.rerank_score ?? b.score) - (a.rerank_score ?? a.score));
}
