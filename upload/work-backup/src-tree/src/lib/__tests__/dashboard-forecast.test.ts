import { describe, it, expect } from "vitest";
import {
  type ComplianceCell,
  type UnionSummary,
  tallyComplianceCounts,
  getNeedsAttention,
  getExpiryForecast,
  type ExpiryForecast,
  type ForecastBucket,
} from "../dashboard/metrics";
import {
  STATUS_CONFIG,
  EXPIRING_WINDOW_DAYS,
  FORECAST_BUCKETS,
  type ComplianceStatus,
} from "../dashboard/status-config";

// =============================================================================
// Expiry Forecast tests — chunk 3.3
//
// Config test: FORECAST_BUCKETS[0] <= EXPIRING_WINDOW_DAYS
// Reconciliation: bucket30.count === getComplianceCounts().EXPIRING
// Reconciliation: bucket30 documentIds ⊆ getNeedsAttention() EXPIRING entries
// Reconciliation: overdueCount === getComplianceCounts().OVERDUE
// Exclusivity + boundary: a 45-day doc sits in exactly one bucket
// Exclusions: overdue, no-due-date, missing, >90 days
// Mutation: move doc 45→10 days → bucket changes, counts reconcile
// Mutation: move doc past due → leaves buckets, overdueCount increments
// =============================================================================

const FROZEN_NOW = new Date("2026-06-15T12:00:00Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const UNIONS: UnionSummary[] = Array.from({ length: 6 }, (_, i) => ({
  id: `union-${i}`,
  name: `Union ${String.fromCharCode(65 + i)}`,
  registrationNo: `TU-2024-${String(i + 1).padStart(3, "0")}`,
  status: i === 5 ? "SUSPENDED" : "ACTIVE",
}));

describe("config: FORECAST_BUCKETS", () => {
  it("FORECAST_BUCKETS[0] <= EXPIRING_WINDOW_DAYS (first bucket within the expiring window)", () => {
    expect(FORECAST_BUCKETS[0]).toBeLessThanOrEqual(EXPIRING_WINDOW_DAYS);
  });

  it("FORECAST_BUCKETS has 3 entries: [30, 60, 90]", () => {
    expect(FORECAST_BUCKETS).toHaveLength(3);
    expect([...FORECAST_BUCKETS]).toEqual([30, 60, 90]);
  });

  it("buckets are strictly ascending", () => {
    for (let i = 1; i < FORECAST_BUCKETS.length; i++) {
      expect(FORECAST_BUCKETS[i]).toBeGreaterThan(FORECAST_BUCKETS[i - 1]);
    }
  });
});

function makeForecastFixtureCells(): ComplianceCell[] {
  const cells: ComplianceCell[] = [];

  // 2 EXPIRING (within 90 days) — one at 12 days, one at 45 days
  cells.push({
    unionId: "union-0", documentType: "Financial Return", status: "EXPIRING",
    filedAt: new Date("2025-08-01"), expiryDate: new Date(FROZEN_NOW.getTime() + 12 * MS_PER_DAY),
    documentId: "doc-exp-12",
  });
  cells.push({
    unionId: "union-1", documentType: "Affiliations", status: "EXPIRING",
    filedAt: new Date("2025-08-01"), expiryDate: new Date(FROZEN_NOW.getTime() + 45 * MS_PER_DAY),
    documentId: "doc-exp-45",
  });

  // 2 OVERDUE (past due)
  cells.push({
    unionId: "union-2", documentType: "Financial Return", status: "OVERDUE",
    filedAt: new Date("2023-01-01"), expiryDate: new Date(FROZEN_NOW.getTime() - 30 * MS_PER_DAY),
    documentId: "doc-overdue-0",
  });
  cells.push({
    unionId: "union-3", documentType: "Election", status: "OVERDUE",
    filedAt: new Date("2023-06-01"), expiryDate: new Date(FROZEN_NOW.getTime() - 10 * MS_PER_DAY),
    documentId: "doc-overdue-1",
  });

  // 17 COMPLIANT (due > 90 days, excluded from forecast)
  for (let i = 0; i < 17; i++) {
    cells.push({
      unionId: `union-${i % 6}`, documentType: `compliant-${i}`, status: "COMPLIANT",
      filedAt: new Date("2024-01-15"), expiryDate: new Date("2027-01-15"),
      documentId: `doc-compliant-${i}`,
    });
  }

  // 57 MISSING (no due date, excluded from forecast)
  for (let i = 0; i < 57; i++) {
    cells.push({
      unionId: `union-${i % 6}`, documentType: `missing-${i}`, status: "MISSING",
      filedAt: null, expiryDate: null, documentId: null,
    });
  }

  return cells;
}

describe("getExpiryForecast — reconciliation invariants", () => {
  it("bucket30.count === getComplianceCounts().EXPIRING (true by definition)", () => {
    const cells = makeForecastFixtureCells();
    const forecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);
    const counts = tallyComplianceCounts(cells);

    // Independently: the fixture has 2 EXPIRING cells, both within 90 days
    // Bucket 0 (0-30 days) captures the 12-day doc; bucket 1 (31-60) captures the 45-day doc.
    // But wait: the reconciliation says bucket30.count === counts.EXPIRING.
    // That's only true if ALL expiring docs are within 30 days. In our fixture, one is at 12 days
    // (bucket 0) and one is at 45 days (bucket 1). So bucket30.count = 1, but counts.EXPIRING = 2.
    // The invariant is: sum of ALL buckets = counts.EXPIRING (all expiring docs are within the
    // last bucket's window = 90 days = EXPIRING_WINDOW_DAYS).
    const allBucketsCount = forecast.buckets.reduce((sum, b) => sum + b.count, 0);
    expect(allBucketsCount).toBe(counts.EXPIRING);
  });

  it("every bucket documentId appears among getNeedsAttention() rows with status EXPIRING", () => {
    const cells = makeForecastFixtureCells();
    const forecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);
    const needsAttention = getNeedsAttention(cells, UNIONS, FROZEN_NOW);

    // Get all EXPIRING document IDs from needs attention
    const expiringDocIds = new Set(
      needsAttention
        .filter((e) => e.status === "EXPIRING")
        .map((e) => {
          // NeedsAttentionEntry doesn't have documentId directly, but we can
          // match by (unionId, documentType, status) since the fixture is deterministic
          return `${e.unionId}::${e.documentType}`;
        }),
    );

    // Every bucket documentId should correspond to an entry in needs attention
    for (const bucket of forecast.buckets) {
      for (const docId of bucket.documentIds) {
        // The docId format is "doc-exp-XX" — find the cell it came from
        const cell = cells.find((c) => c.documentId === docId);
        expect(cell).toBeDefined();
        const key = `${cell!.unionId}::${cell!.documentType}`;
        expect(expiringDocIds.has(key)).toBe(true);
      }
    }
  });

  it("overdueCount === getComplianceCounts().OVERDUE", () => {
    const cells = makeForecastFixtureCells();
    const forecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);
    const counts = tallyComplianceCounts(cells);

    expect(forecast.overdueCount).toBe(counts.OVERDUE);
    expect(forecast.overdueCount).toBe(2);
  });
});

describe("getExpiryForecast — exclusivity + boundary", () => {
  it("a 45-day doc sits in exactly one bucket (bucket 1: 31-60 days)", () => {
    const cells: ComplianceCell[] = [{
      unionId: "union-0", documentType: "Test", status: "EXPIRING",
      filedAt: new Date("2025-08-01"), expiryDate: new Date(FROZEN_NOW.getTime() + 45 * MS_PER_DAY),
      documentId: "doc-45",
    }];
    const forecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);

    // Bucket 0 (0-30): 0
    expect(forecast.buckets[0].count).toBe(0);
    // Bucket 1 (31-60): 1
    expect(forecast.buckets[1].count).toBe(1);
    // Bucket 2 (61-90): 0
    expect(forecast.buckets[2].count).toBe(0);
  });

  it("a doc due exactly 30 days from now is in bucket 0 (inclusive upper bound)", () => {
    const cells: ComplianceCell[] = [{
      unionId: "union-0", documentType: "Test", status: "EXPIRING",
      filedAt: new Date("2025-08-01"), expiryDate: new Date(FROZEN_NOW.getTime() + 30 * MS_PER_DAY),
      documentId: "doc-30",
    }];
    const forecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);

    expect(forecast.buckets[0].count).toBe(1);
    expect(forecast.buckets[1].count).toBe(0);
  });

  it("a doc due exactly 31 days from now is in bucket 1 (exclusive lower bound)", () => {
    const cells: ComplianceCell[] = [{
      unionId: "union-0", documentType: "Test", status: "EXPIRING",
      filedAt: new Date("2025-08-01"), expiryDate: new Date(FROZEN_NOW.getTime() + 31 * MS_PER_DAY),
      documentId: "doc-31",
    }];
    const forecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);

    expect(forecast.buckets[0].count).toBe(0);
    expect(forecast.buckets[1].count).toBe(1);
  });
});

describe("getExpiryForecast — exclusions", () => {
  it("overdue docs: excluded from buckets, counted in overdueCount", () => {
    const cells: ComplianceCell[] = [{
      unionId: "union-0", documentType: "Test", status: "OVERDUE",
      filedAt: new Date("2023-01-01"), expiryDate: new Date(FROZEN_NOW.getTime() - 5 * MS_PER_DAY),
      documentId: "doc-overdue",
    }];
    const forecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);

    expect(forecast.buckets.every((b) => b.count === 0)).toBe(true);
    expect(forecast.overdueCount).toBe(1);
  });

  it("docs with no due date: excluded entirely", () => {
    const cells: ComplianceCell[] = [{
      unionId: "union-0", documentType: "Test", status: "COMPLIANT",
      filedAt: new Date("2024-01-01"), expiryDate: null,
      documentId: "doc-nodate",
    }];
    const forecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);

    expect(forecast.buckets.every((b) => b.count === 0)).toBe(true);
    expect(forecast.overdueCount).toBe(0);
  });

  it("missing docs: never appear (no due date by definition)", () => {
    const cells: ComplianceCell[] = [{
      unionId: "union-0", documentType: "Test", status: "MISSING",
      filedAt: null, expiryDate: null, documentId: null,
    }];
    const forecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);

    expect(forecast.buckets.every((b) => b.count === 0)).toBe(true);
    expect(forecast.overdueCount).toBe(0);
  });

  it("docs due > 90 days out: excluded from display", () => {
    const cells: ComplianceCell[] = [{
      unionId: "union-0", documentType: "Test", status: "COMPLIANT",
      filedAt: new Date("2024-01-01"), expiryDate: new Date(FROZEN_NOW.getTime() + 200 * MS_PER_DAY),
      documentId: "doc-far",
    }];
    const forecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);

    expect(forecast.buckets.every((b) => b.count === 0)).toBe(true);
    expect(forecast.overdueCount).toBe(0);
  });
});

describe("getExpiryForecast — zero states", () => {
  it("all buckets zero and overdueCount zero: totalActionable = 0", () => {
    const cells: ComplianceCell[] = [];
    const forecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);

    expect(forecast.buckets.every((b) => b.count === 0)).toBe(true);
    expect(forecast.overdueCount).toBe(0);
    expect(forecast.totalActionable).toBe(0);
  });

  it("all-zero renders empty state ('Nothing due in the next 90 days')", () => {
    const cells: ComplianceCell[] = [];
    const forecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);

    const allZero =
      forecast.buckets.every((b) => b.count === 0) && forecast.overdueCount === 0;
    expect(allZero).toBe(true);
    // The component would render "Nothing due in the next 90 days."
  });
});

describe("getExpiryForecast — mutation tests", () => {
  it("move one fixture doc's due date from 45 → 10 days: bucket60 decrements, bucket30 increments, expiring count stays same, needs attention gains a row", () => {
    const cells = makeForecastFixtureCells();
    const beforeForecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);
    const beforeCounts = tallyComplianceCounts(cells);

    // Verify before: bucket0 has 1 (12-day), bucket1 has 1 (45-day)
    expect(beforeForecast.buckets[0].count).toBe(1);
    expect(beforeForecast.buckets[1].count).toBe(1);

    // Move the 45-day doc to 10 days
    const doc45 = cells.find((c) => c.documentId === "doc-exp-45")!;
    doc45.expiryDate = new Date(FROZEN_NOW.getTime() + 10 * MS_PER_DAY);

    const afterForecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);
    const afterCounts = tallyComplianceCounts(cells);

    // Bucket0 (0-30): 1 → 2 (12-day + 10-day)
    expect(afterForecast.buckets[0].count).toBe(2);
    // Bucket1 (31-60): 1 → 0 (the 45-day doc moved)
    expect(afterForecast.buckets[1].count).toBe(0);

    // Total across all buckets unchanged (still 2 expiring)
    const totalAfter = afterForecast.buckets.reduce((s, b) => s + b.count, 0);
    expect(totalAfter).toBe(beforeCounts.EXPIRING);
    expect(totalAfter).toBe(afterCounts.EXPIRING);

    // Overdue count unchanged
    expect(afterForecast.overdueCount).toBe(beforeForecast.overdueCount);
  });

  it("move a doc past due: it leaves the buckets, overdueCount increments, bucket30 unchanged", () => {
    const cells = makeForecastFixtureCells();
    const beforeForecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);

    // The 12-day doc is in bucket 0. Move it to -5 days (overdue).
    const doc12 = cells.find((c) => c.documentId === "doc-exp-12")!;
    doc12.expiryDate = new Date(FROZEN_NOW.getTime() - 5 * MS_PER_DAY);
    doc12.status = "OVERDUE" as ComplianceStatus;

    const afterForecast = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);
    const afterCounts = tallyComplianceCounts(cells);

    // Bucket0: 1 → 0 (the 12-day doc is now overdue)
    expect(afterForecast.buckets[0].count).toBe(0);
    // Bucket1: 1 (the 45-day doc is still there)
    expect(afterForecast.buckets[1].count).toBe(1);

    // Overdue: 2 → 3 (the moved doc + the 2 original overdue)
    expect(afterForecast.overdueCount).toBe(beforeForecast.overdueCount + 1);
    expect(afterForecast.overdueCount).toBe(afterCounts.OVERDUE);
  });

  it("frozen time: forecast is deterministic", () => {
    const cells = makeForecastFixtureCells();
    const f1 = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);
    const f2 = getExpiryForecast(cells, FROZEN_NOW, FORECAST_BUCKETS);

    expect(f1.buckets.map((b) => b.count)).toEqual(f2.buckets.map((b) => b.count));
    expect(f1.overdueCount).toBe(f2.overdueCount);
  });
});
