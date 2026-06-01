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

// --- Service URLs ---
/** Base Ollama URL without trailing slash or /api suffix */
export const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

/** Ollama API URL (appends /api). Used by AI SDK provider and raw fetch calls. */
export const OLLAMA_API_URL = `${OLLAMA_BASE_URL}/api`;

export const RERANKER_URL =
  process.env.RERANKER_URL ?? "http://localhost:8081";

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

// --- Concurrency ---
export const GRAPH_BUILD_CONCURRENCY = readPositiveIntEnv(
  "GRAPH_BUILD_CONCURRENCY",
  2
);

// --- Default Top-K parameters ---
export const DEFAULT_VECTOR_TOP_K = 50;
export const DEFAULT_KEYWORD_TOP_K = 50;
export const DEFAULT_FUSION_TOP_K = 30;
export const DEFAULT_RERANKER_TOP_K = 10;
export const DEFAULT_FINAL_TOP_K = 10;

// --- RRF smoothing constant ---
export const RRF_K = 60;
