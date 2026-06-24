import { tool } from "ai";
import { z } from "zod";
import { searchKnowledgeBase, type RetrievalMode } from "@/lib/search-service";
import type { HybridSearchResult } from "@/lib/hybrid-search";
import type { AgentTraceStep, MessageReference } from "@/lib/citations";

/**
 * Factory for the Agent-mode `retrieveKnowledge` tool.
 *
 * The tool is a thin shell over the existing `searchKnowledgeBase` engine —
 * RRF fusion, reranking and parent-chunk resolution stay as deterministic
 * internals. What changes is WHO decides to retrieve and with what query: the
 * model, at runtime, instead of a fixed pre-generation pipeline.
 *
 * Three closures are injected by the route handler:
 *  - `citations`      : the global, request-scoped reference list. Each call
 *                       appends with globally-incrementing indices so the
 *                       `[N]` markers the model emits line up with the final
 *                       citation UI across multiple tool calls.
 *  - `buildRefs`      : maps raw search rows to `MessageReference` (reuses the
 *                       pipeline's `toReferences` so the shapes stay identical).
 *  - `onCitations`    : streams the updated citation list to the client after
 *                       every call (the list grows over the loop; the UI takes
 *                       the latest `data-citations` part).
 *  - `onToolCall`     : records one `AgentTraceStep` per call for persistence
 *                       (the live `tool-*` parts don't survive a refresh).
 */
export interface CreateRetrieveToolArgs {
  kbId: number;
  citations: MessageReference[];
  buildRefs: (results: HybridSearchResult[]) => MessageReference[];
  onCitations: (refs: MessageReference[]) => void;
  onToolCall: (step: AgentTraceStep) => void;
}

export function createRetrieveTool({
  kbId,
  citations,
  buildRefs,
  onCitations,
  onToolCall,
}: CreateRetrieveToolArgs) {
  return tool({
    description:
      "在知识库中检索相关片段。需要时自主改写查询、选择检索通道、多次调用直到信息充分。返回带全局引用编号 number 的片段,回答时用 [number] 标注来源。",
    inputSchema: z.object({
      query: z
        .string()
        .describe("检索查询。可改写、具体化或聚焦,以提升召回质量。"),
      searchMode: z
        .enum(["hybrid", "graph", "fast"])
        .optional()
        .describe(
          "检索通道:hybrid=关键词+向量+图谱三路融合并重排(默认,适合综合问题);graph=基于知识图谱(适合实体/关系问题);fast=关键词+向量(速度优先,无重排)。"
        ),
    }),
    execute: async ({ query, searchMode }) => {
      const mode: RetrievalMode = searchMode ?? "hybrid";
      try {
        const results = await searchKnowledgeBase(query, kbId, mode, {});
        // Assign GLOBAL indices: each chunk gets the next number after the
        // current citation list length, so numbers are continuous across calls.
        const start = citations.length;
        const localRefs = buildRefs(results);
        const chunks = results.map((r, i) => {
          const ref: MessageReference = { ...localRefs[i], index: start + i + 1 };
          citations.push(ref);
          return {
            number: ref.index,
            content: r.chunk_text,
            score: r.score,
            source: r.source,
          };
        });
        // Stream the full, updated citation list so the UI stays in sync.
        onCitations(citations);
        onToolCall({ query, searchMode: mode, count: chunks.length, status: "done" });
        return { chunks, count: chunks.length, searchMode: mode };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        onToolCall({ query, searchMode: mode, count: 0, status: "error", error });
        return { chunks: [], count: 0, searchMode: mode, error };
      }
    },
  });
}
