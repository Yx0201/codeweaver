"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  CircleCheck,
  CircleAlert,
  Loader2,
  Search,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentTraceStep } from "@/lib/citations";

/**
 * Shape of a `tool-retrieveKnowledge` part on a UIMessage (AI SDK v6 names
 * tool parts `tool-${NAME}` and drives them through a state machine). These
 * live directly on the part object — not under `data` like the custom
 * `data-*` parts — so we type them loosely and read fields defensively.
 */
interface RetrieveToolPart {
  type: string; // "tool-retrieveKnowledge"
  toolCallId?: string;
  state?: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: { query?: string; searchMode?: string };
  output?: {
    chunks?: { number: number; content: string; score?: number; source?: string }[];
    count?: number;
    searchMode?: string;
    error?: string;
  };
}

interface ReasoningPart {
  type: string; // "reasoning"
  text?: string;
}

interface AgentThinkingChainProps {
  /** Opening narration (from the data-plan part); absent on rehydration. */
  intro?: string;
  /** Full message parts — reasoning + tool-retrieveKnowledge, interleaved in order. */
  parts: Array<Record<string, unknown>>;
  /** Persisted tool-call timeline, used when live parts are gone (after refresh). */
  agentTrace?: AgentTraceStep[];
  /** True while this message is still being generated. */
  streaming?: boolean;
}

const MODE_LABEL: Record<string, string> = {
  hybrid: "混合",
  graph: "图谱",
  fast: "快速",
};

type TaskStatus = "running" | "done" | "error";
const STATUS_LABEL: Record<TaskStatus, string> = {
  running: "执行中",
  done: "执行成功",
  error: "执行失败",
};

/**
 * The Agent-mode thinking chain. Unlike the pipeline's `ThinkingChain` (a fixed
 * step skeleton that lights up as trace events land), this renders the model's
 * REAL decision timeline IN ARRIVAL ORDER: 思考(规划) → 任务1 → 任务2 → 思考(复盘)
 * — exactly the agent loop the server ran. Each retrieval is an expandable
 * task card (name + status + detailed process); reasoning renders as 思考 blocks.
 *
 * On refresh, live `tool-*` parts are gone, so we fall back to the persisted
 * `agentTrace` (task cards without chunk previews).
 */
export function AgentThinkingChain({
  intro,
  parts,
  agentTrace,
  streaming,
}: AgentThinkingChainProps) {
  const [override, setOverride] = useState<boolean | null>(null);
  const expanded = override ?? !!streaming;

  // Index of the last tool call. Text after it is the FINAL answer (rendered
  // outside this chain); text before/among tool calls is the model narrating
  // its plan, which belongs inline here at its real chronological position.
  let lastToolIdx = -1;
  parts.forEach((p, i) => {
    if (typeof p.type === "string" && p.type.startsWith("tool-")) lastToolIdx = i;
  });

  // Build an ordered timeline from live parts: reasoning + tool calls +
  // pre-answer narration text, interleaved in arrival order.
  const timeline = parts
    .map((p, i) => ({ p, i }))
    .filter(
      ({ p, i }) =>
        typeof p.type === "string" &&
        (p.type === "reasoning" ||
          p.type.startsWith("tool-") ||
          (p.type === "text" && i < lastToolIdx))
    )
    .map(({ p }) =>
      p.type === "reasoning"
        ? { kind: "reasoning" as const, part: p as unknown as ReasoningPart }
        : p.type === "text"
          ? {
              kind: "narration" as const,
              part: p as unknown as { type: string; text?: string },
            }
          : { kind: "task" as const, part: p as unknown as RetrieveToolPart }
    );

  const taskCount = timeline.filter((t) => t.kind === "task").length;
  const hasLive = timeline.length > 0;
  const hasPersisted = (agentTrace?.length ?? 0) > 0;
  if (!intro && !hasLive && !hasPersisted) return null;

  const showCount = hasLive ? taskCount : agentTrace?.length ?? 0;

  return (
    <section className="py-2" aria-label="Agent 思考过程">
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
        {streaming ? "Agent 思考中…" : "Agent 思考过程"}
        {showCount > 0 && (
          <span className="ml-1 normal-case tracking-normal tabular-nums">
            {showCount} 个任务
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
        <div className="mt-2 space-y-2 text-[13px] leading-relaxed">
          {intro && <p className="text-muted-foreground">{intro}</p>}

          {hasLive ? (
            timeline.map((item, i) =>
              item.kind === "reasoning" ? (
                <ReasoningBlock
                  key={`r${i}`}
                  text={item.part.text ?? ""}
                  streaming={!!streaming}
                />
              ) : item.kind === "narration" ? (
                <NarrationBlock
                  key={`n${i}`}
                  text={item.part.text ?? ""}
                  streaming={!!streaming}
                />
              ) : (
                <TaskCard
                  key={item.part.toolCallId ?? `t${i}`}
                  query={item.part.input?.query ?? "(等待查询…)"}
                  searchMode={
                    item.part.input?.searchMode ?? item.part.output?.searchMode
                  }
                  state={item.part.state}
                  count={item.part.output?.count}
                  error={item.part.output?.error}
                  chunks={item.part.output?.chunks}
                  streaming={!!streaming}
                />
              )
            )
          ) : (
            (agentTrace ?? []).map((step, i) => (
              <TaskCard
                key={`a${i}`}
                query={step.query}
                searchMode={step.searchMode}
                status={step.status === "done" ? "done" : "error"}
                count={step.count}
                error={step.error}
                streaming={false}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

/** A model reasoning block — the planning / reflection between tasks. */
function ReasoningBlock({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(true);
  const trimmed = text.trim();
  if (!trimmed) return null;
  return (
    <div className="rounded-md bg-muted/25">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground"
      >
        <Brain className="size-3.5 shrink-0" strokeWidth={2} />
        思考
        {Chevron(open)}
      </button>
      {open && (
        <div className="whitespace-pre-wrap break-words px-3 pb-2 text-muted-foreground">
          {trimmed}
          {streaming && (
            <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-muted-foreground/60 align-middle" />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Pre-answer narration — the model "thinking out loud" in plain content tokens
 * (e.g. "先分别检索世界观和主要角色") before/between tool calls. Distinct from
 * `ReasoningBlock` (collapsible reasoning tokens); this is regular model speech
 * shown inline at its chronological spot so it no longer leaks into the answer.
 */
function NarrationBlock({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return (
    <p className="whitespace-pre-wrap break-words px-1 text-muted-foreground">
      {trimmed}
      {streaming && (
        <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-muted-foreground/60 align-middle" />
      )}
    </p>
  );
}

/** One retrieval as an expandable task card: name + status + detailed process. */
function TaskCard({
  query,
  searchMode,
  state,
  status,
  count,
  error,
  chunks,
  streaming,
}: {
  query: string;
  searchMode?: string;
  /** Live state machine value (mutually exclusive with `status`). */
  state?: RetrieveToolPart["state"];
  /** Persisted status (rehydration). */
  status?: "done" | "error";
  count?: number;
  error?: string;
  chunks?: { number: number; content: string; score?: number; source?: string }[];
  streaming: boolean;
}) {
  // Resolve effective status from either the live state or the persisted status.
  let effStatus: TaskStatus;
  if (state === "output-error" || status === "error") effStatus = "error";
  else if (state === "output-available" || status === "done") effStatus = "done";
  else effStatus = "running";

  const done = effStatus !== "running";
  // Default: expand while streaming so the user watches each task run; once the
  // message finishes, collapse to a clean summary. User can always override.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? (streaming ? true : false);

  const modeLabel = searchMode ? MODE_LABEL[searchMode] ?? searchMode : undefined;
  const effCount = count ?? chunks?.length ?? 0;

  return (
    <div className="rounded-md border border-border/60 bg-card/30">
      <button
        type="button"
        onClick={() => setOverride(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <StatusIcon status={effStatus} />
        <Search className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
        <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">
          {query}
        </span>
        {modeLabel && (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {modeLabel}
          </span>
        )}
        <StatusBadge status={effStatus} />
        {Chevron(open)}
      </button>

      {open && (
        <div className="space-y-1.5 border-t border-border/50 px-3 py-2 text-[12px] text-muted-foreground">
          <DetailRow label="查询" value={query} />
          {modeLabel && <DetailRow label="通道" value={modeLabel} />}
          {effStatus === "error" ? (
            <DetailRow
              label="结果"
              value={error ? `失败 · ${error}` : "检索失败"}
              tone="text-destructive"
            />
          ) : done ? (
            <DetailRow label="召回" value={`${effCount} 个片段`} />
          ) : (
            <DetailRow label="状态" value="检索中…" />
          )}

          {done && chunks && chunks.length > 0 && (
            <div className="pt-1">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground/70">
                片段预览
              </div>
              <ul className="space-y-1">
                {chunks.slice(0, 5).map((c) => (
                  <li
                    key={c.number}
                    className="flex gap-1.5 leading-snug text-foreground/70"
                  >
                    <span className="shrink-0 font-mono text-[10px] text-primary/80">
                      [{c.number}]
                    </span>
                    <span className="line-clamp-2">{c.content}</span>
                  </li>
                ))}
                {chunks.length > 5 && (
                  <li className="text-[11px] text-muted-foreground/60">
                    …还有 {chunks.length - 5} 个片段
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "done")
    return <CircleCheck className="size-3.5 shrink-0 text-emerald-500" strokeWidth={2} />;
  if (status === "error")
    return <CircleAlert className="size-3.5 shrink-0 text-destructive" strokeWidth={2} />;
  return <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" strokeWidth={2} />;
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const tone =
    status === "done"
      ? "text-emerald-600 dark:text-emerald-500"
      : status === "error"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <span className={cn("shrink-0 text-[11px] font-medium", tone)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex gap-2">
      <span className="w-10 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground/60">
        {label}
      </span>
      <span className={cn("min-w-0 break-words", tone)}>{value}</span>
    </div>
  );
}

function Chevron(open: boolean) {
  return (
    <ChevronRight
      className={cn(
        "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
        open ? "rotate-90" : "rotate-0"
      )}
      strokeWidth={2}
    />
  );
}
