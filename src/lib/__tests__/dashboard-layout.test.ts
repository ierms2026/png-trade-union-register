import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DASHBOARD_BREAKPOINT_PX } from "../dashboard/status-config";

// =============================================================================
// Dashboard layout — chunk 6.1 DOM-order + tab-order contract tests.
//
// These tests are STATIC (source-text assertions) rather than runtime render
// tests. The project doesn't have @testing-library/react installed, and
// adding it for one test would be a new dependency (forbidden by the 6.1
// scope guard: "No new dependencies"). The source-text approach is
// sufficient for the DOM-order contract: the data-testid markers appear in
// the source in the order the contract requires, and JSX preserves source
// order in the rendered DOM (no CSS `order` or flex-order tricks per the
// spec: "CSS `order`/flex-order that diverges from DOM order is FORBIDDEN").
//
// CONTRACT (from chunk 6.1 spec — "order = reading order"):
//   1. Quick Actions
//   2. KPI band (7 cards: Total Unions · Documents · Compliance Rate ·
//      Compliant · Expiring · Overdue · Missing)
//   3. Needs Attention (wider) | Composition Bar
//   4. Compliance Heatmap (full width)
//   5. Required vs On-File Meters (wider) | Expiry Forecast
//   6. Trend Chart | Recent Activity
//
// TAB ORDER (per spec: "assert the first focusable after the KPI band is
// inside Needs Attention (tab-order follows priority)"):
//   The DOM order asserts this implicitly — after the KPI band's <a> links
//   (which are the KPI band's focusables), the next focusable element MUST
//   be inside Needs Attention. The source-order assertion verifies this
//   because the Needs Attention data-testid appears before any other
//   interactive element after the KPI band.
// =============================================================================

const DASHBOARD_PATH = resolve(
  __dirname,
  "../../../src/components/app/views/dashboard.tsx",
);
const source = readFileSync(DASHBOARD_PATH, "utf-8");

/**
 * Find all `data-testid="..."` markers in the DashboardView return block
 * (not the RateKpiCard or RecentActivityPanel component definitions, which
 * also have testids in their own internals — but we want the top-level
 * layout testids).
 *
 * We extract them by scanning the source line-by-line and recording the
 * testid + line number. The DashboardView return block is the section
 * between `export function DashboardView` and the next `^}` at column 0.
 */
function extractLayoutTestids(src: string): Array<{ testid: string; line: number }> {
  const lines = src.split("\n");
  // Find the start of DashboardView's return block.
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^export function DashboardView/.test(lines[i])) {
      startLine = i;
      break;
    }
  }
  if (startLine === -1) {
    throw new Error("DashboardView export not found");
  }
  // Find the end — the first `^}` at column 0 after startLine.
  let endLine = lines.length;
  for (let i = startLine + 1; i < lines.length; i++) {
    if (lines[i] === "}") {
      endLine = i;
      break;
    }
  }
  // Extract testids from that range. Only top-level layout testids
  // (the ones the contract asserts). We list them here so the test fails
  // loudly if a testid is renamed or removed without updating this list.
  const layoutTestids = new Set([
    "quick-actions",
    "kpi-band",
    "needs-attention",
    "composition-bar",
    "heatmap",
    "required-vs-on-file",
    "expiry-forecast",
    "trend-chart",
    "recent-activity",
  ]);
  const found: Array<{ testid: string; line: number }> = [];
  for (let i = startLine; i < endLine; i++) {
    const match = lines[i].match(/data-testid="([^"]+)"/);
    if (match && layoutTestids.has(match[1])) {
      found.push({ testid: match[1], line: i + 1 });
    }
  }
  return found;
}

describe("dashboard layout — chunk 6.1 DOM-order contract", () => {
  it("DASHBOARD_BREAKPOINT_PX is 1024 (the chunk spec's ~1024px; 6.2 may tune)", () => {
    expect(DASHBOARD_BREAKPOINT_PX).toBe(1024);
  });

  it("DashboardView is exported (source-text check)", () => {
    expect(source).toMatch(/^export function DashboardView/m);
  });

  it("every contract testid is present in the DashboardView return block", () => {
    const found = extractLayoutTestids(source);
    const foundTestids = new Set(found.map((f) => f.testid));
    const expected = [
      "quick-actions",
      "kpi-band",
      "needs-attention",
      "composition-bar",
      "heatmap",
      "required-vs-on-file",
      "expiry-forecast",
      "trend-chart",
      "recent-activity",
    ];
    for (const t of expected) {
      expect(foundTestids.has(t)).toBe(true);
    }
  });

  it("DOM source order matches the contract (reading order = tab order)", () => {
    // Design-system fix: the order was reordered to put KPIs first (they're
    // the reason you visit a dashboard). The new contract:
    //   1. KPI band → 2. Quick Actions → 3. Needs Attention + Composition
    //   → 4. Heatmap → 5. Required-vs-on-file + Expiry Forecast
    //   → 6. Trend + Recent Activity.
    //
    // Within row 3, Needs Attention comes BEFORE Composition Bar
    //    (actionability first per spec).
    // Within row 5, Required-vs-on-file comes BEFORE Expiry Forecast
    //    (per spec: meters wider, on the left).
    // Within row 6, Trend comes BEFORE Recent Activity (per spec).
    const found = extractLayoutTestids(source);
    const order = found.map((f) => f.testid);
    const expectedOrder = [
      "kpi-band",             // Row 1 (was Row 2 — moved to top per design review)
      "quick-actions",        // Row 2 (was Row 1 — moved below KPIs with a section header)
      "needs-attention",      // Row 3, left (wider)
      "composition-bar",      // Row 3, right (narrower)
      "heatmap",              // Row 4, full width
      "required-vs-on-file",  // Row 5, left (wider)
      "expiry-forecast",     // Row 5, right (narrower)
      "trend-chart",          // Row 6, left
      "recent-activity",      // Row 6, right
    ];
    expect(order).toEqual(expectedOrder);
  });

  it("KPI band contains the Rate card (Compliance Rate) between Documents and Compliant", () => {
    // The 6.1 contract: KPI band has 7 cards in this order:
    //   Total Unions · Documents · Compliance Rate · Compliant · Expiring · Overdue · Missing
    //
    // The rate is the promoted 3rd card. We assert the source contains
    // <RateKpiCard ... /> between the Documents StatCard and the
    // getTileStatuses().map() block (which produces the 4 status cards in
    // APPLICABLE_STATUSES order: Compliant, Expiring, Overdue, Missing).
    const kpiBandStart = source.indexOf('data-testid="kpi-band"');
    expect(kpiBandStart).toBeGreaterThan(-1);
    // Find the end of the KPI band block (the closing </div> of the grid).
    // We search for the RateKpiCard within a window after the kpi-band
    // testid — it should appear before getTileStatuses().map.
    const kpiBandSection = source.slice(kpiBandStart, kpiBandStart + 4000);
    expect(kpiBandSection).toContain("<RateKpiCard");
    // Verify RateKpiCard comes BEFORE getTileStatuses().map in the KPI band
    // (Rate is the 3rd card; the 4 status cards come after).
    const rateIdx = kpiBandSection.indexOf("<RateKpiCard");
    const tileMapIdx = kpiBandSection.indexOf("getTileStatuses().map");
    expect(rateIdx).toBeGreaterThan(-1);
    expect(tileMapIdx).toBeGreaterThan(-1);
    expect(rateIdx).toBeLessThan(tileMapIdx);
  });

  it("the rate card reads from stats.compliance.rate (canonical metric, no recompute)", () => {
    // The RateKpiCard invocation must pass stats.compliance.rate.{numerator,
    // denominator, percentage} — the canonical metric shape from 1.2.
    // No percentage computation in the component (1.2 invariant preserved).
    const rateCardInvocation = source.match(
      /<RateKpiCard\s+numerator=\{stats\.compliance\.rate\.numerator\}\s+denominator=\{stats\.compliance\.rate\.denominator\}\s+percentage=\{stats\.compliance\.rate\.percentage\}\s+sparklineValues=\{rateSparklineValues\}\s*\/>/,
    );
    expect(rateCardInvocation).not.toBeNull();
  });

  it("the retired Compliance Summary card has zero residue (no <CardTitle>Compliance Summary</CardTitle>)", () => {
    // The 1.2 card was retired in 6.1; its content moved to RateKpiCard.
    // The only "Compliance Summary" mentions should be in COMMENTS
    // (handoff notes). A <CardTitle>Compliance Summary</CardTitle> in
    // actual JSX would be a regression.
    expect(source).not.toMatch(/<CardTitle[^>]*>Compliance Summary<\/CardTitle>/);
  });

  it("no CSS `order:` utilities used to reorder layout (DOM order must equal visual order)", () => {
    // Per 6.1 spec: "CSS `order`/flex-order that diverges from DOM order is
    // FORBIDDEN (tab order must match visual order)." Tailwind's `order-*`
    // classes would violate this. We assert none appear in the
    // DashboardView return block.
    const lines = source.split("\n");
    let inReturnBlock = false;
    for (const line of lines) {
      if (/^export function DashboardView/.test(line)) inReturnBlock = true;
      if (inReturnBlock && line === "}") break;
      if (inReturnBlock) {
        // Match `order-1`, `order-2`, etc. — NOT `order=` (HTML attribute),
        // NOT `border-` (which contains "order" as a substring).
        if (/\border-\d+\b/.test(line) && !/border-/.test(line)) {
          throw new Error(
            `Forbidden CSS order utility found: ${line.trim()}`,
          );
        }
      }
    }
  });

  it("no absolute positioning in the DashboardView return block (per 6.1 scope guard)", () => {
    // Per 6.1 spec: "no absolute positioning". Tailwind's `absolute` class
    // would violate this. (The `relative` class is OK — it's used by
    // card-internal layouts, not for page-layout positioning.)
    const lines = source.split("\n");
    let inReturnBlock = false;
    for (const line of lines) {
      if (/^export function DashboardView/.test(line)) inReturnBlock = true;
      if (inReturnBlock && line === "}") break;
      if (inReturnBlock) {
        // Match `absolute` as a standalone Tailwind class, NOT as a
        // substring of `absolute_path` or similar.
        if (/\babsolute\b/.test(line) && !/absolutely/.test(line)) {
          throw new Error(
            `Forbidden absolute positioning found: ${line.trim()}`,
          );
        }
      }
    }
  });

  it("KPI band uses auto-fit (not a fixed column count) so cards wrap responsively", () => {
    // Per 6.1 spec: "KPI band wraps via auto-fit rather than shrinking
    // cards to unreadability." A fixed `grid-cols-N` would shrink cards at
    // narrow widths; `auto-fit + minmax` wraps them.
    const kpiBandStart = source.indexOf('data-testid="kpi-band"');
    expect(kpiBandStart).toBeGreaterThan(-1);
    const kpiBandSection = source.slice(kpiBandStart, kpiBandStart + 800);
    expect(kpiBandSection).toMatch(/auto-fit/);
    expect(kpiBandSection).toMatch(/minmax/);
    // Explicitly NOT a fixed grid-cols class on the KPI band:
    // The old layout was `grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6`.
    // The new layout uses inline `gridTemplateColumns: repeat(auto-fit, minmax(140px, 1fr))`.
    // The test asserts the inline style is present (no fixed grid-cols-* class).
    expect(kpiBandSection).toMatch(/gridTemplateColumns/);
  });

  it("two-column rows use `lg:grid-cols-2` or `lg:grid-cols-5` (Tailwind's lg: = 1024px = DASHBOARD_BREAKPOINT_PX)", () => {
    // Per 6.1 spec: "two-column rows stack below a single named BREAKPOINT
    // constant (~1024px)." Tailwind's `lg:` prefix = 1024px by default,
    // matching DASHBOARD_BREAKPOINT_PX. The three two-column rows must use
    // `lg:grid-cols-*` so they stack below 1024px.
    //
    // The grid wrapper is the PARENT of the testid-bearing child <div>, so
    // we search backward from the testid for the nearest `className="grid`
    // opening tag (which contains the `lg:grid-cols-*` class).
    const needsAttentionIdx = source.indexOf('data-testid="needs-attention"');
    const before = source.slice(Math.max(0, needsAttentionIdx - 500), needsAttentionIdx);
    const gridMatches = before.match(/<div className="grid[^"]*"/g);
    expect(gridMatches).not.toBeNull();
    expect(gridMatches![gridMatches!.length - 1]).toMatch(/lg:grid-cols-5/);

    const metersIdx = source.indexOf('data-testid="required-vs-on-file"');
    const beforeMeters = source.slice(Math.max(0, metersIdx - 500), metersIdx);
    const gridMatchesMeters = beforeMeters.match(/<div className="grid[^"]*"/g);
    expect(gridMatchesMeters).not.toBeNull();
    expect(gridMatchesMeters![gridMatchesMeters!.length - 1]).toMatch(/lg:grid-cols-5/);

    const trendIdx = source.indexOf('data-testid="trend-chart"');
    const beforeTrend = source.slice(Math.max(0, trendIdx - 500), trendIdx);
    const gridMatchesTrend = beforeTrend.match(/<div className="grid[^"]*"/g);
    expect(gridMatchesTrend).not.toBeNull();
    expect(gridMatchesTrend![gridMatchesTrend!.length - 1]).toMatch(/lg:grid-cols-2/);
  });

  it("column spans: Needs Attention wider (3/5), Composition narrower (2/5)", () => {
    const naIdx = source.indexOf('data-testid="needs-attention"');
    expect(source.slice(naIdx, naIdx + 200)).toMatch(/lg:col-span-3/);
    const cbIdx = source.indexOf('data-testid="composition-bar"');
    expect(source.slice(cbIdx, cbIdx + 200)).toMatch(/lg:col-span-2/);
  });

  it("column spans: Required-vs-on-file wider (3/5), Expiry Forecast narrower (2/5)", () => {
    const metersIdx = source.indexOf('data-testid="required-vs-on-file"');
    expect(source.slice(metersIdx, metersIdx + 200)).toMatch(/lg:col-span-3/);
    const efIdx = source.indexOf('data-testid="expiry-forecast"');
    expect(source.slice(efIdx, efIdx + 200)).toMatch(/lg:col-span-2/);
  });

  it("Trend + Recent Activity use a 50/50 split (lg:grid-cols-2, no col-span overrides)", () => {
    // The trend/activity row is a balanced 50/50 — no `lg:col-span-*`
    // overrides on either child. The default 1/2 + 1/2 split applies.
    const trendIdx = source.indexOf('data-testid="trend-chart"');
    const trendSection = source.slice(trendIdx, trendIdx + 200);
    expect(trendSection).not.toMatch(/lg:col-span/);

    const raIdx = source.indexOf('data-testid="recent-activity"');
    const raSection = source.slice(raIdx, raIdx + 200);
    expect(raSection).not.toMatch(/lg:col-span/);
  });

  it("rows use `items-start` (no void-filling height stretches)", () => {
    // Per 6.1 spec: "No void-filling hacks: natural heights, align-start."
    // Each two-column grid wrapper must have `items-start` so the shorter
    // card doesn't get stretched to match the taller one.
    //
    // The grid wrapper is the PARENT of the testid-bearing child <div>, so
    // we search backward from the testid for the nearest `className="grid`
    // opening tag (which should contain `items-start`).
    const rowMarkers = [
      'data-testid="needs-attention"',
      'data-testid="required-vs-on-file"',
      'data-testid="trend-chart"',
    ];
    for (const marker of rowMarkers) {
      const idx = source.indexOf(marker);
      expect(idx).toBeGreaterThan(-1);
      const before = source.slice(Math.max(0, idx - 500), idx);
      const gridMatches = before.match(/<div className="grid[^"]*"/g);
      expect(gridMatches).not.toBeNull();
      const lastGrid = gridMatches![gridMatches!.length - 1];
      expect(lastGrid).toMatch(/items-start/);
    }
  });

  it("tab order: first focusable after the KPI band is inside Quick Actions (then Needs Attention)", () => {
    // Design-system fix: Quick Actions now sit between the KPI band and
    // Needs Attention (was: KPI band → Needs Attention directly). The
    // Quick Actions section has focusable buttons, so the first focusable
    // after the KPI band is now inside Quick Actions. Needs Attention
    // follows as the first focusable in Row 3.
    //
    // We assert the new order: kpi-band → quick-actions → needs-attention.
    const found = extractLayoutTestids(source);
    const kpiBandIdx = found.findIndex((f) => f.testid === "kpi-band");
    const quickActionsIdx = found.findIndex((f) => f.testid === "quick-actions");
    const needsAttentionIdx = found.findIndex((f) => f.testid === "needs-attention");
    expect(kpiBandIdx).toBeGreaterThan(-1);
    expect(quickActionsIdx).toBeGreaterThan(-1);
    expect(needsAttentionIdx).toBeGreaterThan(-1);
    // Quick Actions is immediately after KPI band.
    expect(quickActionsIdx).toBe(kpiBandIdx + 1);
    // Needs Attention follows Quick Actions.
    expect(needsAttentionIdx).toBe(quickActionsIdx + 1);
  });
});
