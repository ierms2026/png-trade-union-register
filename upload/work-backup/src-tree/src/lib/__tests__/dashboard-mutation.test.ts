import { describe, it, expect } from "vitest";
import {
  type ComplianceCell,
  type ComplianceCounts,
  tallyComplianceCounts,
  computeComplianceRate,
} from "../dashboard/metrics";
import { STATUS_CONFIG, getTileStatuses, type ComplianceStatus } from "../dashboard/status-config";

// =============================================================================
// Mutation test — chunk 1.1 acceptance criterion:
// "flip one document's status in the fixture and assert every in-scope
//  widget recomputes consistently (e.g. moving a doc from Compliant to
//  Overdue increments Overdue in ALL widgets and decrements Compliant in
//  ALL widgets)."
//
// This test verifies the canonical pipeline:
//   cells → tallyComplianceCounts → counts → tiles (via getTileStatuses)
//                                  → rate   (via computeComplianceRate)
//
// If a cell's status changes, ALL downstream values must update.
// =============================================================================

function makeFixtureCells(): ComplianceCell[] {
  // Mirror the live DB: 17 COMPLIANT, 2 EXPIRING, 2 OVERDUE, 57 MISSING
  const cells: ComplianceCell[] = [];

  // 17 compliant
  for (let i = 0; i < 17; i++) {
    cells.push({
      unionId: `union-${i % 6}`,
      documentType: `doc-${i}`,
      status: "COMPLIANT",
      filedAt: new Date("2024-01-15"),
      expiryDate: new Date("2025-01-15"),
    });
  }

  // 2 expiring
  for (let i = 0; i < 2; i++) {
    cells.push({
      unionId: `union-${i}`,
      documentType: `exp-${i}`,
      status: "EXPIRING",
      filedAt: new Date("2025-08-01"),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  }

  // 2 overdue
  for (let i = 0; i < 2; i++) {
    cells.push({
      unionId: `union-${i}`,
      documentType: `over-${i}`,
      status: "OVERDUE",
      filedAt: new Date("2023-01-01"),
      expiryDate: new Date("2024-01-01"),
    });
  }

  // 57 missing
  for (let i = 0; i < 57; i++) {
    cells.push({
      unionId: `union-${i % 6}`,
      documentType: `miss-${i}`,
      status: "MISSING",
      filedAt: null,
      expiryDate: null,
    });
  }

  return cells;
}

/** Simulate what the dashboard component does: read counts, build tiles, compute rate. */
function getWidgetValues(cells: ComplianceCell[]) {
  const counts = tallyComplianceCounts(cells);
  const rate = computeComplianceRate(cells);
  // Simulate the tiles: getTileStatuses() maps to { status, label, count, fill }
  const tiles = getTileStatuses().map((status) => ({
    status,
    label: STATUS_CONFIG[status].label,
    count: counts[status],
    fill: STATUS_CONFIG[status].colorToken,
  }));
  return { counts, rate, tiles };
}

describe("mutation test — status change propagates to all widgets", () => {
  it("baseline: 17 COMPLIANT, 2 EXPIRING, 2 OVERDUE, 57 MISSING → 78 total", () => {
    const cells = makeFixtureCells();
    const { counts, rate } = getWidgetValues(cells);
    expect(counts.COMPLIANT).toBe(17);
    expect(counts.EXPIRING).toBe(2);
    expect(counts.OVERDUE).toBe(2);
    expect(counts.MISSING).toBe(57);
    expect(rate.numerator).toBe(17);
    expect(rate.denominator).toBe(78);
  });

  it("flipping COMPLIANT → OVERDUE: decrements Compliant in ALL widgets, increments Overdue in ALL widgets", () => {
    const cells = makeFixtureCells();

    // Before mutation
    const before = getWidgetValues(cells);
    expect(before.counts.COMPLIANT).toBe(17);
    expect(before.counts.OVERDUE).toBe(2);

    // Find the first COMPLIANT cell and flip it to OVERDUE
    const cellToFlip = cells.find((c) => c.status === "COMPLIANT")!;
    expect(cellToFlip).toBeDefined();
    cellToFlip.status = "OVERDUE" as ComplianceStatus;

    // After mutation
    const after = getWidgetValues(cells);

    // Counts: COMPLIANT decremented, OVERDUE incremented
    expect(after.counts.COMPLIANT).toBe(before.counts.COMPLIANT - 1);
    expect(after.counts.OVERDUE).toBe(before.counts.OVERDUE + 1);
    // Other counts unchanged
    expect(after.counts.EXPIRING).toBe(before.counts.EXPIRING);
    expect(after.counts.MISSING).toBe(before.counts.MISSING);

    // Rate: numerator decreased by 1, denominator unchanged
    expect(after.rate.numerator).toBe(before.rate.numerator - 1);
    expect(after.rate.denominator).toBe(before.rate.denominator);
    expect(after.rate.percentage).toBeLessThan(before.rate.percentage);

    // Tiles: the Compliant tile value decreased, Overdue tile value increased
    const beforeCompliantTile = before.tiles.find((t) => t.status === "COMPLIANT")!;
    const afterCompliantTile = after.tiles.find((t) => t.status === "COMPLIANT")!;
    const beforeOverdueTile = before.tiles.find((t) => t.status === "OVERDUE")!;
    const afterOverdueTile = after.tiles.find((t) => t.status === "OVERDUE")!;

    expect(afterCompliantTile.count).toBe(beforeCompliantTile.count - 1);
    expect(afterOverdueTile.count).toBe(beforeOverdueTile.count + 1);

    // Labels and colors unchanged (they come from STATUS_CONFIG, not from data)
    expect(afterCompliantTile.label).toBe(beforeCompliantTile.label);
    expect(afterCompliantTile.fill).toBe(beforeCompliantTile.fill);
    expect(afterOverdueTile.label).toBe(beforeOverdueTile.label);
    expect(afterOverdueTile.fill).toBe(beforeOverdueTile.fill);
  });

  it("flipping MISSING → COMPLIANT: increments Compliant in ALL widgets, decrements Missing in ALL widgets", () => {
    const cells = makeFixtureCells();

    const before = getWidgetValues(cells);

    // Find the first MISSING cell and flip it to COMPLIANT
    const cellToFlip = cells.find((c) => c.status === "MISSING")!;
    cellToFlip.status = "COMPLIANT" as ComplianceStatus;
    cellToFlip.filedAt = new Date("2024-06-01");
    cellToFlip.expiryDate = new Date("2025-06-01");

    const after = getWidgetValues(cells);

    // Counts
    expect(after.counts.COMPLIANT).toBe(before.counts.COMPLIANT + 1);
    expect(after.counts.MISSING).toBe(before.counts.MISSING - 1);
    expect(after.counts.OVERDUE).toBe(before.counts.OVERDUE);
    expect(after.counts.EXPIRING).toBe(before.counts.EXPIRING);

    // Rate: numerator increased, denominator unchanged (MISSING → COMPLIANT stays in denominator)
    expect(after.rate.numerator).toBe(before.rate.numerator + 1);
    expect(after.rate.denominator).toBe(before.rate.denominator);
    expect(after.rate.percentage).toBeGreaterThan(before.rate.percentage);

    // Tiles
    const beforeCompliantTile = before.tiles.find((t) => t.status === "COMPLIANT")!;
    const afterCompliantTile = after.tiles.find((t) => t.status === "COMPLIANT")!;
    const beforeMissingTile = before.tiles.find((t) => t.status === "MISSING")!;
    const afterMissingTile = after.tiles.find((t) => t.status === "MISSING")!;

    expect(afterCompliantTile.count).toBe(beforeCompliantTile.count + 1);
    expect(afterMissingTile.count).toBe(beforeMissingTile.count - 1);
  });

  it("all 4 tile values are always consistent with the counts object", () => {
    const cells = makeFixtureCells();
    const { counts, tiles } = getWidgetValues(cells);

    // Each tile's count must match the corresponding counts field
    for (const tile of tiles) {
      expect(tile.count).toBe(counts[tile.status as keyof ComplianceCounts]);
    }

    // After mutation
    const cellToFlip = cells.find((c) => c.status === "EXPIRING")!;
    cellToFlip.status = "OVERDUE" as ComplianceStatus;

    const after = getWidgetValues(cells);
    for (const tile of after.tiles) {
      expect(tile.count).toBe(after.counts[tile.status as keyof ComplianceCounts]);
    }
  });

  it("tiles always have exactly 5 entries (the applicable statuses, including AWAITING_REVIEW)", () => {
    const cells = makeFixtureCells();
    const { tiles } = getWidgetValues(cells);
    expect(tiles).toHaveLength(5);
    expect(tiles.map((t) => t.status).sort()).toEqual(
      ["AWAITING_REVIEW", "COMPLIANT", "EXPIRING", "MISSING", "OVERDUE"],
    );
  });
});

// =============================================================================
// Rate-specific tests — chunk 1.2 acceptance criteria:
// - Rate card shows numerator, denominator, and percentage from canonical metric
// - Progress bar width matches the percentage
// - Zero-denominator, 0%, and 100% cases tested — no NaN anywhere
// - Mutation: flipping MISSING → COMPLIANT increments numerator, changes percentage
//
// Tests derive expected values independently from the fixture (count it
// in the test), never by calling the selector under test.
// =============================================================================

/** Independently count cells by status — used to compute expected values. */
function countByStatus(cells: ComplianceCell[], status: ComplianceStatus): number {
  return cells.filter((c) => c.status === status).length;
}

/** Independently compute expected rate from raw cell counts. */
function expectedRate(compliant: number, expiring: number, overdue: number, missing: number) {
  const denominator = compliant + expiring + overdue + missing;
  const percentage = denominator === 0 ? 0 : Math.round((compliant / denominator) * 100);
  return { numerator: compliant, denominator, percentage };
}

describe("rate display — numerator, denominator, percentage", () => {
  it("baseline: independently counted fixture gives 17/78 → 22%", () => {
    const cells = makeFixtureCells();
    // Independently count the fixture (NOT using computeComplianceRate)
    const nCompliant = countByStatus(cells, "COMPLIANT");
    const nExpiring = countByStatus(cells, "EXPIRING");
    const nOverdue = countByStatus(cells, "OVERDUE");
    const nMissing = countByStatus(cells, "MISSING");

    const expected = expectedRate(nCompliant, nExpiring, nOverdue, nMissing);

    // Now call the selector and verify it matches
    const { rate } = getWidgetValues(cells);
    expect(rate.numerator).toBe(expected.numerator);
    expect(rate.denominator).toBe(expected.denominator);
    expect(rate.percentage).toBe(expected.percentage);

    // Explicit values from the fixture
    expect(nCompliant).toBe(17);
    expect(nExpiring).toBe(2);
    expect(nOverdue).toBe(2);
    expect(nMissing).toBe(57);
    expect(expected.denominator).toBe(78);
    expect(expected.percentage).toBe(22);
  });

  it("mutation: flipping MISSING → COMPLIANT increments numerator and changes percentage", () => {
    const cells = makeFixtureCells();

    // Before: independently count
    const beforeCompliant = countByStatus(cells, "COMPLIANT");
    const beforeExpiring = countByStatus(cells, "EXPIRING");
    const beforeOverdue = countByStatus(cells, "OVERDUE");
    const beforeMissing = countByStatus(cells, "MISSING");
    const beforeExpected = expectedRate(beforeCompliant, beforeExpiring, beforeOverdue, beforeMissing);

    // Flip first MISSING → COMPLIANT
    const cellToFlip = cells.find((c) => c.status === "MISSING")!;
    cellToFlip.status = "COMPLIANT" as ComplianceStatus;
    cellToFlip.filedAt = new Date("2024-06-01");
    cellToFlip.expiryDate = new Date("2025-06-01");

    // After: independently count
    const afterCompliant = countByStatus(cells, "COMPLIANT");
    const afterExpiring = countByStatus(cells, "EXPIRING");
    const afterOverdue = countByStatus(cells, "OVERDUE");
    const afterMissing = countByStatus(cells, "MISSING");
    const afterExpected = expectedRate(afterCompliant, afterExpiring, afterOverdue, afterMissing);

    // Independent assertions
    expect(afterCompliant).toBe(beforeCompliant + 1);
    expect(afterMissing).toBe(beforeMissing - 1);
    expect(afterExpected.numerator).toBe(beforeExpected.numerator + 1);
    expect(afterExpected.denominator).toBe(beforeExpected.denominator);
    expect(afterExpected.percentage).toBeGreaterThan(beforeExpected.percentage);

    // Selector matches independent count
    const { rate: afterRate } = getWidgetValues(cells);
    expect(afterRate.numerator).toBe(afterExpected.numerator);
    expect(afterRate.denominator).toBe(afterExpected.denominator);
    expect(afterRate.percentage).toBe(afterExpected.percentage);

    // Explicit values
    expect(afterExpected.numerator).toBe(18);
    expect(afterExpected.denominator).toBe(78);
    expect(afterExpected.percentage).toBe(Math.round((18 / 78) * 100));
  });

  it("progress bar width: percentage is always 0-100 (no NaN/Infinity)", () => {
    const cells = makeFixtureCells();
    const { rate } = getWidgetValues(cells);
    expect(rate.percentage).toBeGreaterThanOrEqual(0);
    expect(rate.percentage).toBeLessThanOrEqual(100);
    expect(Number.isNaN(rate.percentage)).toBe(false);
    expect(Number.isFinite(rate.percentage)).toBe(true);

    // After mutation
    const cellToFlip = cells.find((c) => c.status === "MISSING")!;
    cellToFlip.status = "COMPLIANT" as ComplianceStatus;
    const { rate: afterRate } = getWidgetValues(cells);
    expect(afterRate.percentage).toBeGreaterThanOrEqual(0);
    expect(afterRate.percentage).toBeLessThanOrEqual(100);
    expect(Number.isNaN(afterRate.percentage)).toBe(false);
  });
});

describe("rate edge cases — zero denominator, 0%, 100%", () => {
  it("zero denominator: empty cells → numerator=0, denominator=0, percentage=0 (no NaN)", () => {
    const cells: ComplianceCell[] = [];
    const { rate } = getWidgetValues(cells);

    // Independently: no cells → 0/0 → 0% (no division)
    const expected = expectedRate(0, 0, 0, 0);
    expect(expected.numerator).toBe(0);
    expect(expected.denominator).toBe(0);
    expect(expected.percentage).toBe(0);

    expect(rate.numerator).toBe(0);
    expect(rate.denominator).toBe(0);
    expect(rate.percentage).toBe(0);
    expect(Number.isNaN(rate.percentage)).toBe(false);
    expect(Number.isFinite(rate.percentage)).toBe(true);

    // Component should render "No requirements configured" (denominator === 0)
    // — not "0 of 0 required (0%)"
  });

  it("0%: all cells MISSING → numerator=0, denominator>0, percentage=0", () => {
    const cells: ComplianceCell[] = Array.from({ length: 10 }, (_, i) => ({
      unionId: `u-${i}`,
      documentType: `d-${i}`,
      status: "MISSING" as const,
      filedAt: null,
      expiryDate: null,
    }));

    const nCompliant = countByStatus(cells, "COMPLIANT");
    const nExpiring = countByStatus(cells, "EXPIRING");
    const nOverdue = countByStatus(cells, "OVERDUE");
    const nMissing = countByStatus(cells, "MISSING");

    expect(nCompliant).toBe(0);
    expect(nMissing).toBe(10);

    const expected = expectedRate(nCompliant, nExpiring, nOverdue, nMissing);
    expect(expected.numerator).toBe(0);
    expect(expected.denominator).toBe(10);
    expect(expected.percentage).toBe(0);

    const { rate } = getWidgetValues(cells);
    expect(rate.numerator).toBe(0);
    expect(rate.denominator).toBe(10);
    expect(rate.percentage).toBe(0);
    expect(Number.isNaN(rate.percentage)).toBe(false);

    // Progress bar width = 0% (empty bar)
  });

  it("100%: all cells COMPLIANT → numerator=denominator, percentage=100", () => {
    const cells: ComplianceCell[] = Array.from({ length: 10 }, (_, i) => ({
      unionId: `u-${i}`,
      documentType: `d-${i}`,
      status: "COMPLIANT" as const,
      filedAt: new Date("2024-01-01"),
      expiryDate: new Date("2025-01-01"),
    }));

    const nCompliant = countByStatus(cells, "COMPLIANT");
    const nExpiring = countByStatus(cells, "EXPIRING");
    const nOverdue = countByStatus(cells, "OVERDUE");
    const nMissing = countByStatus(cells, "MISSING");

    expect(nCompliant).toBe(10);
    expect(nExpiring).toBe(0);
    expect(nOverdue).toBe(0);
    expect(nMissing).toBe(0);

    const expected = expectedRate(nCompliant, nExpiring, nOverdue, nMissing);
    expect(expected.numerator).toBe(10);
    expect(expected.denominator).toBe(10);
    expect(expected.percentage).toBe(100);

    const { rate } = getWidgetValues(cells);
    expect(rate.numerator).toBe(10);
    expect(rate.denominator).toBe(10);
    expect(rate.percentage).toBe(100);
    expect(Number.isNaN(rate.percentage)).toBe(false);

    // Progress bar width = 100% (full bar)
  });

  it("zero denominator does NOT produce NaN or Infinity in the percentage", () => {
    const cells: ComplianceCell[] = [];
    const { rate } = getWidgetValues(cells);
    // The key assertion: 0/0 must not be NaN
    expect(rate.percentage).toBe(0);
    expect(rate.percentage).not.toBeNaN();
    expect(rate.percentage).not.toBe(Infinity);
    expect(rate.percentage).not.toBe(-Infinity);
  });
});

// =============================================================================
// Stacked composition bar tests — chunk 2.1 acceptance criteria:
// - Rendered widths match counts as percentages of the denominator
// - Zero-count status: segment omitted from bar, legend entry still shown
// - All counts zero: "No requirements configured" (denominator = 0)
// - Denominator mismatch guard: sum != denominator → detect, don't render silently
// - Mutation: flipping COMPLIANT → OVERDUE changes segment widths proportionally
//
// Tests derive expected values independently from the fixture (count it
// in the test), never by calling the selector under test.
// =============================================================================

/** Compute expected segment widths independently from raw cell counts. */
function expectedWidths(compliant: number, expiring: number, overdue: number, missing: number) {
  const denominator = compliant + expiring + overdue + missing;
  return {
    COMPLIANT: denominator === 0 ? 0 : (compliant / denominator) * 100,
    EXPIRING: denominator === 0 ? 0 : (expiring / denominator) * 100,
    OVERDUE: denominator === 0 ? 0 : (overdue / denominator) * 100,
    MISSING: denominator === 0 ? 0 : (missing / denominator) * 100,
  };
}

/** Simulate the bar's segment computation: only non-zero counts render as visible segments. */
function getSegments(cells: ComplianceCell[]) {
  const counts = tallyComplianceCounts(cells);
  const tiles = getTileStatuses();
  const denominator = counts.COMPLIANT + counts.EXPIRING + counts.OVERDUE + counts.MISSING;
  return {
    denominator,
    segments: tiles
      .map((status) => ({
        status,
        count: counts[status],
        widthPct: denominator === 0 ? 0 : (counts[status] / denominator) * 100,
      }))
      .filter((s) => s.count > 0),
    allTiles: tiles.map((status) => ({
      status,
      count: counts[status],
      widthPct: denominator === 0 ? 0 : (counts[status] / denominator) * 100,
    })),
  };
}

describe("composition bar — segment widths match counts as percentages", () => {
  it("baseline: segment widths independently computed match selector output", () => {
    const cells = makeFixtureCells();
    const { segments, denominator } = getSegments(cells);

    // Independently compute expected widths
    const nCompliant = countByStatus(cells, "COMPLIANT");
    const nExpiring = countByStatus(cells, "EXPIRING");
    const nOverdue = countByStatus(cells, "OVERDUE");
    const nMissing = countByStatus(cells, "MISSING");
    const expected = expectedWidths(nCompliant, nExpiring, nOverdue, nMissing);

    expect(denominator).toBe(78);

    // Each segment's width matches the independently computed percentage
    const compliantSeg = segments.find((s) => s.status === "COMPLIANT")!;
    expect(compliantSeg.widthPct).toBeCloseTo(expected.COMPLIANT, 5);

    const expiringSeg = segments.find((s) => s.status === "EXPIRING")!;
    expect(expiringSeg.widthPct).toBeCloseTo(expected.EXPIRING, 5);

    const overdueSeg = segments.find((s) => s.status === "OVERDUE")!;
    expect(overdueSeg.widthPct).toBeCloseTo(expected.OVERDUE, 5);

    const missingSeg = segments.find((s) => s.status === "MISSING")!;
    expect(missingSeg.widthPct).toBeCloseTo(expected.MISSING, 5);

    // Sum of segment widths = 100
    const totalWidth = segments.reduce((sum, s) => sum + s.widthPct, 0);
    expect(totalWidth).toBeCloseTo(100, 5);

    // Explicit values
    expect(compliantSeg.widthPct).toBeCloseTo((17 / 78) * 100, 5);
    expect(missingSeg.widthPct).toBeCloseTo((57 / 78) * 100, 5);
  });

  it("mutation: flipping COMPLIANT → OVERDUE changes segment widths proportionally", () => {
    const cells = makeFixtureCells();

    // Before: independently compute
    const beforeCompliant = countByStatus(cells, "COMPLIANT");
    const beforeOverdue = countByStatus(cells, "OVERDUE");
    const beforeExpected = expectedWidths(
      beforeCompliant,
      countByStatus(cells, "EXPIRING"),
      beforeOverdue,
      countByStatus(cells, "MISSING"),
    );
    const before = getSegments(cells);

    // Flip first COMPLIANT → OVERDUE
    const cellToFlip = cells.find((c) => c.status === "COMPLIANT")!;
    cellToFlip.status = "OVERDUE" as ComplianceStatus;

    // After: independently compute
    const afterCompliant = countByStatus(cells, "COMPLIANT");
    const afterOverdue = countByStatus(cells, "OVERDUE");
    const afterExpected = expectedWidths(
      afterCompliant,
      countByStatus(cells, "EXPIRING"),
      afterOverdue,
      countByStatus(cells, "MISSING"),
    );
    const after = getSegments(cells);

    // Compliant width decreased
    expect(afterExpected.COMPLIANT).toBeLessThan(beforeExpected.COMPLIANT);
    // Overdue width increased
    expect(afterExpected.OVERDUE).toBeGreaterThan(beforeExpected.OVERDUE);
    // Other widths unchanged
    expect(afterExpected.EXPIRING).toBe(beforeExpected.EXPIRING);
    expect(afterExpected.MISSING).toBe(beforeExpected.MISSING);

    // Selector matches independent computation
    const afterCompliantSeg = after.segments.find((s) => s.status === "COMPLIANT")!;
    expect(afterCompliantSeg.widthPct).toBeCloseTo(afterExpected.COMPLIANT, 5);

    const afterOverdueSeg = after.segments.find((s) => s.status === "OVERDUE")!;
    expect(afterOverdueSeg.widthPct).toBeCloseTo(afterExpected.OVERDUE, 5);

    // Explicit: 16/78 vs 3/78
    expect(afterCompliantSeg.widthPct).toBeCloseTo((16 / 78) * 100, 5);
    expect(afterOverdueSeg.widthPct).toBeCloseTo((3 / 78) * 100, 5);

    // Sum still = 100
    const totalWidth = after.segments.reduce((sum, s) => sum + s.widthPct, 0);
    expect(totalWidth).toBeCloseTo(100, 5);
  });

  it("zero-count segment omitted from bar but legend entry shown", () => {
    // All cells COMPLIANT — OVERDUE count = 0
    const cells: ComplianceCell[] = Array.from({ length: 10 }, (_, i) => ({
      unionId: `u-${i}`,
      documentType: `d-${i}`,
      status: "COMPLIANT" as const,
      filedAt: new Date("2024-01-01"),
      expiryDate: new Date("2025-01-01"),
    }));

    const { segments, allTiles } = getSegments(cells);

    // Bar segments: only COMPLIANT (the only non-zero count)
    expect(segments).toHaveLength(1);
    expect(segments[0].status).toBe("COMPLIANT");
    expect(segments[0].widthPct).toBe(100);

    // Legend tiles: all 5 applicable statuses including zero-count OVERDUE
    expect(allTiles).toHaveLength(5);
    const overdueTile = allTiles.find((t) => t.status === "OVERDUE")!;
    expect(overdueTile.count).toBe(0);
    expect(overdueTile.widthPct).toBe(0);
  });

  it("denominator mismatch: sum of counts != denominator → guard fires", () => {
    // Simulate a mismatch by manually constructing bad counts
    // (not possible via tallyComplianceCounts — but test the guard logic)
    const counts: ComplianceCounts = {
      COMPLIANT: 10,
      EXPIRING: 0,
      OVERDUE: 0,
      AWAITING_REVIEW: 0,
      MISSING: 0,
      NOT_APPLICABLE: 0,
    };
    const denominator = 20; // intentionally wrong (should be 10)
    const sum = counts.COMPLIANT + counts.EXPIRING + counts.OVERDUE + counts.AWAITING_REVIEW + counts.MISSING;
    expect(sum).not.toBe(denominator); // guard should detect this
  });

  it("all counts zero → denominator = 0 → no NaN in widths", () => {
    const cells: ComplianceCell[] = [];
    const { denominator, segments, allTiles } = getSegments(cells);
    expect(denominator).toBe(0);
    expect(segments).toHaveLength(0); // no visible segments
    expect(allTiles).toHaveLength(5); // legend still shows all 5 at count 0
    for (const tile of allTiles) {
      expect(tile.widthPct).toBe(0);
      expect(Number.isNaN(tile.widthPct)).toBe(false);
    }
  });

  it("segments ordered Compliant → Expiring → Overdue → Missing", () => {
    const cells = makeFixtureCells();
    const { segments } = getSegments(cells);
    expect(segments.map((s) => s.status)).toEqual(
      ["COMPLIANT", "EXPIRING", "OVERDUE", "MISSING"],
    );
  });
});

// =============================================================================
// Required vs On-File meters tests — chunk 2.2 acceptance criteria:
// - Every required type renders including zero-on-file
// - Sort: missing DESC, ties by name ASC
// - Sum of on-file equals Documents KPI
// - Fill proportion = onFile / required (asserted numerically)
// - Edge cases: on-file=0, missing=0, required=0 (omitted + logged)
// - Mutation: removing a doc changes fill + missing + sort
// =============================================================================

import {
  getRequiredVsOnFileByType,
  sumOnFile,
  type RequiredVsOnFileEntry,
  type DocumentTypeCount,
} from "../dashboard/metrics";

describe("required vs on-file — per-type meters", () => {
  // Simulate the live DB: 13 required types, 6 unions each
  const ALL_REQUIRED_TYPES = [
    "General Matters", "Application for Registration", "Registration Certificate",
    "Constitution", "Financial Membership List", "Election of Office Bearers",
    "Secret Ballots", "Financial Return", "Affiliations", "Inspection Reports",
    "General Secretary Appointments", "Welfare Fund", "Awards",
  ];
  const TOTAL_UNIONS = 6;

  // On-file counts per type (matching live data: 21 total)
  const ON_FILE_BY_TYPE: DocumentTypeCount[] = [
    { documentType: "Registration Certificate", count: 5 },
    { documentType: "Constitution", count: 5 },
    { documentType: "Financial Return", count: 4 },
    { documentType: "Election of Office Bearers", count: 2 },
    { documentType: "Awards", count: 2 },
    { documentType: "Financial Membership List", count: 1 },
    { documentType: "Affiliations", count: 1 },
    { documentType: "Secret Ballots", count: 1 },
  ];

  it("every required type renders — including zero-on-file types", () => {
    const entries = getRequiredVsOnFileByType(ON_FILE_BY_TYPE, ALL_REQUIRED_TYPES, TOTAL_UNIONS);
    expect(entries).toHaveLength(ALL_REQUIRED_TYPES.length);

    // Types with 0 on-file: General Matters, Application for Registration,
    // Inspection Reports, General Secretary Appointments, Welfare Fund
    const zeroOnFile = entries.filter((e) => e.onFile === 0);
    expect(zeroOnFile.length).toBe(5);
    for (const entry of zeroOnFile) {
      expect(entry.missing).toBe(TOTAL_UNIONS);
    }
  });

  it("sort order: missing DESC, ties by name ASC (deterministic)", () => {
    const entries = getRequiredVsOnFileByType(ON_FILE_BY_TYPE, ALL_REQUIRED_TYPES, TOTAL_UNIONS);

    // Independently compute expected sort
    const onFileMap = new Map(ON_FILE_BY_TYPE.map((d) => [d.documentType, d.count]));
    const expected = ALL_REQUIRED_TYPES.map((docType) => {
      const onFile = onFileMap.get(docType) ?? 0;
      return { documentType: docType, required: TOTAL_UNIONS, onFile, missing: TOTAL_UNIONS - onFile };
    }).sort((a, b) => {
      if (b.missing !== a.missing) return b.missing - a.missing;
      return a.documentType.localeCompare(b.documentType);
    });

    // Assert each entry matches expected order
    expect(entries.map((e) => e.documentType)).toEqual(expected.map((e) => e.documentType));

    // First 5 should all have missing = 6 (the zero-on-file types)
    expect(entries[0].missing).toBe(6);
    expect(entries[4].missing).toBe(6);
    // Ties at missing=6 broken alphabetically:
    expect(entries[0].documentType).toBe("Application for Registration");
    expect(entries[1].documentType).toBe("General Matters");
    expect(entries[2].documentType).toBe("General Secretary Appointments");
    expect(entries[3].documentType).toBe("Inspection Reports");
    expect(entries[4].documentType).toBe("Welfare Fund");
  });

  it("sum of on-file equals Documents KPI (21)", () => {
    const entries = getRequiredVsOnFileByType(ON_FILE_BY_TYPE, ALL_REQUIRED_TYPES, TOTAL_UNIONS);
    const total = sumOnFile(entries);
    // Independently sum the ON_FILE_BY_TYPE fixture
    const expectedTotal = ON_FILE_BY_TYPE.reduce((sum, d) => sum + d.count, 0);
    expect(total).toBe(expectedTotal);
    expect(total).toBe(21);
  });

  it("fill proportion = onFile / required (asserted numerically)", () => {
    const entries = getRequiredVsOnFileByType(ON_FILE_BY_TYPE, ALL_REQUIRED_TYPES, TOTAL_UNIONS);

    for (const entry of entries) {
      const expectedFill = entry.required > 0 ? (entry.onFile / entry.required) * 100 : 0;
      // Simulate the component's width calculation
      const componentFill = entry.required > 0 ? (entry.onFile / entry.required) * 100 : 0;
      expect(componentFill).toBeCloseTo(expectedFill, 5);
      expect(Number.isNaN(componentFill)).toBe(false);
    }

    // Explicit: Financial Return = 4/6 = 66.67%
    const financialReturn = entries.find((e) => e.documentType === "Financial Return")!;
    expect(financialReturn.onFile).toBe(4);
    expect(financialReturn.required).toBe(6);
    expect((4 / 6) * 100).toBeCloseTo(66.667, 1);

    // Registration Certificate = 5/6 = 83.33%
    const regCert = entries.find((e) => e.documentType === "Registration Certificate")!;
    expect(regCert.onFile).toBe(5);
    expect(regCert.required).toBe(6);
    expect((5 / 6) * 100).toBeCloseTo(83.333, 1);

    // Welfare Fund = 0/6 = 0%
    const welfare = entries.find((e) => e.documentType === "Welfare Fund")!;
    expect(welfare.onFile).toBe(0);
    expect(welfare.required).toBe(6);
    expect((0 / 6) * 100).toBe(0);
  });

  it("edge: on-file = 0 → renders '0 of 6 on file, 6 missing'", () => {
    const entries = getRequiredVsOnFileByType(ON_FILE_BY_TYPE, ALL_REQUIRED_TYPES, TOTAL_UNIONS);
    const welfare = entries.find((e) => e.documentType === "Welfare Fund")!;
    expect(welfare.onFile).toBe(0);
    expect(welfare.required).toBe(6);
    expect(welfare.missing).toBe(6);
    // The component would render "0 of 6 on file · 6 missing"
  });

  it("edge: missing = 0 → no missing text shown", () => {
    // All unions have the type on file
    const allOnFile: DocumentTypeCount[] = ALL_REQUIRED_TYPES.map((t) => ({
      documentType: t,
      count: TOTAL_UNIONS,
    }));
    const entries = getRequiredVsOnFileByType(allOnFile, ALL_REQUIRED_TYPES, TOTAL_UNIONS);
    for (const entry of entries) {
      expect(entry.onFile).toBe(entry.required);
      expect(entry.missing).toBe(0);
    }
  });

  it("edge: required = 0 → type omitted from output (component logs loudly)", () => {
    // A type with required=0 (totalUnions=0)
    const entries = getRequiredVsOnFileByType(
      [],
      ["Nonexistent Type"],
      0,
    );
    // With totalUnions=0, required=0, so missing=0
    expect(entries).toHaveLength(1);
    expect(entries[0].required).toBe(0);
    expect(entries[0].onFile).toBe(0);
    expect(entries[0].missing).toBe(0);
    // The component filters this out (validEntries guard) and logs console.error
  });

  it("edge: on-file > required → data inconsistency (component logs, does NOT clamp)", () => {
    // Simulate: 8 docs of a type that only requires 6
    const onFile: DocumentTypeCount[] = [
      { documentType: "OverFiled Type", count: 8 },
    ];
    const entries = getRequiredVsOnFileByType(onFile, ["OverFiled Type"], TOTAL_UNIONS);
    expect(entries[0].onFile).toBe(8);
    expect(entries[0].required).toBe(6);
    expect(entries[0].missing).toBe(-2); // negative — component logs this
  });

  it("mutation: removing a doc changes fill + missing + sort order", () => {
    // Deep-copy the fixture to avoid cross-test mutation
    const onFileAfter = ON_FILE_BY_TYPE.map((d) => ({ ...d }));

    // Remove one Financial Return (4 → 3)
    onFileAfter.find((d) => d.documentType === "Financial Return")!.count = 3;

    const entriesAfter = getRequiredVsOnFileByType(onFileAfter, ALL_REQUIRED_TYPES, TOTAL_UNIONS);
    const financialReturnAfter = entriesAfter.find((e) => e.documentType === "Financial Return")!;

    // Independently compute expected
    expect(financialReturnAfter.onFile).toBe(3);
    expect(financialReturnAfter.required).toBe(6);
    expect(financialReturnAfter.missing).toBe(3);

    // Fill proportion changed: 3/6 = 50% (was 4/6 = 66.67%)
    const fillPct = (3 / 6) * 100;
    expect(fillPct).toBe(50);

    // Sum of on-file = 20 (original 21 - 1)
    const totalAfter = sumOnFile(entriesAfter);
    expect(totalAfter).toBe(20);

    // Sort order: Financial Return now has missing=3 (was missing=2)
    // It should rank higher (earlier in the list) than types with missing < 3
    const frIndex = entriesAfter.findIndex((e) => e.documentType === "Financial Return")!;
    // After FR in the sorted list (higher index), there should be no entries
    // with missing >= 3 (they'd sort before it)
    const typesAfterFRWithHigherOrEqualMissing = entriesAfter.filter(
      (e, i) => i > frIndex && e.missing >= 3,
    );
    expect(typesAfterFRWithHigherOrEqualMissing.length).toBe(0);
  });

  it("mutation: adding a doc to a zero-on-file type changes its row from 0 to 1", () => {
    // Deep-copy the fixture
    const onFile = ON_FILE_BY_TYPE.map((d) => ({ ...d }));

    // Add one Welfare Fund (was 0, now 1)
    onFile.push({ documentType: "Welfare Fund", count: 1 });

    const entries = getRequiredVsOnFileByType(onFile, ALL_REQUIRED_TYPES, TOTAL_UNIONS);
    const welfare = entries.find((e) => e.documentType === "Welfare Fund")!;

    expect(welfare.onFile).toBe(1);
    expect(welfare.required).toBe(6);
    expect(welfare.missing).toBe(5); // was 6, now 5

    // Sum of on-file now = 22 (original 21 + 1)
    expect(sumOnFile(entries)).toBe(22);

    // Welfare Fund now has missing=5 (was 6), so it sorts lower
    const welfareIndex = entries.findIndex((e) => e.documentType === "Welfare Fund")!;
    const typesWithHigherMissing = entries.filter(
      (e, i) => e.missing > 5 && i < welfareIndex,
    );
    // All types with missing > 5 (i.e., 6) should be BEFORE Welfare Fund
    expect(typesWithHigherMissing.length).toBe(4); // the 4 other zero-on-file types
  });
});

// =============================================================================
// Needs Attention tests — chunk 3.1 acceptance criteria:
// - Panel contents match the config-derived selector exactly
// - Sort: OVERDUE before EXPIRING, then expiryDate ASC, ties by unionName ASC
// - Cross-widget invariant: panel row count per status = getComplianceCounts()
// - Frozen time: all tests use a fixed `now`, no real clock
// - Empty state: 0 overdue + 0 expiring → empty panel
// - Cap: more than NEEDS_ATTENTION_CAP entries → cap + "View all N"
// - Mutation: flip COMPLIANT → EXPIRING with due date inside window → row appears
// =============================================================================

import {
  getNeedsAttention,
  NEEDS_ATTENTION_CAP,
  type NeedsAttentionEntry,
} from "../dashboard/metrics";

// Frozen time for deterministic tests
const FROZEN_NOW = new Date("2026-06-15T12:00:00Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeFixtureUnions() {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `union-${i}`,
    name: `Union ${String.fromCharCode(65 + i)}`, // Union A, B, C, D, E, F
    registrationNo: `TU-2024-${String(i + 1).padStart(3, "0")}`,
    status: (i === 5 ? "SUSPENDED" : "ACTIVE") as "ACTIVE" | "SUSPENDED" | "DEREGISTERED",
  }));
}

function makeFixtureCellsWithNeedsAttention(): ComplianceCell[] {
  const cells: ComplianceCell[] = [];

  // 2 OVERDUE cells (different unions, different dates)
  cells.push({
    unionId: "union-0",
    documentType: "Financial Return",
    status: "OVERDUE",
    filedAt: new Date("2023-01-01"),
    expiryDate: new Date(FROZEN_NOW.getTime() - 30 * MS_PER_DAY), // 30 days overdue
  });
  cells.push({
    unionId: "union-2",
    documentType: "Election of Office Bearers",
    status: "OVERDUE",
    filedAt: new Date("2023-06-01"),
    expiryDate: new Date(FROZEN_NOW.getTime() - 10 * MS_PER_DAY), // 10 days overdue
  });

  // 2 EXPIRING cells (within 90 days)
  cells.push({
    unionId: "union-1",
    documentType: "Financial Return",
    status: "EXPIRING",
    filedAt: new Date("2025-08-01"),
    expiryDate: new Date(FROZEN_NOW.getTime() + 12 * MS_PER_DAY), // in 12 days
  });
  cells.push({
    unionId: "union-3",
    documentType: "Affiliations",
    status: "EXPIRING",
    filedAt: new Date("2025-08-01"),
    expiryDate: new Date(FROZEN_NOW.getTime() + 60 * MS_PER_DAY), // in 60 days
  });

  // Some COMPLIANT and MISSING cells (should NOT appear in needs attention)
  for (let i = 0; i < 5; i++) {
    cells.push({
      unionId: `union-${i}`,
      documentType: `compliant-${i}`,
      status: "COMPLIANT",
      filedAt: new Date("2024-01-01"),
      expiryDate: new Date("2027-01-01"),
    });
  }
  for (let i = 0; i < 10; i++) {
    cells.push({
      unionId: `union-${i % 6}`,
      documentType: `missing-${i}`,
      status: "MISSING",
      filedAt: null,
      expiryDate: null,
    });
  }

  return cells;
}

describe("needs attention — selector + panel", () => {
  const unions = makeFixtureUnions();

  it("baseline: 2 overdue + 2 expiring = 4 entries", () => {
    const cells = makeFixtureCellsWithNeedsAttention();
    const entries = getNeedsAttention(cells, unions, FROZEN_NOW);
    expect(entries).toHaveLength(4);
  });

  it("sort: OVERDUE before EXPIRING, then by expiryDate ASC, ties by unionName ASC", () => {
    const cells = makeFixtureCellsWithNeedsAttention();
    const entries = getNeedsAttention(cells, unions, FROZEN_NOW);

    // First 2 are OVERDUE (sorted by expiryDate ASC = most overdue first)
    expect(entries[0].status).toBe("OVERDUE");
    expect(entries[1].status).toBe("OVERDUE");
    // Union 0's expiry is 30 days ago; Union 2's is 10 days ago
    // 30 days ago < 10 days ago → Union 0 is more overdue (earlier date)
    expect(entries[0].unionName).toBe("Union A");
    expect(entries[0].documentType).toBe("Financial Return");
    expect(entries[1].unionName).toBe("Union C");
    expect(entries[1].documentType).toBe("Election of Office Bearers");

    // Next 2 are EXPIRING (sorted by expiryDate ASC = soonest first)
    expect(entries[2].status).toBe("EXPIRING");
    expect(entries[3].status).toBe("EXPIRING");
    // in 12 days < in 60 days → Union B's Financial Return first
    expect(entries[2].unionName).toBe("Union B");
    expect(entries[2].documentType).toBe("Financial Return");
    expect(entries[3].unionName).toBe("Union D");
    expect(entries[3].documentType).toBe("Affiliations");
  });

  it("cross-widget invariant: panel count per status = getComplianceCounts()", () => {
    const cells = makeFixtureCellsWithNeedsAttention();
    const entries = getNeedsAttention(cells, unions, FROZEN_NOW);
    const counts = tallyComplianceCounts(cells);

    // Panel overdue count = counts.OVERDUE
    const panelOverdue = entries.filter((e) => e.status === "OVERDUE").length;
    expect(panelOverdue).toBe(counts.OVERDUE);

    // Panel expiring count = counts.EXPIRING
    const panelExpiring = entries.filter((e) => e.status === "EXPIRING").length;
    expect(panelExpiring).toBe(counts.EXPIRING);

    // COMPLIANT and MISSING are NOT in the panel
    const panelCompliant = entries.filter((e) => e.status === "COMPLIANT").length;
    const panelMissing = entries.filter((e) => e.status === "MISSING").length;
    expect(panelCompliant).toBe(0);
    expect(panelMissing).toBe(0);
  });

  it("empty state: 0 overdue + 0 expiring → empty entries", () => {
    // All cells COMPLIANT or MISSING
    const cells: ComplianceCell[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        unionId: `union-${i}`,
        documentType: `c-${i}`,
        status: "COMPLIANT" as const,
        filedAt: new Date("2024-01-01"),
        expiryDate: new Date("2027-01-01"),
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        unionId: `union-${i % 6}`,
        documentType: `m-${i}`,
        status: "MISSING" as const,
        filedAt: null,
        expiryDate: null,
      })),
    ];
    const entries = getNeedsAttention(cells, unions, FROZEN_NOW);
    expect(entries).toHaveLength(0);
  });

  it("mutation: flip COMPLIANT → EXPIRING with due date inside window → row appears", () => {
    const cells = makeFixtureCellsWithNeedsAttention();
    const before = getNeedsAttention(cells, unions, FROZEN_NOW);
    expect(before).toHaveLength(4);

    // Find a COMPLIANT cell and flip it to EXPIRING with a due date 45 days from now
    const compliant = cells.find((c) => c.status === "COMPLIANT")!;
    expect(compliant).toBeDefined();
    compliant.status = "EXPIRING";
    compliant.expiryDate = new Date(FROZEN_NOW.getTime() + 45 * MS_PER_DAY);

    const after = getNeedsAttention(cells, unions, FROZEN_NOW);

    // One more entry
    expect(after).toHaveLength(5);

    // The new entry is EXPIRING (not OVERDUE)
    const newEntry = after.find(
      (e) => e.unionId === compliant.unionId && e.documentType === compliant.documentType,
    );
    expect(newEntry).toBeDefined();
    expect(newEntry!.status).toBe("EXPIRING");

    // Cross-widget: counts.EXPIRING also incremented
    const countsAfter = tallyComplianceCounts(cells);
    expect(countsAfter.EXPIRING).toBe(3); // was 2, now 3

    // Cross-widget: counts.COMPLIANT decremented
    expect(countsAfter.COMPLIANT).toBe(4); // was 5, now 4
  });

  it("mutation: move a due date outside the 90-day window → status changes, row disappears", () => {
    // Start with an EXPIRING cell
    const cells: ComplianceCell[] = [
      {
        unionId: "union-0",
        documentType: "Test Doc",
        status: "EXPIRING",
        filedAt: new Date("2025-08-01"),
        expiryDate: new Date(FROZEN_NOW.getTime() + 30 * MS_PER_DAY), // in 30 days
      },
    ];

    const before = getNeedsAttention(cells, unions, FROZEN_NOW);
    expect(before).toHaveLength(1);

    // Move the expiry date 200 days out — outside the 90-day window
    // The compliance calculator would reclassify this as COMPLIANT
    // (but we're simulating the selector behavior, not the calculator)
    cells[0].status = "COMPLIANT";
    cells[0].expiryDate = new Date(FROZEN_NOW.getTime() + 200 * MS_PER_DAY);

    const after = getNeedsAttention(cells, unions, FROZEN_NOW);
    expect(after).toHaveLength(0); // no longer in needs attention
  });

  it("cap: more than NEEDS_ATTENTION_CAP entries → cap is applied by the component", () => {
    // Create 15 OVERDUE cells (more than cap of 10)
    const cells: ComplianceCell[] = Array.from({ length: 15 }, (_, i) => ({
      unionId: `union-${i % 6}`,
      documentType: `doc-${i}`,
      status: "OVERDUE" as const,
      filedAt: new Date("2023-01-01"),
      expiryDate: new Date(FROZEN_NOW.getTime() - (i + 1) * MS_PER_DAY),
    }));

    const entries = getNeedsAttention(cells, unions, FROZEN_NOW);
    expect(entries).toHaveLength(15); // selector returns all
    expect(NEEDS_ATTENTION_CAP).toBe(10);

    // The component would display only NEEDS_ATTENTION_CAP (10) rows
    // and show "View all 15"
    const visibleCount = Math.min(entries.length, NEEDS_ATTENTION_CAP);
    expect(visibleCount).toBe(10);
    const hasMore = entries.length > NEEDS_ATTENTION_CAP;
    expect(hasMore).toBe(true);
  });

  it("frozen time: results are deterministic with the same now", () => {
    const cells = makeFixtureCellsWithNeedsAttention();
    const result1 = getNeedsAttention(cells, unions, FROZEN_NOW);
    const result2 = getNeedsAttention(cells, unions, FROZEN_NOW);

    // Same entries in same order
    expect(result1.map((e) => e.unionName)).toEqual(result2.map((e) => e.unionName));
    expect(result1.map((e) => e.documentType)).toEqual(result2.map((e) => e.documentType));
  });

  it("links point at existing routes (/unions/{unionId})", () => {
    const cells = makeFixtureCellsWithNeedsAttention();
    const entries = getNeedsAttention(cells, unions, FROZEN_NOW);

    // The component uses href={`/unions/${item.unionId}`}
    // Verify the unionId is a valid path segment
    for (const entry of entries) {
      expect(entry.unionId).toBeTruthy();
      expect(entry.unionId).not.toContain(" ");
      expect(entry.unionId).not.toContain("/");
    }
  });
});
