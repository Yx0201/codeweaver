import type { TraceStep } from "./trace";

/**
 * Shared shape for RAG citation references — written by the chat route,
 * persisted on `conversation_message.metadata`, and consumed by the chat UI
 * to render the per-message reference list + preview dialog.
 */
export interface MessageReference {
  /** 1-based index that matches the [N] markers in the assistant text. */
  index: number;
  /** UUID of the source chunk (document_chunks.id or graph_chunks.id). */
  chunkId: string;
  /** UUID of the source file. */
  fileId: string;
  /** Filename used as the human-readable source label. */
  filename: string;
  /** Full chunk text — used for the in-place preview dialog. */
  chunkText: string;
  /** ~15-char teaser used as the list item label. */
  snippet: string;
  /** Where this chunk came from in the retrieval pipeline. */
  source: "vector" | "keyword" | "both" | "graph";
  /** RRF fusion score (higher = more channels / better ranks agreed). */
  fusionScore?: number;
  /** Cross-encoder rerank score (only set when reranking ran, 0–1). */
  rerankScore?: number;
}

/**
 * One entry in an Agent-mode thinking chain — a single `retrieveKnowledge`
 * tool call. Persisted so the agent's decision timeline rehydrates on refresh
 * (live `tool-*` parts are session-transient, just like the pipeline's
 * `data-*` parts).
 */
export interface AgentTraceStep {
  query: string;
  searchMode: string;
  count: number;
  status: "done" | "error";
  error?: string;
}

/**
 * Shape stored at `conversation_message.metadata` for assistant rows.
 * Keep flat + plain JSON so it round-trips cleanly through Prisma's Json
 * column and `JSON.stringify`/`JSON.parse` on the wire.
 */
export interface AssistantMessageMetadata {
  references?: MessageReference[];
  /** Retrieval pipeline trace — one entry per pipeline step (pipeline mode). */
  trace?: TraceStep[];
  /** Agent tool-call timeline — one entry per `retrieveKnowledge` call (agent mode). */
  agentTrace?: AgentTraceStep[];
}

/** Take the first ~N characters of `text`, stripping noisy whitespace. */
export function buildSnippet(text: string, max = 30): string {
  // Collapse all whitespace to single spaces so a multi-paragraph chunk still
  // reads as a single line in the citation list.
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max).trimEnd() + "…";
}

/**
 * Type guard: detect whether `metadata` from Prisma looks like an assistant
 * message payload with references. We can't rely on the Json column's
 * structural shape so anything unexpected falls back to `undefined`.
 *
 * The `trace` field is passed through if present and well-formed, even when
 * there are no references (a retrieval run that returned 0 chunks still has
 * a trace worth showing).
 */
export function readAssistantMetadata(
  metadata: unknown
): AssistantMessageMetadata | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const m = metadata as {
    references?: unknown;
    trace?: unknown;
    agentTrace?: unknown;
  };

  const references = Array.isArray(m.references)
    ? m.references.filter(
        (r): r is MessageReference =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as MessageReference).index === "number" &&
          typeof (r as MessageReference).chunkId === "string" &&
          typeof (r as MessageReference).chunkText === "string"
      )
    : [];

  const trace = Array.isArray(m.trace)
    ? m.trace.filter(
        (s): s is TraceStep =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as TraceStep).type === "string" &&
          typeof (s as TraceStep).status === "string"
      )
    : undefined;

  const agentTrace = Array.isArray(m.agentTrace)
    ? m.agentTrace.filter(
        (s): s is AgentTraceStep =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as AgentTraceStep).query === "string" &&
          typeof (s as AgentTraceStep).count === "number"
      )
    : undefined;

  if (references.length > 0) {
    return {
      references,
      ...(trace ? { trace } : {}),
      ...(agentTrace ? { agentTrace } : {}),
    };
  }
  if (trace && trace.length > 0) {
    return { trace };
  }
  if (agentTrace && agentTrace.length > 0) {
    return { agentTrace };
  }
  return undefined;
}
