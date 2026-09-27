import { describe, it, expect } from "vitest";
import { extractSnippet, highlightMatches } from "../search/search-utils";

// =============================================================================
// Chunk 6 — search-utils tests.
//
// Covers the pure helpers in src/lib/search/search-utils.ts:
//   - extractSnippet: snippet extraction with match position
//   - highlightMatches: segment splitting for <mark> rendering
//
// These are pure functions — no I/O, no DB. The tests are deterministic.
// =============================================================================

describe("extractSnippet", () => {
  it("returns a snippet centered on the first match", () => {
    const text = "The quick brown fox jumps over the lazy dog. The quick brown fox is fast.";
    const result = extractSnippet(text, "brown fox");
    expect(result.matchStart).toBeGreaterThanOrEqual(0);
    expect(result.matchLength).toBe("brown fox".length);
    expect(result.snippet).toContain("brown fox");
  });

  it("adds '...' prefix when the match is not at the start", () => {
    const text = "A".repeat(200) + "secret ballot" + "B".repeat(200);
    const result = extractSnippet(text, "secret ballot");
    expect(result.snippet.startsWith("...")).toBe(true);
  });

  it("adds '...' suffix when the match is not at the end", () => {
    const text = "secret ballot" + "B".repeat(200);
    const result = extractSnippet(text, "secret ballot");
    expect(result.snippet.endsWith("...")).toBe(true);
  });

  it("does not add '...' prefix when the match is near the start", () => {
    const text = "secret ballot is required for all elections";
    const result = extractSnippet(text, "secret ballot");
    expect(result.snippet.startsWith("...")).toBe(false);
  });

  it("does not add '...' suffix when the match is near the end", () => {
    const text = "all elections require secret ballot";
    const result = extractSnippet(text, "secret ballot");
    expect(result.snippet.endsWith("...")).toBe(false);
  });

  it("is case-insensitive", () => {
    const text = "The QUICK brown fox";
    const result = extractSnippet(text, "quick");
    expect(result.matchStart).toBeGreaterThanOrEqual(0);
    expect(result.matchLength).toBe("quick".length);
  });

  it("returns matchStart: -1 when the query is not found", () => {
    const text = "the quick brown fox";
    const result = extractSnippet(text, "nonexistent");
    expect(result.matchStart).toBe(-1);
    expect(result.matchLength).toBe(0);
  });

  it("returns empty snippet for empty text", () => {
    const result = extractSnippet("", "query");
    expect(result.snippet).toBe("");
    expect(result.matchStart).toBe(-1);
  });

  it("returns empty snippet for empty query", () => {
    const result = extractSnippet("some text", "");
    expect(result.snippet).toBe("");
    expect(result.matchStart).toBe(-1);
  });

  it("respects custom before/after options", () => {
    const text = "A".repeat(100) + "MATCH" + "B".repeat(100);
    const result = extractSnippet(text, "MATCH", { before: 10, after: 10 });
    // Snippet should be: "..." + 10 A's + "MATCH" + 10 B's + "..."
    // Total length = 3 + 10 + 5 + 10 + 3 = 31
    expect(result.snippet.length).toBe(31);
    expect(result.snippet.startsWith("...")).toBe(true);
    expect(result.snippet.endsWith("...")).toBe(true);
  });

  it("handles query longer than text", () => {
    const text = "short";
    const result = extractSnippet(text, "this is a very long query");
    expect(result.matchStart).toBe(-1);
  });

  it("matches across line breaks (OCR output) — chunk 7", () => {
    // OCR output often has line breaks at word-wrap boundaries.
    // "secret ballot" should match "secret\nballot" after whitespace normalization.
    const text = "The union conducted a secret\nballot for the election of office bearers.";
    const result = extractSnippet(text, "secret ballot");
    expect(result.matchStart).toBeGreaterThanOrEqual(0);
    expect(result.matchLength).toBe("secret ballot".length);
    // The snippet should have the line break normalized to a space
    expect(result.snippet).toContain("secret ballot");
    expect(result.snippet).not.toContain("secret\nballot");
  });

  it("matches across multiple whitespace types (tabs, double spaces, newlines)", () => {
    const text = "The award\t\tvariation was\n\napproved.";
    const result = extractSnippet(text, "award variation");
    expect(result.matchStart).toBeGreaterThanOrEqual(0);
    expect(result.snippet).toContain("award variation");
  });

  it("normalizes whitespace in the returned snippet", () => {
    const text = "A".repeat(100) + "\n\n\n" + "MATCH" + "\n\n\n" + "B".repeat(100);
    const result = extractSnippet(text, "MATCH");
    // The snippet should not contain the triple newlines — they're normalized to spaces
    expect(result.snippet).not.toContain("\n\n\n");
  });
});

describe("highlightMatches", () => {
  it("returns a single non-match segment when query is empty", () => {
    const segments = highlightMatches("some text", "");
    expect(segments).toEqual([{ text: "some text", isMatch: false }]);
  });

  it("returns a single non-match segment when query is whitespace", () => {
    const segments = highlightMatches("some text", "   ");
    expect(segments).toEqual([{ text: "some text", isMatch: false }]);
  });

  it("returns empty array for empty text", () => {
    const segments = highlightMatches("", "query");
    expect(segments).toEqual([]);
  });

  it("highlights a single match", () => {
    const segments = highlightMatches("the quick brown fox", "quick");
    expect(segments).toEqual([
      { text: "the ", isMatch: false },
      { text: "quick", isMatch: true },
      { text: " brown fox", isMatch: false },
    ]);
  });

  it("highlights multiple matches", () => {
    const segments = highlightMatches("the fox and the fox", "fox");
    expect(segments).toEqual([
      { text: "the ", isMatch: false },
      { text: "fox", isMatch: true },
      { text: " and the ", isMatch: false },
      { text: "fox", isMatch: true },
    ]);
  });

  it("highlights a match at the start of the text", () => {
    const segments = highlightMatches("fox and hound", "fox");
    expect(segments).toEqual([
      { text: "fox", isMatch: true },
      { text: " and hound", isMatch: false },
    ]);
  });

  it("highlights a match at the end of the text", () => {
    const segments = highlightMatches("hound and fox", "fox");
    expect(segments).toEqual([
      { text: "hound and ", isMatch: false },
      { text: "fox", isMatch: true },
    ]);
  });

  it("highlights the entire text when it matches the query", () => {
    const segments = highlightMatches("fox", "fox");
    expect(segments).toEqual([{ text: "fox", isMatch: true }]);
  });

  it("is case-insensitive", () => {
    const segments = highlightMatches("The QUICK brown fox", "quick");
    expect(segments).toEqual([
      { text: "The ", isMatch: false },
      { text: "QUICK", isMatch: true },
      { text: " brown fox", isMatch: false },
    ]);
  });

  it("preserves original case in the match segment", () => {
    const segments = highlightMatches("The Quick Brown Fox", "quick");
    const matchSegment = segments.find((s) => s.isMatch);
    expect(matchSegment?.text).toBe("Quick");
  });

  it("returns a single non-match segment when the query is not found", () => {
    const segments = highlightMatches("the quick brown fox", "nonexistent");
    expect(segments).toEqual([{ text: "the quick brown fox", isMatch: false }]);
  });

  it("handles overlapping matches correctly (no overlaps)", () => {
    // "aa" in "aaa" — should match positions 0 and 2, not 0 and 1
    const segments = highlightMatches("aaa", "aa");
    // Match at 0: "aa", then "a" is left over
    expect(segments).toEqual([
      { text: "aa", isMatch: true },
      { text: "a", isMatch: false },
    ]);
  });
});
