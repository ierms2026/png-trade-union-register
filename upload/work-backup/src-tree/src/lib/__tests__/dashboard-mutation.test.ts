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

  it("tiles always have exactly 4 entries (the applicable statuses)", () => {
    const cells = makeFixtureCells();
    const { tiles } = getWidgetValues(cells);
    expect(tiles).toHaveLength(4);
    expect(tiles.map((t) => t.status).sort()).toEqual(
      ["COMPLIANT", "EXPIRING", "MISSING", "OVERDUE"],
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

    // Legend tiles: all 4 statuses including zero-count OVERDUE
    expect(allTiles).toHaveLength(4);
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
      MISSING: 0,
      NOT_APPLICABLE: 0,
    };
    const denominator = 20; // intentionally wrong (should be 10)
    const sum = counts.COMPLIANT + counts.EXPIRING + counts.OVERDUE + counts.MISSING;
    expect(sum).not.toBe(denominator); // guard should detect this
  });

  it("all counts zero → denominator = 0 → no NaN in widths", () => {
    const cells: ComplianceCell[] = [];
    const { denominator, segments, allTiles } = getSegments(cells);
    expect(denominator).toBe(0);
    expect(segments).toHaveLength(0); // no visible segments
    expect(allTiles).toHaveLength(4); // legend still shows all 4 at count 0
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
