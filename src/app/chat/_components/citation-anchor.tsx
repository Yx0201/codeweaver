"use client";

import { useEffect, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import {
  CITATION_ACTIVATE_EVENT,
  CITATION_JUMP_EVENT,
  activateCitation,
  citationAnchorId,
  type CitationActivateDetail,
  type CitationJumpDetail,
} from "./citation-list";

/**
 * Convert bare `[N]` markers inside assistant text into markdown links that
 * point at the corresponding citation row, e.g. `[3]` → `[3](#cite-<id>~3)`.
 *
 * Only indices that exist in the reference list are converted — anything out
 * of range stays as plain text so the model can't "invent" a clickable [99]
 * that has no entry below.
 *
 * Real markdown links of the form `[1](http://…)` are left alone via the
 * negative lookahead on `(`.
 */
export function preprocessCitations(
  text: string,
  referenceCount: number,
  messageId: string
): string {
  if (referenceCount <= 0) return text;
  return text.replace(/\[(\d+)\](?!\()/g, (match, raw) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > referenceCount) return match;
    return `[${n}](#${citationAnchorId(messageId, n)})`;
  });
}

/** Parse `#cite-<messageId>~<index>` → { messageId, index } or null. */
function parseCiteHref(href: string): { messageId: string; index: number } | null {
  const m = href.match(/^#cite-(.+)~(\d+)$/);
  if (!m) return null;
  return { messageId: m[1], index: Number.parseInt(m[2], 10) };
}

interface CitationAnchorProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children?: ReactNode;
}

/**
 * Custom `<a>` renderer for Streamdown. Recognises in-doc citation links
 * (href starts with `#cite-`) and renders them as a small inline chip that
 * scrolls the matching reference row into view. All other links fall back
 * to the standard `target="_blank"` external-link rendering.
 *
 * M5 — bidirectional sentence-level cross-reference: hovering/focusing a chip
 * broadcasts its index so the matching reference row highlights; conversely
 * when a row is hovered it broadcasts and THIS chip (plus the answer
 * sentence it sits in) gets spotlighted.
 */
export function CitationAnchor({
  href,
  children,
  className,
  ...rest
}: CitationAnchorProps) {
  const isCitation = typeof href === "string" && href.startsWith("#cite-");
  const mine = typeof href === "string" ? parseCiteHref(href) : null;
  const ref = useRef<HTMLAnchorElement>(null);
  const [spotlight, setSpotlight] = useState(false);

  // React to the global activate channel: highlight this chip (and the
  // sentence/block it lives in) when our index is the active one.
  useEffect(() => {
    if (!mine) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<CitationActivateDetail>).detail;
      if (!detail || detail.messageId !== mine.messageId) return;
      setSpotlight(detail.index === mine.index);
    };
    window.addEventListener(CITATION_ACTIVATE_EVENT, handler);
    return () => window.removeEventListener(CITATION_ACTIVATE_EVENT, handler);
  }, [mine]);

  // Apply/remove the block highlight. Single-select semantics: when this chip
  // becomes active we first clear any other spotlighted block, so at most one
  // sentence is highlighted at a time (no stale highlights when switching N).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const block = el.closest("p, li, td, blockquote, pre, dd, dt");
    if (!block) return;

    const HIGHLIGHT_BG =
      "color-mix(in oklab, var(--primary) 12%, transparent)";
    const HIGHLIGHT_RING =
      "inset 0 0 0 1px color-mix(in oklab, var(--primary) 22%, transparent)";

    if (spotlight) {
      // Clear siblings spotlighted by another chip first.
      document
        .querySelectorAll("[data-cite-spotlight]")
        .forEach((node) => {
          if (node === block) return;
          restoreBlock(node as HTMLElement);
        });
      if (!(block as HTMLElement).dataset.citeSpotlight) {
        (block as HTMLElement).dataset.citeSpotlight = "1";
        (block as HTMLElement).dataset.citeOrigBg =
          (block as HTMLElement).style.backgroundColor;
        (block as HTMLElement).dataset.citeOrigShadow =
          (block as HTMLElement).style.boxShadow;
        (block as HTMLElement).style.backgroundColor = HIGHLIGHT_BG;
        (block as HTMLElement).style.boxShadow = HIGHLIGHT_RING;
        (block as HTMLElement).style.borderRadius = "0.375rem";
      }
    } else if ((block as HTMLElement).dataset.citeSpotlight) {
      restoreBlock(block as HTMLElement);
    }
  }, [spotlight]);

  if (!isCitation) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        {...rest}
      >
        {children}
      </a>
    );
  }

  return (
    <a
      ref={ref}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        const id = typeof href === "string" ? href.slice(1) : "";
        if (!id) return;
        // Let the matching CitationList expand (if collapsed) and own the
        // scroll + highlight, so jumps work even when the list is folded.
        window.dispatchEvent(
          new CustomEvent<CitationJumpDetail>(CITATION_JUMP_EVENT, {
            detail: { id },
          })
        );
      }}
      onMouseEnter={() => mine && activateCitation(mine.messageId, mine.index)}
      onMouseLeave={() => mine && activateCitation(mine.messageId, null)}
      onFocus={() => mine && activateCitation(mine.messageId, mine.index)}
      onBlur={() => mine && activateCitation(mine.messageId, null)}
      className={
        "mx-0.5 inline-flex h-[1.1em] min-w-[1.1em] items-center justify-center rounded px-[0.35em] align-baseline font-mono text-[0.72em] font-semibold leading-none no-underline ring-1 transition-all " +
        (spotlight
          ? "bg-primary/30 text-primary ring-primary/50 scale-110"
          : "bg-primary/12 text-primary ring-primary/20 hover:bg-primary/22 hover:text-primary")
      }
    >
      {children}
    </a>
  );
}

/** Restore a block element that was spotlighted by a citation chip. */
function restoreBlock(block: HTMLElement): void {
  if (!block.dataset.citeSpotlight) return;
  block.style.backgroundColor = block.dataset.citeOrigBg ?? "";
  block.style.boxShadow = block.dataset.citeOrigShadow ?? "";
  // Leave border-radius alone — it's harmless and avoids a flash.
  delete block.dataset.citeSpotlight;
  delete block.dataset.citeOrigBg;
  delete block.dataset.citeOrigShadow;
}
