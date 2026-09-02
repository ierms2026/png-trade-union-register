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
