// =============================================================================
// Chunk 6 — Full-text search utilities.
//
// Pure helpers shared between /api/search (backend) and the search UI
// components (frontend). Kept in src/lib/ so both sides can import them.
//
// SNIPPET EXTRACTION:
//   `extractSnippet(text, query, options)` returns ~150 chars centered on
//   the first match, with ellipses if truncated. The match position is
//   returned so the frontend can render `<mark>` around it.
//
// HIGHLIGHTING:
//   `highlightMatches(text, query)` returns an array of { text, isMatch }
//   segments — the frontend maps these to <span> / <mark> pairs. Splitting
//   into segments (instead of returning HTML) avoids XSS risk: the frontend
//   renders the segments as React children, not dangerouslySetInnerHTML.
//
// All functions are case-insensitive (ASCII) — matching SQLite's LIKE
// behavior, which is what /api/search uses.
// =============================================================================

export interface SnippetResult {
  /** The snippet text (may include leading/trailing "..." ellipses). */
  snippet: string;
  /** Start index of the first match within the snippet (0-based). -1 if no match found. */
  matchStart: number;
  /** Length of the matched query within the snippet. */
  matchLength: number;
}

/**
 * Default snippet window: 75 chars before + 75 chars after the match.
 * Total max ~150 chars + query length + 6 chars for ellipses.
 */
const DEFAULT_SNIPPET_BEFORE = 75;
const DEFAULT_SNIPPET_AFTER = 75;

/**
 * Extract a snippet from `text` centered on the first occurrence of `query`.
 *
 * Case-insensitive (ASCII). Returns:
 *   - snippet: the extracted text, with "..." prefix/suffix if truncated
 *   - matchStart: index of the match within the snippet (for <mark> rendering)
 *   - matchLength: length of the matched substring
 *
 * If the query isn't found (shouldn't happen for /api/search results, but
 * defensive), returns { snippet: text.slice(0, 150), matchStart: -1, matchLength: 0 }.
 *
 * @param text    The full text to extract from (typically DocumentVersion.textContent)
 * @param query   The search query
 * @param options Optional: { before, after } — chars of context before/after the match
 */
export function extractSnippet(
  text: string,
  query: string,
  options?: { before?: number; after?: number },
): SnippetResult {
  const before = options?.before ?? DEFAULT_SNIPPET_BEFORE;
  const after = options?.after ?? DEFAULT_SNIPPET_AFTER;

  if (!text || !query) {
    return { snippet: "", matchStart: -1, matchLength: 0 };
  }

  // Chunk 7: normalize whitespace in BOTH the text and the query before
  // matching. OCR output + pdftotext -layout insert line breaks at word-wrap
  // boundaries — a search for "secret ballot" should match "secret\nballot".
  // Normalizing collapses all whitespace runs (spaces, newlines, tabs) to a
  // single space, so the indexOf search finds the match regardless of the
  // original whitespace.
  //
  // The returned snippet is from the NORMALIZED text — line breaks are
  // collapsed to spaces, which is cleaner for search-result display.
  const normalizedText = text.replace(/\s+/g, " ").trim();
  const normalizedQuery = query.replace(/\s+/g, " ").trim();

  const lowerText = normalizedText.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex < 0) {
    // No match — return the first 150 chars as a fallback snippet.
    const fallback = normalizedText.slice(0, before + after);
    return {
      snippet: fallback + (normalizedText.length > before + after ? "..." : ""),
      matchStart: -1,
      matchLength: 0,
    };
  }

  const start = Math.max(0, matchIndex - before);
  const end = Math.min(normalizedText.length, matchIndex + normalizedQuery.length + after);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalizedText.length ? "..." : "";
  const snippet = prefix + normalizedText.slice(start, end) + suffix;

  // The match position within the snippet:
  //   - If we added a "..." prefix, the match is at (matchIndex - start) + 3
  //   - Otherwise, it's at (matchIndex - start)
  const matchStart = (matchIndex - start) + prefix.length;
  const matchLength = normalizedQuery.length;

  return { snippet, matchStart, matchLength };
}

/**
 * Split `text` into segments, marking which ones match `query`.
 *
 * The frontend renders each segment as either a plain <span> (isMatch=false)
 * or a <mark> (isMatch=true). This avoids XSS risk — no HTML string is
 * constructed; the frontend uses React children.
 *
 * Case-insensitive (ASCII). All occurrences of `query` in `text` are
 * highlighted, not just the first.
 *
 * @param text   The text to split (typically a snippet from extractSnippet)
 * @param query  The search query to highlight
 * @returns Array of { text, isMatch } segments. Empty array if text is empty.
 */
export function highlightMatches(
  text: string,
  query: string,
): Array<{ text: string; isMatch: boolean }> {
  if (!text) return [];
  if (!query || query.trim().length === 0) {
    return [{ text, isMatch: false }];
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const segments: Array<{ text: string; isMatch: boolean }> = [];

  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerQuery, cursor);

  while (matchIndex >= 0) {
    // Push the text before the match (if any)
    if (matchIndex > cursor) {
      segments.push({
        text: text.slice(cursor, matchIndex),
        isMatch: false,
      });
    }
    // Push the match itself (preserving original case from `text`)
    segments.push({
      text: text.slice(matchIndex, matchIndex + query.length),
      isMatch: true,
    });
    cursor = matchIndex + query.length;
    matchIndex = lowerText.indexOf(lowerQuery, cursor);
  }

  // Push any remaining text after the last match
  if (cursor < text.length) {
    segments.push({
      text: text.slice(cursor),
      isMatch: false,
    });
  }

  return segments;
}
