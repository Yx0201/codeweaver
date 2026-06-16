/**
 * Centralized configuration for the RAG pipeline.
 * All model URLs, names, and default parameters are defined here.
 *
 * Single source: .env.local → process.env → this file → all consumers.
 */

// --- Helper ---
function readPositiveIntEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readFloatEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// --- Zenmux (cloud OpenAI-compatible gateway) ---
/**
 * Primary cloud API endpoint for chat, embeddings, and graph extraction.
 * Falls back to the RAGAS_EVAL_* vars so existing .env.local files keep
 * working without any changes.
 */
export const ZENMUX_BASE_URL =
  process.env.ZENMUX_BASE_URL ??
  process.env.RAGAS_EVAL_BASE_URL ??
  "https://zenmux.ai/api/v1";

export const ZENMUX_API_KEY =
  process.env.ZENMUX_API_KEY ??
  process.env.RAGAS_EVAL_API_KEY ??
  "";

// --- Cloud model names ---
export const CHAT_MODEL =
  process.env.CHAT_MODEL ?? "deepseek/deepseek-v4-flash";
export const TITLE_MODEL =
  process.env.TITLE_MODEL ?? "deepseek/deepseek-v4-flash";
export const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ?? "openai/text-embedding-3-small";
/** Dimensions for text-embedding-3-small (matches vector(1024) DB column). */
export const EMBEDDING_DIMENSIONS = readPositiveIntEnv("EMBEDDING_DIMENSIONS", 1024);

export const QUERY_REWRITE_MODEL =
  process.env.QUERY_REWRITE_MODEL ?? "deepseek/deepseek-v4-flash";

// --- Reranker (Jina AI cloud — Jina-compatible /rerank API) ---
export const JINA_API_KEY = process.env.JINA_API_KEY ?? "";
/** Jina reranker endpoint (cloud). Falls back to a local Infinity service
 *  via RERANKER_URL if JINA_API_KEY is not set. */
export const JINA_RERANKER_URL = "https://api.jina.ai/v1/rerank";
export const RERANKER_MODEL =
  process.env.RERANKER_MODEL ?? "jina-reranker-v2-base-multilingual";
/** Legacy local reranker URL — only used when JINA_API_KEY is absent. */
export const RERANKER_URL =
  process.env.RERANKER_URL ?? "http://127.0.0.1:8081";

// --- Ollama (local — only used by graph extractor fallback when no cloud key) ---
/** Base Ollama URL without trailing slash or /api suffix */
export const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
/** Ollama API URL (appends /api). Used by graph extractor local fallback. */
export const OLLAMA_API_URL = `${OLLAMA_BASE_URL}/api`;
export const GRAPH_EXTRACT_MODEL =
  process.env.GRAPH_EXTRACT_MODEL ?? "qwen3.5:4b";

// --- Graph extraction provider (cloud OpenAI-compatible endpoint) ---
/**
 * When an API key is available, graph entity/relation extraction uses a cloud
 * OpenAI-compatible endpoint (much faster than local small models and allows
 * real concurrency). Falls back to local Ollama when no key is configured or
 * GRAPH_EXTRACT_USE_CLOUD=false.
 */
export const GRAPH_EXTRACT_API_BASE_URL =
  process.env.GRAPH_EXTRACT_API_BASE_URL ?? ZENMUX_BASE_URL;
export const GRAPH_EXTRACT_API_KEY =
  process.env.GRAPH_EXTRACT_API_KEY ?? ZENMUX_API_KEY;
export const GRAPH_EXTRACT_CLOUD_MODEL =
  process.env.GRAPH_EXTRACT_CLOUD_MODEL ??
  process.env.RAGAS_EVAL_MODEL ??
  "deepseek/deepseek-v4-flash";
export const GRAPH_EXTRACT_USE_CLOUD =
  (process.env.GRAPH_EXTRACT_USE_CLOUD ??
    (GRAPH_EXTRACT_API_KEY ? "true" : "false")) === "true";

// --- Concurrency ---
/** Initial graph-build concurrency (adaptive: AIMD adjusts per batch). */
export const GRAPH_BUILD_CONCURRENCY = readPositiveIntEnv(
  "GRAPH_BUILD_CONCURRENCY",
  GRAPH_EXTRACT_USE_CLOUD ? 8 : 2
);
export const GRAPH_BUILD_MIN_CONCURRENCY = readPositiveIntEnv(
  "GRAPH_BUILD_MIN_CONCURRENCY",
  1
);
export const GRAPH_BUILD_MAX_CONCURRENCY = readPositiveIntEnv(
  "GRAPH_BUILD_MAX_CONCURRENCY",
  GRAPH_EXTRACT_USE_CLOUD ? 24 : 4
);

/** Batch size for embedding generation during ingestion. */
export const EMBEDDING_BATCH_SIZE = readPositiveIntEnv(
  "EMBEDDING_BATCH_SIZE",
  32
);

// --- Default Top-K parameters ---
export const DEFAULT_VECTOR_TOP_K = readPositiveIntEnv("VECTOR_TOP_K", 50);
export const DEFAULT_KEYWORD_TOP_K = readPositiveIntEnv("KEYWORD_TOP_K", 50);
export const DEFAULT_FUSION_TOP_K = readPositiveIntEnv("FUSION_TOP_K", 30);
export const DEFAULT_RERANKER_TOP_K = readPositiveIntEnv("RERANKER_TOP_K", 10);
export const DEFAULT_FINAL_TOP_K = readPositiveIntEnv("FINAL_TOP_K", 10);

/** Top-K graph chunks fed into hybrid RRF fusion as the third channel. */
export const DEFAULT_GRAPH_CHANNEL_TOP_K = readPositiveIntEnv(
  "GRAPH_CHANNEL_TOP_K",
  10
);

// --- RRF smoothing constant ---
export const RRF_K = readPositiveIntEnv("RRF_K", 60);

// --- Relevance thresholds ---
/**
 * Drop reranked results whose cross-encoder score is below this value.
 * Keeps at least MIN_RERANK_KEEP results regardless, to protect recall.
 * Set to 0 to disable.
 */
export const MIN_RERANK_SCORE = readFloatEnv("MIN_RERANK_SCORE", 0.05);
export const MIN_RERANK_KEEP = readPositiveIntEnv("MIN_RERANK_KEEP", 3);

/**
 * Minimum cosine similarity for a query entity to match a graph entity
 * via name embedding (graph retrieval entity linking).
 */
export const GRAPH_ENTITY_MATCH_SIMILARITY = readFloatEnv(
  "GRAPH_ENTITY_MATCH_SIMILARITY",
  0.6
);

/**
 * Minimum name-embedding cosine similarity to merge a newly extracted
 * entity into an existing one (entity deduplication during ingestion).
 * Kept high to avoid merging distinct characters with similar names.
 */
export const ENTITY_MERGE_SIMILARITY = readFloatEnv(
  "ENTITY_MERGE_SIMILARITY",
  0.92
);
