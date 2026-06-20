import type { UIMessage } from "ai";
import type { RetrievalMode } from "@/lib/search-service";
import type { TraceStep, TraceStepType } from "@/lib/trace";
import type { AssistantMessageMetadata, MessageReference } from "@/lib/citations";

/**
 * Custom `data-*` parts streamed from the chat route so the client can render
 * the retrieval pipeline as a live "thinking chain" — distinct from the model's
 * own reasoning, which arrives as standard `reasoning` parts.
 *
 *  - plan      : sent once at the very start; carries the active retrieval path
 *                and the opening narration line.
 *  - trace     : one per completed pipeline step (keyword/vector/graph/…), each
 *                written with its `step.id` so it reconciles instead of stacking.
 *  - citations : the reference list, known right after retrieval (rendered by the
 *                UI only after the answer finishes).
 *  - ready     : "信息收集完毕" marker emitted between retrieval and the answer.
 */
export type ChatDataParts = {
  plan: { mode: RetrievalMode; intro: string };
  trace: TraceStep;
  citations: MessageReference[];
  ready: { contextCount: number };
};

export type ChatUIMessage = UIMessage<AssistantMessageMetadata, ChatDataParts>;

/** Opening narration for the thinking chain, keyed to the retrieval path. */
export function buildIntro(mode: RetrievalMode): string {
  switch (mode) {
    case "graph":
      return "这是一个适合图谱的问题,我将基于知识图谱检索相关实体与关系,召回信息后作答。";
    case "fast":
      return "我将通过关键词与向量两路快速召回信息,然后作答。";
    case "hybrid":
    default:
      return "这是一个需要综合检索的问题,我将通过关键词、向量、图谱三路召回信息,融合并重排序后作答。";
  }
}

/**
 * The fixed step skeleton the client renders for each retrieval path. Trace
 * events arrive in completion order (the three channels run in parallel), so
 * the UI lays out these stages up front and flips each to "done" as its
 * matching `data-trace` lands. `query_rewrite` is optional (only when enabled),
 * so it is not part of the skeleton — it is inserted whenever it arrives.
 */
export function expectedStages(mode: RetrievalMode): TraceStepType[] {
  switch (mode) {
    case "graph":
      return ["graph_only_search"];
    case "fast":
      return ["keyword_search", "vector_search", "rrf_fusion", "resolve_parents"];
    case "hybrid":
    default:
      return [
        "keyword_search",
        "vector_search",
        "graph_search",
        "rrf_fusion",
        "rerank",
        "resolve_parents",
      ];
  }
}
