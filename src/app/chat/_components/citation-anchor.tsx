"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import {
  CITATION_JUMP_EVENT,
  citationAnchorId,
  type CitationJumpDetail,
} from "./citation-list";

/**
 * Convert bare `[N]` markers inside assistant text into markdown links that
 * point at the corresponding citation row, e.g. `[3]` → `[3](#cite-<id>~3)`.
 *
 * Every numeric `[N]` is resolved one way or another so none can slip through
 * to the markdown renderer as a broken/undefined link (which rehype-harden
 * would render as `[blocked]`):
 *  - in range  → clickable `[N](#cite-<id>~N)` chip
 *  - out of range → escaped `\[N\]`, rendered as literal `[N]` text (the model
 *    cited a non-existent reference — show it honestly, but never as a link)
 *
 * The model occasionally emits `[N](url)` or a broken `[N]()` instead of a
 * bare `[N]`; the optional `(...)` group strips that so the marker still
 * becomes a clean chip. Non-numeric brackets (real links like `[see this](…)`)
 * are untouched because the pattern requires `\d+`.
 */
export function preprocessCitations(
  text: string,
  referenceCount: number,
  messageId: string
): string {
  if (referenceCount <= 0) return text;
  return text.replace(/\[(\d+)\](?:\([^)]*\))?/g, (_match, raw) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > referenceCount) {
      return `\\[${n}\\]`;
    }
    return `[${n}](#${citationAnchorId(messageId, n)})`;
  });
}

interface CitationAnchorProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children?: ReactNode;
}

/**
 * Custom `<a>` renderer for Streamdown. Recognises in-doc citation links
 * (href starts with `#cite-`) and renders them as a small inline chip that, on
 * click, asks the matching reference row to expand into view and highlight.
 * All other links fall back to the standard `target="_blank"` external-link
 * rendering.
 */
export function CitationAnchor({
  href,
  children,
  className,
  ...rest
}: CitationAnchorProps) {
  const isCitation = typeof href === "string" && href.startsWith("#cite-");

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
      className="mx-0.5 inline-flex h-[1.1em] min-w-[1.1em] items-center justify-center rounded px-[0.35em] align-baseline font-mono text-[0.72em] font-semibold leading-none no-underline ring-1 transition-all bg-primary/12 text-primary ring-primary/20 hover:bg-primary/22 hover:text-primary"
    >
      {children}
    </a>
  );
}
