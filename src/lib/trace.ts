import { nanoid } from "nanoid";

export type TraceStepType =
  | "query_rewrite"
  | "vector_search"
  | "keyword_search"
  | "graph_search"
  | "rrf_fusion"
  | "rerank"
  | "resolve_parents"
  | "expand_search"
  | "graph_only_search";

export type TraceStepStatus = "done" | "error" | "skipped";

export interface TraceStep {
  id: string;
  type: TraceStepType;
  status: TraceStepStatus;
  durationMs: number;
  /** Step-specific payload (counts, scores, rewritten text, error message, …). */
  data?: Record<string, unknown>;
  /** Nested steps — e.g. expand_search fans out one child per sub-query. */
  children?: TraceStep[];
}

export type TraceCallback = (step: TraceStep) => void;

function now(): number {
  // Date.now is fine here — trace helpers run at request time in route handlers,
  // not inside workflow scripts where Date.now would throw.
  return Date.now();
}

/**
 * Run `fn`, time it, and emit a single TraceStep on completion.
 *
 * `fn` returns `{ result, data? }`. If `fn` throws, an `error` step is emitted
 * with `data.error` and the error re-thrown so the caller's own handling runs.
 * No-op when `onTrace` is not provided.
 */
export async function withTrace<T>(
  type: TraceStepType,
  fn: () => Promise<{ result: T; data?: Record<string, unknown> }>,
  onTrace?: TraceCallback
): Promise<T> {
  if (!onTrace) {
    const { result } = await fn();
    return result;
  }

  const start = now();
  try {
    const { result, data } = await fn();
    onTrace({
      id: nanoid(8),
      type,
      status: "done",
      durationMs: now() - start,
      data,
    });
    return result;
  } catch (err) {
    onTrace({
      id: nanoid(8),
      type,
      status: "error",
      durationMs: now() - start,
      data: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

/**
 * Emit a step directly — for paths that don't fit the withTrace wrapper
 * (e.g. a silent fallback that still returns a value but should be flagged).
 */
export function emitTrace(
  type: TraceStepType,
  status: TraceStepStatus,
  durationMs: number,
  data?: Record<string, unknown>,
  onTrace?: TraceCallback
): void {
  if (!onTrace) return;
  onTrace({ id: nanoid(8), type, status, durationMs, data });
}

/** Time a sync/async block and return the elapsed milliseconds. */
export function timed<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }>;
export function timed<T>(fn: () => T): { result: T; durationMs: number };
export function timed<T>(
  fn: () => T | Promise<T>
): { result: T; durationMs: number } | Promise<{ result: T; durationMs: number }> {
  const start = now();
  const result = fn();
  if (result instanceof Promise) {
    return result.then((r) => ({ result: r, durationMs: now() - start }));
  }
  return { result, durationMs: now() - start };
}
