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
}

/**
 * Shape stored at `conversation_message.metadata` for assistant rows.
 * Keep flat + plain JSON so it round-trips cleanly through Prisma's Json
 * column and `JSON.stringify`/`JSON.parse` on the wire.
 */
export interface AssistantMessageMetadata {
  references?: MessageReference[];
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
 */
export function readAssistantMetadata(
  metadata: unknown
): AssistantMessageMetadata | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const m = metadata as { references?: unknown };
  if (!Array.isArray(m.references)) return undefined;
  const references = m.references.filter(
    (r): r is MessageReference =>
      typeof r === "object" &&
      r !== null &&
      typeof (r as MessageReference).index === "number" &&
      typeof (r as MessageReference).chunkId === "string" &&
      typeof (r as MessageReference).chunkText === "string"
  );
  return references.length > 0 ? { references } : undefined;
}
