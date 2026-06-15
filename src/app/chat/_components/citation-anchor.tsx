"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import {
  CITATION_JUMP_EVENT,
  citationAnchorId,
  type CitationJumpDetail,
} from "./citation-list";

/**
 * Convert bare `[N]` markers inside assistant text into markdown links that
 * point at the corresponding citation row, e.g. `[3]` → `[3](#cite-<id>-3)`.
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

interface CitationAnchorProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children?: ReactNode;
}

/**
 * Custom `<a>` renderer for Streamdown. Recognises in-doc citation links
 * (href starts with `#cite-`) and renders them as a small inline chip that
 * scrolls the matching reference row into view. All other links fall back
 * to the standard `target="_blank"` external-link rendering.
 */
export function CitationAnchor({
  href,
  children,
  className,
  ...rest
}: CitationAnchorProps) {
  if (typeof href === "string" && href.startsWith("#cite-")) {
    return (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          const id = href.slice(1);
          // Let the matching CitationList expand (if collapsed) and own the
          // scroll + highlight, so jumps work even when the list is folded.
          window.dispatchEvent(
            new CustomEvent<CitationJumpDetail>(CITATION_JUMP_EVENT, {
              detail: { id },
            })
          );
        }}
        className="mx-0.5 inline-flex h-[1.1em] min-w-[1.1em] items-center justify-center rounded bg-primary/12 px-[0.35em] align-baseline font-mono text-[0.72em] font-semibold leading-none text-primary no-underline ring-1 ring-primary/20 transition-colors hover:bg-primary/22 hover:text-primary"
      >
        {children}
      </a>
    );
  }
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
