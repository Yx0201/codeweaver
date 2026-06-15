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

/**
 * Build the DOM id for a reference item. The same scheme is used by the
 * markdown renderer when transforming `[N]` into clickable anchors, so that
 * `<a href="#…">` lands exactly on the matching list row.
 */
export function citationAnchorId(messageId: string, index: number): string {
  return `cite-${messageId}-${index}`;
}

/** Custom event name dispatched by a `[N]` anchor to jump to its source row. */
export const CITATION_JUMP_EVENT = "citation-jump";

export interface CitationJumpDetail {
  id: string;
}

/**
 * Renders the reference list below an assistant answer + a preview dialog
 * for the full chunk text. Click a list row → open dialog with the source
 * filename and the original chunk content.
 */
export function CitationList({ messageId, references }: CitationListProps) {
  const [active, setActive] = useState<MessageReference | null>(null);
  // We track the most recently jumped-to index so we can keep a soft highlight
  // on the row a `[N]` anchor pointed at.
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
      <div
        className="mt-4 rounded-xl border border-border bg-card/40 px-3.5 py-3"
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
        <ol className="mt-2 space-y-1">
          {references.map((ref) => {
            const isActive = highlighted === ref.index;
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
                        : "bg-muted text-muted-foreground ring-border group-hover:text-foreground"
                    )}
                  >
                    {ref.index}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm leading-snug text-foreground/90">
                      {ref.snippet}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
                      {ref.filename}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        )}
      </div>

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
                <span className="ml-auto shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground ring-1 ring-border">
                  [{reference.index}]
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
