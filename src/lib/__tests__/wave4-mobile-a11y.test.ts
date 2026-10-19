import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================================
// Wave 4: Mobile / accessibility improvements — top 7 fixes from the audit.
//
// Audit (subagent scan) found 8 issues. Wave 4 implements the top 7 (skips
// #6 — Select Label htmlFor association — because it touches ~20 call sites
// across 10 files, too broad for one batch; deferred to Wave 5).
//
// Fixes (in order of severity):
//   #1 — Skip-to-content link in app-shell.tsx (WCAG 2.4.1 Bypass Blocks)
//   #2 — Calendar <div onClick> → <button> (WCAG 2.1.1 Keyboard)
//   #3 — role="alert" on FieldError (WCAG 3.3.1 + 4.1.3)
//   #4 — Restore <h1> on Compliance view (WCAG 1.3.1 + 2.4.6)
//   #5 — Union detail <h1> + heading hierarchy (WCAG 1.3.1)
//   #7 — Account-security <Switch> aria-labels (WCAG 4.1.2)
//   #8 — Tab bars ARIA tablist pattern (compliance, unions-detail, calendar)
//         (WCAG 4.1.2)
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");
const APP_SHELL = resolve(SRC_ROOT, "src/components/app/app-shell.tsx");
const FIELD_ERROR = resolve(SRC_ROOT, "src/components/app/field-error.tsx");
const CALENDAR = resolve(SRC_ROOT, "src/components/app/views/calendar.tsx");
const COMPLIANCE = resolve(SRC_ROOT, "src/components/app/views/compliance.tsx");
const UNIONS = resolve(SRC_ROOT, "src/components/app/views/unions.tsx");
const ACCOUNT_SECURITY = resolve(SRC_ROOT, "src/components/app/views/account-security.tsx");

// =============================================================================
// Fix #1 — Skip-to-content link
// =============================================================================

describe("Wave 4 / Fix #1: skip-to-content link in app-shell", () => {
  const src = readFileSync(APP_SHELL, "utf-8");

  it("app-shell has a 'Skip to main content' link as the first focusable element", () => {
    // The skip link must appear BEFORE the <header> in source order so it's
    // the first thing keyboard users tab to.
    const skipIdx = src.indexOf("Skip to main content");
    const headerIdx = src.indexOf("<header");
    expect(skipIdx, "skip link text must exist").toBeGreaterThan(-1);
    expect(headerIdx, "<header> must exist").toBeGreaterThan(-1);
    expect(skipIdx, "skip link must come BEFORE <header> in source").toBeLessThan(headerIdx);
  });

  it("skip link is visually hidden until focused (sr-only + focus:not-sr-only)", () => {
    // The standard pattern: sr-only by default, focus:not-sr-only to reveal.
    expect(src).toMatch(/sr-only focus:not-sr-only/);
  });

  it("skip link href matches the id on <main>", () => {
    expect(src).toMatch(/href="#main-content"/);
    expect(src).toMatch(/<main[^>]*id="main-content"/);
  });

  it("skip link has visible focus styling (absolute positioning + bg + ring)", () => {
    // When revealed, it should appear top-left with a visible background +
    // focus ring so the user can see where focus landed.
    expect(src).toMatch(/focus:absolute focus:left-2 focus:top-2/);
    expect(src).toMatch(/focus:bg-background/);
    expect(src).toMatch(/focus:ring-2 focus:ring-ring/);
  });
});

// =============================================================================
// Fix #2 — Calendar <div onClick> → <button>
// =============================================================================

describe("Wave 4 / Fix #2: calendar div onClick → button (keyboard accessible)", () => {
  const src = readFileSync(CALENDAR, "utf-8");

  it("calendar day cells are <button type=\"button\"> (not <div onClick>)", () => {
    // Find the calendar grid block + verify day cells are buttons.
    // The grid starts with "Calendar grid" comment.
    const gridStartIdx = src.indexOf("Calendar grid");
    expect(gridStartIdx, "Calendar grid comment must exist").toBeGreaterThan(-1);
    const gridBlock = src.slice(gridStartIdx, gridStartIdx + 3000);
    // Day cells are buttons (not divs with onClick). The <button> tag and
    // onClick may be on separate lines (Prettier reformats), so we check
    // the block contains both a <button + handleDayClick onClick.
    expect(gridBlock).toMatch(/<button/);
    expect(gridBlock).toMatch(/onClick=\{\(\) => handleDayClick/);
    // The OLD pattern (<div onClick={handleDayClick}) must NOT appear.
    expect(gridBlock).not.toMatch(/<div[^>]*onClick=\{\(\) => handleDayClick/);
  });

  it("calendar day buttons have aria-label with date + event count", () => {
    expect(src).toMatch(/aria-label=\{`\$\{cell\.dateStr\}[\s\S]*?event/);
  });

  it("calendar day buttons have aria-current=\"date\" for today", () => {
    expect(src).toMatch(/aria-current=\{isToday \? "date" : undefined\}/);
  });

  it("calendar event chips inside day cells are <button> (not <div onClick>)", () => {
    // Event chips were <div onClick> — converted to <button> so they're
    // individually focusable + Enter-activated.
    expect(src).toMatch(/<button[\s\S]*?onClick=\{\(ev\) => \{[\s\S]*?ev\.stopPropagation\(\);[\s\S]*?handleEventClick/);
  });

  it("calendar day-detail dialog event rows are <button> (not <div onClick>)", () => {
    // The selectedDay dialog's event rows were <div onClick> — converted.
    // Find the dialog block by SelectedDay events map.
    const dialogBlockMatch = src.match(/selectedDay\?\.events\.map\(\(e, i\) => [\s\S]*?<\/button>\s*\)\)/);
    expect(dialogBlockMatch, "selectedDay events block must exist").not.toBeNull();
    const dialogBlock = dialogBlockMatch![0];
    expect(dialogBlock).toMatch(/<button/);
    expect(dialogBlock).not.toMatch(/<div[^>]*onClick=/);
  });

  it("calendar day buttons have focus-visible:ring-2 (keyboard focus indicator)", () => {
    expect(src).toMatch(/focus-visible:ring-2 focus-visible:ring-ring/);
  });

  it("calendar empty day cells are aria-hidden (decorative, not focusable)", () => {
    // Empty cells (no dateStr) are non-interactive placeholders. They
    // shouldn't be announced by screen readers.
    expect(src).toMatch(/aspect-square min-h-\[80px\] rounded border border-dashed border-muted" aria-hidden="true"/);
  });
});

// =============================================================================
// Fix #3 — role="alert" on FieldError
// =============================================================================

describe("Wave 4 / Fix #3: FieldError has role=\"alert\"", () => {
  const src = readFileSync(FIELD_ERROR, "utf-8");

  it("FieldError wrapper div has role=\"alert\"", () => {
    expect(src).toMatch(/role="alert"/);
  });

  it("FieldError AlertCircle icon has aria-hidden=\"true\" (decorative)", () => {
    // The icon is decorative — the error text is the meaningful content.
    // aria-hidden prevents SR from announcing "alert circle" before the text.
    expect(src).toMatch(/AlertCircle[^>]*aria-hidden="true"/);
  });
});

// =============================================================================
// Fix #4 — Restore <h1> on Compliance view
// =============================================================================

describe("Wave 4 / Fix #4: Compliance view has an sr-only <h1>", () => {
  const src = readFileSync(COMPLIANCE, "utf-8");

  it("Compliance view renders <h1 className=\"sr-only\">Compliance</h1>", () => {
    expect(src).toMatch(/<h1 className="sr-only">Compliance<\/h1>/);
  });

  it("the h1 appears before the tab bar (so SR users land on the heading first)", () => {
    const h1Idx = src.indexOf('<h1 className="sr-only">Compliance</h1>');
    const tablistIdx = src.indexOf('role="tablist"');
    expect(h1Idx).toBeGreaterThan(-1);
    expect(tablistIdx).toBeGreaterThan(-1);
    expect(h1Idx).toBeLessThan(tablistIdx);
  });
});

// =============================================================================
// Fix #5 — Union detail <h1> + heading hierarchy
// =============================================================================

describe("Wave 4 / Fix #5: union detail has proper heading hierarchy", () => {
  const src = readFileSync(UNIONS, "utf-8");

  it("union name is rendered as <h1> (was <CardTitle> which renders as <div>)", () => {
    // Find the union-detail branch (selectedUnion !== null). The h1 should
    // have the union name + text-xl font-semibold classes (matches the
    // old CardTitle's visual styling).
    expect(src).toMatch(/<h1 className="text-xl font-semibold[^"]*">\{selectedUnion\.unionName\}<\/h1>/);
  });

  it("union detail no longer uses <CardTitle> for the union name", () => {
    // The old CardTitle className="text-xl" line is gone.
    expect(src).not.toMatch(/<CardTitle className="text-xl">\{selectedUnion\.unionName\}<\/CardTitle>/);
  });

  it("'My filings' / 'Documents' section heading is <h2> (was <h4>)", () => {
    // Was h4 — promoted to h2 so the hierarchy is h1 (union) → h2 (section).
    expect(src).toMatch(/<h2 className="mb-3 text-sm font-medium">\s*\{isOfficer \? "My filings" : "Documents"\}/);
  });

  it("document category labels are <h3> (was <h5>)", () => {
    // Was h5 — promoted to h3 so the hierarchy is h1 → h2 → h3.
    expect(src).toMatch(/<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">\s*\{cat\.label\}/);
  });

  it("union detail no longer skips heading levels in the documents tab (h1 → h2 → h3, no h4/h5)", () => {
    // The OLD code had h1 (list view) → h4 (Documents section) → h5 (category)
    // in the documents tab. Wave 4 promotes them to h2/h3.
    //
    // We scope the check to the documents-tab block (between hubTab === "documents"
    // and the next hubTab === ... branch) so we don't catch the h4 used by
    // UnionHistoryTab/UnionTasksTab/UnionComplianceTab sub-components (which
    // are valid — they're separate tab panels with their own heading hierarchy).
    const documentsTabStart = src.indexOf('hubTab === "documents"');
    expect(documentsTabStart, "documents tab block must exist").toBeGreaterThan(-1);
    // Find the next hubTab === "..." after the documents tab.
    const nextTabMatch = src.slice(documentsTabStart + 10).match(/hubTab === "(compliance|tasks|history)"/);
    const documentsTabEnd = nextTabMatch
      ? documentsTabStart + 10 + nextTabMatch.index!
      : src.length;
    // Strip JSX comments before checking — comments may mention <h4> in
    // explanatory text (e.g. "Wave 4 / a11y #5: promote <h4> → <h2>").
    const documentsBlock = src
      .slice(documentsTabStart, documentsTabEnd)
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    // The documents tab should have h2 (section) + h3 (category), no h4/h5.
    expect(documentsBlock).toMatch(/<h2\b/);
    expect(documentsBlock).toMatch(/<h3\b/);
    expect(documentsBlock).not.toMatch(/<h4\b/);
    expect(documentsBlock).not.toMatch(/<h5\b/);
  });
});

// =============================================================================
// Fix #7 — Account-security <Switch> aria-labels
// =============================================================================

describe("Wave 4 / Fix #7: account-security switches have aria-labels", () => {
  const src = readFileSync(ACCOUNT_SECURITY, "utf-8");

  it("Email notifications Switch has aria-label", () => {
    expect(src).toMatch(/aria-label="Email notifications"/);
  });

  it("SMS notifications Switch has aria-label", () => {
    expect(src).toMatch(/aria-label="SMS notifications"/);
  });

  it("WhatsApp notifications Switch has aria-label", () => {
    expect(src).toMatch(/aria-label="WhatsApp notifications"/);
  });

  it("all three aria-labels are distinct (no copy-paste error)", () => {
    const matches = src.match(/aria-label="(Email|SMS|WhatsApp) notifications"/g);
    expect(matches).not.toBeNull();
    expect(new Set(matches).size).toBe(3);
  });
});

// =============================================================================
// Fix #8 — Tab bars ARIA tablist pattern
// =============================================================================

describe("Wave 4 / Fix #8: tab bars use ARIA tablist pattern", () => {
  describe("compliance view tab bar", () => {
    const src = readFileSync(COMPLIANCE, "utf-8");

    it("has role=\"tablist\" with aria-label", () => {
      expect(src).toMatch(/role="tablist" aria-label="Compliance view sections"/);
    });

    it("tab buttons have role=\"tab\" + aria-selected + roving tabIndex", () => {
      expect(src).toMatch(/role="tab"/);
      expect(src).toMatch(/aria-selected=\{tab === t\}/);
      expect(src).toMatch(/tabIndex=\{tab === t \? 0 : -1\}/);
    });
  });

  describe("union detail tab bar", () => {
    const src = readFileSync(UNIONS, "utf-8");

    it("has role=\"tablist\" with aria-label", () => {
      expect(src).toMatch(/role="tablist" aria-label="Union hub sections"/);
    });

    it("tab buttons have role=\"tab\" + aria-selected + roving tabIndex", () => {
      expect(src).toMatch(/role="tab"/);
      expect(src).toMatch(/aria-selected=\{hubTab === t\}/);
      expect(src).toMatch(/tabIndex=\{hubTab === t \? 0 : -1\}/);
    });
  });

  describe("calendar tab bar", () => {
    const src = readFileSync(CALENDAR, "utf-8");

    it("has role=\"tablist\" with aria-label", () => {
      expect(src).toMatch(/role="tablist" aria-label="Calendar view types"/);
    });

    it("tab buttons have role=\"tab\" + aria-selected + roving tabIndex", () => {
      expect(src).toMatch(/role="tab"/);
      expect(src).toMatch(/aria-selected=\{tab === t\}/);
      expect(src).toMatch(/tabIndex=\{tab === t \? 0 : -1\}/);
    });

    it("tab buttons have focus-visible:ring-2 (was missing before)", () => {
      // The audit noted calendar's tab buttons had NO focus-visible ring.
      expect(src).toMatch(/focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/);
    });
  });
});

// =============================================================================
// Cross-cutting: no regressions in Wave 1/2/3 work
// =============================================================================

describe("Wave 4: no regressions in prior-wave work", () => {
  it("Wave 1 compliance cell icon + aria-label still present", () => {
    const src = readFileSync(COMPLIANCE, "utf-8");
    expect(src).toMatch(/role="img"/);
    expect(src).toMatch(/aria-label=\{`\$\{row\.unionName\} — \$\{cell\.documentType\}/);
  });

  it("Wave 1 icon-only button touch targets (h-11 w-11) still present", () => {
    const src = readFileSync(CALENDAR, "utf-8");
    expect(src).toMatch(/h-11 w-11/);
  });

  it("Wave 3 two-person approval yellow badge still present in reviews view", () => {
    const reviewsSrc = readFileSync(resolve(SRC_ROOT, "src/components/app/views/reviews.tsx"), "utf-8");
    expect(reviewsSrc).toMatch(/Awaiting 2nd approval/);
  });
});
