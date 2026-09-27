"use client";

import { highlightMatches } from "@/lib/search/search-utils";

// =============================================================================
// Highlight — chunk 6
//
// Renders `text` with all occurrences of `query` wrapped in <mark>. Uses
// highlightMatches() (pure, in src/lib/search/) to split the text into
// segments — no dangerouslySetInnerHTML, no XSS risk.
//
// The <mark> element is styled with `bg-yellow-200 dark:bg-yellow-900` (the
// standard "highlighter" look). Tailwind's `dark:` variant handles dark mode.
//
// Usage:
//   <Highlight text={snippet} query={searchQuery} />
//
// If `query` is empty, renders the text as-is (no highlighting).
// =============================================================================

export function Highlight({ text, query }: { text: string; query: string }) {
  const segments = highlightMatches(text, query);
  if (segments.length === 0) return null;
  return (
    <>
      {segments.map((seg, i) =>
        seg.isMatch ? (
          <mark
            key={i}
            className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-900/70 dark:text-yellow-50"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}
