/**
 * Centralized configuration for the RAG pipeline.
 * All model URLs, names, and default parameters are defined here.
 */

// --- Service URLs ---
export const OLLAMA_BASE_URL =
  process.env.LOCAL_MODEL_BASE_URL ?? "http://localhost:11434/api";

export const RERANKER_URL =
  process.env.RERANKER_URL ?? "http://localhost:8081";

// --- Model names ---
export const EMBEDDING_MODEL = "bge-m3:latest";
export const RERANKER_MODEL = "BAAI/bge-reranker-v2-m3";
export const GRAPH_EXTRACT_MODEL =
  process.env.LOCAL_GRAPH_EXTRACT_MODEL ?? "qwen3.5:4b";

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const GRAPH_BUILD_CONCURRENCY = readPositiveIntEnv(
  "LOCAL_GRAPH_BUILD_CONCURRENCY",
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
