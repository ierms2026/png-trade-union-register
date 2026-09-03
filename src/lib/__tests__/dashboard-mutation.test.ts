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
