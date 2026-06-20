"use client";

import { useState } from "react";
import {
  ChevronDown,
  Sparkles,
  CircleCheck,
  CircleAlert,
  CircleSlash,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TraceStep, TraceStepStatus, TraceStepType } from "@/lib/trace";
import type { RetrievalMode } from "@/lib/search-service";
import { expectedStages } from "@/lib/chat-stream";

interface ThinkingChainProps {
  /** Opening narration (from the data-plan part); absent on rehydration. */
  intro?: string;
  /** Active retrieval path — drives the step skeleton; absent on rehydration. */
  mode?: RetrievalMode;
  /** Pipeline steps received so far (live data parts or persisted metadata). */
  steps: TraceStep[];
  /** The model's own reasoning text (standard reasoning parts). */
  reasoningText: string;
  /** True while this message is still being generated. */
  streaming?: boolean;
  /** True once retrieval is done ("信息收集完毕"); always true when not streaming. */
  ready?: boolean;
}

/**
 * The borderless "thinking chain" shown above an assistant answer. It weaves
 * the retrieval pipeline (a templated narration + a live step timeline) together
 * with the model's real reasoning into one continuous block.
 *
 * While streaming it stays expanded so the user watches it think; once done it
 * collapses to a one-line summary (user can re-expand). All text is rendered as
 * plain text — reasoning/step data originate from LLM output, never as HTML.
 */
export function ThinkingChain({
  intro,
  mode,
  steps,
  reasoningText,
  streaming,
  ready,
}: ThinkingChainProps) {
  const [override, setOverride] = useState<boolean | null>(null);
  const expanded = override ?? !!streaming;

  const hasContent = !!intro || steps.length > 0 || reasoningText.length > 0;
  if (!hasContent) return null;

  const totalMs = steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
  const isReady = ready ?? !streaming;

  // Lay out a fixed skeleton for the active path, filling each stage from the
  // steps received so far. Steps outside the skeleton (e.g. query_rewrite) lead.
  const skeleton = mode ? expectedStages(mode) : [];
  const byType = new Map<string, TraceStep>();
  for (const s of steps) byType.set(s.type, s);
  const extra = steps.filter((s) => !skeleton.includes(s.type));

  const rows: { step?: TraceStep; pending?: TraceStepType }[] = [
    ...extra.map((step) => ({ step })),
  ];
  for (const stage of skeleton) {
    const step = byType.get(stage);
    if (step) rows.push({ step });
    else if (streaming) rows.push({ pending: stage });
  }
  // No mode (rehydration): just show whatever steps we have, in order.
  if (!mode) {
    rows.length = 0;
    for (const step of steps) rows.push({ step });
  }

  return (
    <section className="py-2" aria-label="思考过程">
      <button
        type="button"
        onClick={() => setOverride(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
      >
        {streaming ? (
          <Loader2 className="size-3 animate-spin" strokeWidth={2} />
        ) : (
          <Sparkles className="size-3" strokeWidth={2} />
        )}
        {streaming ? "思考中…" : "思考过程"}
        {steps.length > 0 && (
          <span className="ml-1 normal-case tracking-normal tabular-nums">
            {steps.length} 步 · {formatMs(totalMs)}
          </span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto size-3.5 transition-transform duration-200",
            expanded ? "rotate-180" : "rotate-0"
          )}
          strokeWidth={2}
        />
      </button>

      {expanded && (
        <div className="mt-2 space-y-2.5 text-[13px] leading-relaxed">
          {intro && (
            <p className="text-muted-foreground">{intro}</p>
          )}

          {rows.length > 0 && (
            <ol className="space-y-1">
              {rows.map((row, i) =>
                row.step ? (
                  <StepRow key={row.step.id ?? `s${i}`} step={row.step} />
                ) : (
                  <PendingRow key={`p${row.pending}`} type={row.pending!} />
                )
              )}
            </ol>
          )}

          {isReady && steps.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-500">
              <CircleCheck className="size-3.5" strokeWidth={2} />
              信息收集完毕,开始作答
            </p>
          )}

          {reasoningText && (
            <div className="whitespace-pre-wrap break-words rounded-md bg-muted/25 px-3 py-2 text-muted-foreground">
              {reasoningText}
              {streaming && (
                <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-muted-foreground/60 align-middle" />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StepRow({ step }: { step: TraceStep }) {
  const { icon, tone } = statusVisual(step.status);
  const label = STEP_LABELS[step.type] ?? step.type;
  const detail = stepDetail(step);
  return (
    <li className="flex items-start gap-2">
      <span className={cn("mt-0.5 shrink-0", tone)}>{icon}</span>
      <span className="min-w-0 flex-1 text-foreground/90">
        <span className="text-xs">{label}</span>
        {detail && (
          <span className="ml-1.5 text-[11px] text-muted-foreground">
            {detail}
          </span>
        )}
        <span className="ml-1.5 font-mono text-[10px] tabular-nums text-muted-foreground/70">
          {formatMs(step.durationMs)}
        </span>
      </span>
    </li>
  );
}

function PendingRow({ type }: { type: TraceStepType }) {
  return (
    <li className="flex items-start gap-2 text-muted-foreground/60">
      <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" strokeWidth={2} />
      <span className="text-xs">{STEP_LABELS[type] ?? type}</span>
      <span className="text-[11px]">检索中…</span>
    </li>
  );
}

/** Natural one-line detail per step, pulled from the step's data payload. */
function stepDetail(step: TraceStep): string {
  const d = step.data ?? {};
  switch (step.type) {
    case "query_rewrite":
      return d.error ? "回退原始查询" : "已改写";
    case "vector_search":
    case "keyword_search":
    case "graph_search":
    case "graph_only_search":
      return d.count != null ? `获取 ${d.count} 个片段` : "";
    case "rrf_fusion":
      return d.fusedCount != null ? `融合 ${d.fusedCount} 条` : "";
    case "rerank":
      return d.degraded
        ? `降级 · 保留 ${d.outputCount ?? 0} 条`
        : `重排序 ${d.outputCount ?? 0} 条`;
    case "resolve_parents":
      return `${d.inputCount ?? "?"} → ${d.outputCount ?? "?"}`;
    case "expand_search":
      return d.queryCount != null ? `${d.queryCount} 个子查询` : "";
    default:
      return "";
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const STEP_LABELS: Record<string, string> = {
  query_rewrite: "查询改写",
  vector_search: "向量检索",
  keyword_search: "关键词检索",
  graph_search: "图谱检索",
  graph_only_search: "图谱检索",
  rrf_fusion: "RRF 融合",
  rerank: "重排序",
  resolve_parents: "父块解析",
  expand_search: "扩展检索",
};

function statusVisual(status: TraceStepStatus): {
  icon: React.ReactNode;
  tone: string;
} {
  switch (status) {
    case "done":
      return {
        icon: <CircleCheck className="size-3.5" strokeWidth={2} />,
        tone: "text-emerald-500",
      };
    case "error":
      return {
        icon: <CircleAlert className="size-3.5" strokeWidth={2} />,
        tone: "text-destructive",
      };
    case "skipped":
      return {
        icon: <CircleSlash className="size-3.5" strokeWidth={2} />,
        tone: "text-muted-foreground",
      };
  }
}
