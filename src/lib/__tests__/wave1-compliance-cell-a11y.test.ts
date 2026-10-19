import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================================
// Wave 1 / Item 1: Compliance matrix cells — icon + aria-label accessibility.
//
// Audit finding: compliance matrix cells were color-only indicators. A colored
// circle (the dot) was the sole cue for each status, which fails WCAG 1.4.1
// (Use of Color) and is invisible to screen-reader users.
//
// Fix: render STATUS_VISUAL.icon inside each cell so the status is also
// conveyed by shape (check, alert triangle, X, clock, question, ban). Add an
// aria-label of the form "${unionName} — ${documentType}: ${statusLabel}"
// so screen readers announce the cell's identity without the tooltip.
//
// These contract tests guard against regression. They read the source file
// (same belt-and-suspenders pattern as ia2-compliance-tabs-union-hub.test.ts
// and t20-label-source-contract.test.ts) so the test runs in the Node vitest
// environment without needing jsdom / RTL / network.
// =============================================================================

const COMPLIANCE_VIEW_PATH = resolve(
  __dirname,
  "../../../src/components/app/views/compliance.tsx",
);

function readComplianceView(): string {
  return readFileSync(COMPLIANCE_VIEW_PATH, "utf-8");
}

// Extract the matrix cell block — the JSX returned by `row.scores.map((cell) => ...)`.
// Anchored on the stable marker `row.scores.map(` and the closing `})}` that ends
// the .map callback. Whitespace-tolerant because Prettier reformats arrow fns.
function extractMatrixCellBlock(src: string): string | null {
  const startMatch = src.match(/row\.scores\.map\(/);
  if (!startMatch || startMatch.index === undefined) return null;
  const startIdx = startMatch.index;
  // Find the closing `})}` — end of .map callback. We scan forward for the
  // pattern: a `}` (close arrow body) followed by `)` (close .map call)
  // followed by `}` (close JSX expression). Allow whitespace between.
  const endMatch = src.slice(startIdx).match(/\}\s*\)\s*\}/);
  if (!endMatch || endMatch.index === undefined) return null;
  const endIdx = startIdx + endMatch.index + endMatch[0].length;
  return src.slice(startIdx, endIdx);
}

describe("Wave 1 / Item 1: compliance matrix cell accessibility", () => {
  const src = readComplianceView();

  it("STATUS_VISUAL config defines an `icon` field for every status entry", () => {
    // Sanity: STATUS_VISUAL must still expose `icon` so each cell can render
    // a non-color cue. The `dot` field stays (used by the legend).
    expect(src).toMatch(/STATUS_VISUAL:\s*Record<[^>]*,\s*\{\s*cell:\s*string;\s*dot:\s*string;\s*icon:\s*typeof\s+CheckCircle2\s*\}/);
  });

  it("matrix cells render the status icon (not just the dot)", () => {
    // The cell-rendering block must instantiate cfg.icon as a JSX component.
    // Capitalized alias (const Icon = cfg.icon) followed by <Icon .../> is the
    // idiomatic pattern — keeps TS happy and satisfies the audit fix.
    expect(src).toMatch(/const\s+Icon\s*=\s*cfg\.icon\s*;?/);
    expect(src).toMatch(/<Icon\s+className=/);
  });

  it("matrix cells expose an aria-label of the form `unionName — documentType: statusLabel`", () => {
    // The aria-label must use the em-dash (U+2014), include the union name,
    // the document type, and the status label (via getComplianceStatusLabel —
    // single source of truth, no hardcoded status string).
    //
    // We allow any quote style (backtick / double) and any whitespace around
    // the em-dash, but require the three-part template literal structure.
    expect(src).toMatch(/aria-label=\{`\$\{row\.unionName\}\s*—\s*\$\{cell\.documentType\}:\s*\$\{getComplianceStatusLabel\(cell\.status\)\}`\}/);
  });

  it("matrix cells have role=\"img\" so screen readers treat the icon+label as one image", () => {
    // role="img" tells AT (assistive tech) that the span is a single image
    // whose name comes from aria-label. Without it, some screen readers try
    // to descend into the span and announce the icon's SVG label (often empty).
    expect(src).toMatch(/role="img"/);
  });

  it("matrix cells no longer render the dot as the sole visual cue (regression guard)", () => {
    // The previous cell rendered `<span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />`
    // INSIDE the 28px outer span. That made the cell color-only. After the fix,
    // the cell renders `<Icon ... />` instead. The dot pattern must NOT reappear
    // inside the matrix <td> block.
    const cellBlock = extractMatrixCellBlock(src);
    expect(cellBlock, "matrix cell block must exist").not.toBeNull();
    expect(cellBlock!).not.toMatch(/h-2\.5\s+w-2\.5\s+rounded-full\s+\$\{cfg\.dot\}/);
  });

  it("matrix cells still use STATUS_VISUAL.cell + dimmed opacity for visual styling (no styling regression)", () => {
    // The color-coded cell background and the dim-when-filtered behavior are
    // unchanged — we only swapped the inner content.
    const cellBlock = extractMatrixCellBlock(src);
    expect(cellBlock, "matrix cell block must exist").not.toBeNull();
    expect(cellBlock!).toMatch(/inline-flex h-7 w-7 cursor-help items-center justify-center rounded-full border/);
    expect(cellBlock!).toMatch(/\$\{cfg\.cell\}/);
    expect(cellBlock!).toMatch(/dimmed\s*\?\s*"opacity-25"/);
  });

  it("matrix cell aria-label uses getComplianceStatusLabel (no hardcoded status literal — T20 contract)", () => {
    // Belt-and-suspenders for the T20 single-source-of-truth contract: the
    // aria-label must NOT hardcode "Compliant" / "Expiring" / etc. It must
    // call getComplianceStatusLabel(cell.status).
    const cellBlock = extractMatrixCellBlock(src);
    expect(cellBlock, "matrix cell block must exist").not.toBeNull();
    expect(cellBlock!).toMatch(/getComplianceStatusLabel\(cell\.status\)/);
    // Hardcoded status label literals are forbidden inside the cell block.
    for (const forbidden of [
      "Compliant",
      "Expiring",
      "Overdue",
      "Awaiting Review",
      "Missing",
      "Not Applicable",
    ]) {
      // Allow the literal to appear inside a comment, but not as a JSX text
      // node or attribute value. This is a coarse check — the T20 test in
      // t20-label-source-contract.test.ts does the precise file-wide scan.
      expect(cellBlock!).not.toMatch(new RegExp(`>${forbidden}<`));
    }
  });
});
