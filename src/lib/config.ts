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

// --- Service URLs ---
/** Base Ollama URL without trailing slash or /api suffix */
export const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

/** Ollama API URL (appends /api). Used by AI SDK provider and raw fetch calls. */
export const OLLAMA_API_URL = `${OLLAMA_BASE_URL}/api`;

// Use 127.0.0.1 (not localhost): Node's fetch may resolve localhost to ::1
// while uvicorn binds IPv4 0.0.0.0 only, causing silent reranker fallback.
export const RERANKER_URL =
  process.env.RERANKER_URL ?? "http://127.0.0.1:8081";

// --- Model names ---
export const CHAT_MODEL = process.env.CHAT_MODEL ?? "qwen3.5:9b";
export const TITLE_MODEL = process.env.TITLE_MODEL ?? "qwen3:0.6b";
export const GRAPH_EXTRACT_MODEL =
  process.env.GRAPH_EXTRACT_MODEL ?? "qwen3.5:4b";
export const QUERY_REWRITE_MODEL =
  process.env.QUERY_REWRITE_MODEL ?? "qwen3:0.6b";
export const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ?? "bge-m3:latest";
export const RERANKER_MODEL =
  process.env.RERANKER_MODEL ?? "BAAI/bge-reranker-v2-m3";

// --- Graph extraction provider (cloud OpenAI-compatible endpoint) ---
/**
 * When an API key is available, graph entity/relation extraction uses a cloud
 * OpenAI-compatible endpoint (much faster than local small models and allows
 * real concurrency). Falls back to local Ollama when no key is configured or
 * GRAPH_EXTRACT_USE_CLOUD=false.
 */
export const GRAPH_EXTRACT_API_BASE_URL =
  process.env.GRAPH_EXTRACT_API_BASE_URL ??
  process.env.RAGAS_EVAL_BASE_URL ??
  "https://zenmux.ai/api/v1";
export const GRAPH_EXTRACT_API_KEY =
  process.env.GRAPH_EXTRACT_API_KEY ?? process.env.RAGAS_EVAL_API_KEY ?? "";
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
