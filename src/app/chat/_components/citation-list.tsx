"use client";

import { useEffect, useState } from "react";
import { ChevronDown, FileText, Quote } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { MessageReference } from "@/lib/citations";

interface CitationListProps {
  messageId: string;
  references: MessageReference[];
}

/** Channel → label + tint classes for the index badge and the dot. */
const SOURCE_STYLE: Record<
  MessageReference["source"],
  { label: string; badge: string; dot: string }
> = {
  vector: {
    label: "向量",
    badge: "bg-sky-500/15 text-sky-600 ring-sky-500/30",
    dot: "bg-sky-500",
  },
  keyword: {
    label: "关键词",
    badge: "bg-amber-500/15 text-amber-600 ring-amber-500/30",
    dot: "bg-amber-500",
  },
  both: {
    label: "融合",
    badge: "bg-violet-500/15 text-violet-600 ring-violet-500/30",
    dot: "bg-violet-500",
  },
  graph: {
    label: "图谱",
    badge: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30",
    dot: "bg-emerald-500",
  },
};

/**
 * Build the DOM id for a reference item. The same scheme is used by the
 * markdown renderer when transforming `[N]` into clickable anchors, so that
 * `<a href="#…">` lands exactly on the matching list row.
 *
 * The separator is `~` (not `-`) because message IDs are nanoids that may
 * contain `-` themselves — a trailing `~N` lets the anchor renderer parse its
 * own index unambiguously from `#cite-<messageId>~<index>`.
 */
export function citationAnchorId(messageId: string, index: number): string {
  return `cite-${messageId}~${index}`;
}

/** Custom event name dispatched by a `[N]` anchor to jump to its source row. */
export const CITATION_JUMP_EVENT = "citation-jump";

export interface CitationJumpDetail {
  id: string;
}

/**
 * Renders the reference list below an assistant answer + a preview dialog
 * for the full chunk text. Click a list row → open dialog with the source
 * filename and the original chunk content. Click a `[N]` chip in the answer
 * → the list expands, scrolls to the matching row, and highlights it.
 */
export function CitationList({ messageId, references }: CitationListProps) {
  const [active, setActive] = useState<MessageReference | null>(null);
  // The most recently jumped-to index — keeps a soft highlight on the row a
  // `[N]` anchor pointed at.
  const [highlighted, setHighlighted] = useState<number | null>(null);
  // The reference list is collapsible. It starts expanded (it only appears
  // once the answer has finished streaming), but the user can fold it away.
  const [expanded, setExpanded] = useState(false);

  // A `[N]` anchor in the answer dispatches CITATION_JUMP_EVENT instead of
  // scrolling directly, so a collapsed list can expand itself first. We only
  // react to ids that belong to this message's references.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<CitationJumpDetail>).detail;
      const id = detail?.id;
      if (!id) return;
      const match = references.find(
        (ref) => citationAnchorId(messageId, ref.index) === id
      );
      if (!match) return;

      setExpanded(true);
      setHighlighted(match.index);
      // Defer the scroll until after the expanded rows have painted, so the
      // target row exists and is laid out.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.getElementById(id);
          if (!el) return;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.animate(
            [
              {
                backgroundColor:
                  "color-mix(in oklab, var(--primary) 18%, transparent)",
              },
              { backgroundColor: "transparent" },
            ],
            { duration: 1400, easing: "ease-out" }
          );
        });
      });
    };

    window.addEventListener(CITATION_JUMP_EVENT, handler);
    return () => window.removeEventListener(CITATION_JUMP_EVENT, handler);
  }, [references, messageId]);

  return (
    <>
      <section
        className="py-2"
        aria-label="参考资料"
      >
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="flex w-full items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
        >
          <Quote className="size-3" strokeWidth={2} />
          引用 · {references.length}
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 transition-transform duration-200",
              expanded ? "rotate-180" : "rotate-0"
            )}
            strokeWidth={2}
          />
        </button>
        {expanded && (
        <ol className="mt-2.5 space-y-1">
          {references.map((ref) => {
            const isActive = highlighted === ref.index;
            const src = SOURCE_STYLE[ref.source] ?? SOURCE_STYLE.vector;
            const scoreLabel =
              ref.rerankScore != null
                ? `重排 ${ref.rerankScore}`
                : ref.fusionScore != null
                  ? `融合 ${ref.fusionScore}`
                  : null;
            return (
              <li key={ref.index} id={citationAnchorId(messageId, ref.index)}>
                <button
                  type="button"
                  onClick={() => {
                    setActive(ref);
                    setHighlighted(ref.index);
                  }}
                  className={cn(
                    "group flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                    "hover:bg-accent/50",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive && "bg-accent/40"
                  )}
                  title={ref.filename}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-semibold tabular-nums ring-1 transition-colors",
                      isActive
                        ? "bg-primary/15 text-primary ring-primary/30"
                        : src.badge
                    )}
                  >
                    {ref.index}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm leading-snug text-foreground/90">
                      {ref.snippet}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <span className="flex items-center gap-1 rounded-sm px-1 py-px font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                        <span className={cn("size-1.5 rounded-full", src.dot)} />
                        {src.label}
                      </span>
                      {scoreLabel && (
                        <span className="font-mono text-[9px] tabular-nums text-muted-foreground/80">
                          {scoreLabel}
                        </span>
                      )}
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {ref.filename}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        )}
      </section>

      <CitationPreviewDialog
        reference={active}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
      />
    </>
  );
}

function CitationPreviewDialog({
  reference,
  onOpenChange,
}: {
  reference: MessageReference | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={reference !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {reference && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
                  <FileText className="size-4" strokeWidth={1.75} />
                </span>
                <span className="truncate">{reference.filename}</span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  {(() => {
                    const src = SOURCE_STYLE[reference.source] ?? SOURCE_STYLE.vector;
                    const scoreLabel =
                      reference.rerankScore != null
                        ? `重排 ${reference.rerankScore}`
                        : reference.fusionScore != null
                          ? `融合 ${reference.fusionScore}`
                          : null;
                    return (
                      <>
                        <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground ring-1 ring-border">
                          <span className={cn("size-1.5 rounded-full", src.dot)} />
                          {src.label}
                        </span>
                        {scoreLabel && (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground ring-1 ring-border">
                            {scoreLabel}
                          </span>
                        )}
                        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground ring-1 ring-border">
                          [{reference.index}]
                        </span>
                      </>
                    );
                  })()}
                </span>
              </DialogTitle>
              <DialogDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
                原文引用
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">
              {reference.chunkText}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
