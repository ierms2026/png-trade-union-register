import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "./setup";
import {
  ensureSnapshotForToday,
  sliceTrendToWindow,
  buildChartSeriesWithGaps,
  buildSparklinePoints,
  extractSparklineSeries,
  type ComplianceTrendPoint,
  type TrendChartDatum,
} from "../dashboard/snapshot";
import { computePercentage } from "../dashboard/metrics";
import { TREND_WINDOW_DAYS } from "../dashboard/status-config";

// =============================================================================
// Trend rendering helpers tests — chunk 4.2b
//
// Covers the PURE chart helpers added in 4.2b:
//   - sliceTrendToWindow: window derived from point dates, not hardcoded
//   - buildChartSeriesWithGaps: gap-break rendering (line breaks at gaps)
//   - buildSparklinePoints: auto-scaled polyline geometry, null-safe
//   - extractSparklineSeries: per-series extraction for the three sparklines
//
// Plus the MUTATION test extension (flip one fixture doc's status → today's
// snapshot changes → today's chart point changes → affected sparkline
// changes). This proves end-to-end that the chart renders live data, not
// a cached snapshot.
//
// FROZEN TIME: all tests use FROZEN_NOW (matches the 4.2a test fixture).
// The suite is deterministic across runs — no Date.now() leaks.
// =============================================================================

const FROZEN_NOW = new Date("2026-06-15T12:00:00Z");

// =============================================================================
// Fixture: a small but realistic 7-day trend (no gaps).
//
// 7 points, one per day from 2026-06-09 to 2026-06-15. Compliant count
// grows from 1 → 7 (denominator stays 10), so the percentage rises from
// 10% → 70%. Used by tests that need a clean (gapless) trend.
// =============================================================================

function makeCleanTrend(days = 7, denom = 10): ComplianceTrendPoint[] {
  const trend: ComplianceTrendPoint[] = [];
  // Start FROZEN_NOW - (days - 1) days, end FROZEN_NOW.
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(FROZEN_NOW.getTime() - i * MS_PER_DAY);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${day}`;
    // Compliant grows linearly: 4, 5, 6, 7, 8, 9, 10 for 7-day trend.
    const compliant = days - i; // 1..days
    trend.push({
      date: dateStr,
      compliant,
      expiring: 0,
      overdue: 0,
      awaitingReview: 0, missing: denom - compliant,
      rateNumerator: compliant,
      rateDenominator: denom,
      percentage: computePercentage(compliant, denom),
    });
  }
  return trend;
}

// =============================================================================
// sliceTrendToWindow
// =============================================================================

describe("sliceTrendToWindow — window derived from point dates, not hardcoded", () => {
  it("returns [] for an empty trend", () => {
    expect(sliceTrendToWindow([], 365)).toEqual([]);
  });

  it("returns all points when the trend is shorter than the window", () => {
    const trend = makeCleanTrend(7); // 7 days
    const sliced = sliceTrendToWindow(trend, 365);
    expect(sliced).toHaveLength(7);
    expect(sliced.map((p) => p.date)).toEqual(trend.map((p) => p.date));
  });

  it("slices to the most recent N days measured from the LAST point's date (not from now)", () => {
    // Build a 30-day trend, then slice to the last 10 days.
    // Inclusive of exactly 10 days back: 11 points (06-05 through 06-15).
    // This is the natural reading of "most recent 10 days" — both endpoints
    // are included.
    const trend = makeCleanTrend(30);
    const sliced = sliceTrendToWindow(trend, 10);
    expect(sliced).toHaveLength(11);
    // The first sliced point is exactly 10 days before the last point.
    expect(sliced[0].date).toBe(trend[trend.length - 11].date);
    expect(sliced[sliced.length - 1].date).toBe(trend[trend.length - 1].date);
  });

  it("uses the default TREND_WINDOW_DAYS (365) when no days arg is passed", () => {
    // A 400-day trend sliced to the last 365 days = 366 points (inclusive
    // of both endpoints: 365 days back through today).
    const trend = makeCleanTrend(400);
    const sliced = sliceTrendToWindow(trend);
    expect(sliced).toHaveLength(366);
    expect(sliced[0].date).toBe(trend[trend.length - 366].date);
  });

  it("TREND_WINDOW_DAYS constant is 365 (regression guard)", () => {
    // If someone changes the default, this test forces a conscious decision
    // (and an update to the handoff + chart description text).
    expect(TREND_WINDOW_DAYS).toBe(365);
  });

  it("does NOT pad before the first point — slices only what's available", () => {
    // Even if the trend started yesterday, the slice returns just yesterday + today.
    const trend = makeCleanTrend(2);
    const sliced = sliceTrendToWindow(trend, 365);
    expect(sliced).toHaveLength(2);
    // No left-padding to "365 days ago".
    expect(sliced[0].date).toBe(trend[0].date);
  });

  it("handles a trend with a gap correctly — slices by date, not by index", () => {
    // Two points 10 days apart, slice to last 5 days → only the second point.
    const trend: ComplianceTrendPoint[] = [
      {
        date: "2026-06-05", compliant: 1, expiring: 0, overdue: 0, awaitingReview: 0, missing: 9,
        rateNumerator: 1, rateDenominator: 10, percentage: 10,
      },
      {
        date: "2026-06-15", compliant: 9, expiring: 0, overdue: 0, awaitingReview: 0, missing: 1,
        rateNumerator: 9, rateDenominator: 10, percentage: 90,
      },
    ];
    const sliced = sliceTrendToWindow(trend, 5);
    expect(sliced).toHaveLength(1);
    expect(sliced[0].date).toBe("2026-06-15");
  });
});

// =============================================================================
// buildChartSeriesWithGaps — gap-break rendering (DONE WHEN criterion)
// =============================================================================

describe("buildChartSeriesWithGaps — line breaks at gaps", () => {
  it("returns [] for empty input", () => {
    expect(buildChartSeriesWithGaps([])).toEqual([]);
  });

  it("returns one row per point for a contiguous (gapless) trend", () => {
    const trend = makeCleanTrend(7); // 7 consecutive days
    const data = buildChartSeriesWithGaps(trend);
    expect(data).toHaveLength(7);
    // All rows are real (not gaps).
    expect(data.every((d) => d.isGap === false)).toBe(true);
    expect(data.every((d) => d.point !== null)).toBe(true);
  });

  it("inserts explicit gap rows for missing intermediate dates (line breaks at gaps)", () => {
    // 2026-06-13 and 2026-06-15 stored, 2026-06-14 missing.
    // The data array should have 3 rows: 13, 14 (gap), 15.
    const trend: ComplianceTrendPoint[] = [
      {
        date: "2026-06-13", compliant: 1, expiring: 1, overdue: 1, awaitingReview: 0, missing: 7,
        rateNumerator: 1, rateDenominator: 10, percentage: 10,
      },
      {
        date: "2026-06-15", compliant: 3, expiring: 1, overdue: 1, awaitingReview: 0, missing: 5,
        rateNumerator: 3, rateDenominator: 10, percentage: 30,
      },
    ];
    const data = buildChartSeriesWithGaps(trend);

    // 3 rows: real, gap, real
    expect(data).toHaveLength(3);
    expect(data[0].date).toBe("2026-06-13");
    expect(data[0].isGap).toBe(false);
    expect(data[0].point).not.toBeNull();
    expect(data[0].percentage).toBe(10);

    expect(data[1].date).toBe("2026-06-14");
    expect(data[1].isGap).toBe(true);
    expect(data[1].point).toBeNull();
    expect(data[1].percentage).toBeNull();

    expect(data[2].date).toBe("2026-06-15");
    expect(data[2].isGap).toBe(false);
    expect(data[2].point).not.toBeNull();
    expect(data[2].percentage).toBe(30);
  });

  it("DOES NOT interpolate — gap rows have percentage: null, NOT a fabricated value", () => {
    // The gap row MUST have percentage: null (NOT the midpoint of the
    // surrounding points, NOT the previous value carried forward, NOT 0).
    // This is the explicit "no synthesis" assertion.
    const trend: ComplianceTrendPoint[] = [
      {
        date: "2026-06-13", compliant: 1, expiring: 0, overdue: 0, awaitingReview: 0, missing: 9,
        rateNumerator: 1, rateDenominator: 10, percentage: 10,
      },
      {
        date: "2026-06-15", compliant: 9, expiring: 0, overdue: 0, awaitingReview: 0, missing: 1,
        rateNumerator: 9, rateDenominator: 10, percentage: 90,
      },
    ];
    const data = buildChartSeriesWithGaps(trend);
    const gapRow = data.find((d) => d.isGap);
    expect(gapRow).toBeDefined();
    expect(gapRow!.percentage).toBeNull();
    // Explicitly NOT the midpoint (which would be 50):
    expect(gapRow!.percentage).not.toBe(50);
    // Explicitly NOT the carry-forward (which would be 10):
    expect(gapRow!.percentage).not.toBe(10);
    // Explicitly NOT 0 (which would mean "0% compliant"):
    expect(gapRow!.percentage).not.toBe(0);
  });

  it("inserts N-1 gap rows for an N-day gap", () => {
    // 5-day gap: 2026-06-10 → 2026-06-15. Should insert 4 gap rows.
    const trend: ComplianceTrendPoint[] = [
      {
        date: "2026-06-10", compliant: 1, expiring: 0, overdue: 0, awaitingReview: 0, missing: 9,
        rateNumerator: 1, rateDenominator: 10, percentage: 10,
      },
      {
        date: "2026-06-15", compliant: 6, expiring: 0, overdue: 0, awaitingReview: 0, missing: 4,
        rateNumerator: 6, rateDenominator: 10, percentage: 60,
      },
    ];
    const data = buildChartSeriesWithGaps(trend);
    // 6 rows total: 1 real + 4 gaps + 1 real
    expect(data).toHaveLength(6);
    expect(data.filter((d) => d.isGap)).toHaveLength(4);
    // Gap dates are 06-11, 06-12, 06-13, 06-14
    const gapDates = data.filter((d) => d.isGap).map((d) => d.date);
    expect(gapDates).toEqual([
      "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14",
    ]);
  });

  it("does NOT pad before the first point or after the last point", () => {
    // If the trend starts at 2026-06-13 and ends at 2026-06-15, the data array
    // should NOT include 2026-06-12 (before) or 2026-06-16 (after).
    const trend = makeCleanTrend(3); // 13, 14, 15
    const data = buildChartSeriesWithGaps(trend);
    expect(data[0].date).toBe("2026-06-13");
    expect(data[data.length - 1].date).toBe("2026-06-15");
    expect(data.some((d) => d.date === "2026-06-12")).toBe(false);
    expect(data.some((d) => d.date === "2026-06-16")).toBe(false);
  });

  it("preserves zero-denominator points as real points (NOT gaps) — they still break the line", () => {
    // A zero-denominator point has percentage: null but isGap: false (it's a
    // real stored point, just with no applicable cells). The chart's Line
    // with connectNulls={false} will break at it — same visual effect as a
    // gap, but the tooltip will say "No applicable requirements" instead of
    // "No data (no snapshot for this date)".
    const trend: ComplianceTrendPoint[] = [
      { date: "2026-06-13", compliant: 5, expiring: 0, overdue: 0, awaitingReview: 0, missing: 5, rateNumerator: 5, rateDenominator: 10, percentage: 50 },
      { date: "2026-06-14", compliant: 0, expiring: 0, overdue: 0, awaitingReview: 0, missing: 0, rateNumerator: 0, rateDenominator: 0, percentage: null },
      { date: "2026-06-15", compliant: 8, expiring: 0, overdue: 0, awaitingReview: 0, missing: 2, rateNumerator: 8, rateDenominator: 10, percentage: 80 },
    ];
    const data = buildChartSeriesWithGaps(trend);
    expect(data).toHaveLength(3);
    // The zero-denom row is a REAL point (isGap: false), but its percentage is null.
    expect(data[1].isGap).toBe(false);
    expect(data[1].point).not.toBeNull();
    expect(data[1].percentage).toBeNull();
  });
});

// =============================================================================
// buildSparklinePoints — auto-scaled polyline geometry, null-safe
// =============================================================================

describe("buildSparklinePoints — sparkline geometry", () => {
  it("returns empty string for an empty input", () => {
    expect(buildSparklinePoints([], 100, 24)).toBe("");
  });

  it("returns empty string when all values are null", () => {
    expect(buildSparklinePoints([null, null, null], 100, 24)).toBe("");
  });

  it("returns a single x,y pair for a single value", () => {
    const result = buildSparklinePoints([5], 100, 24);
    // Single value → x=0 (no other points to spread across), y = midpoint.
    expect(result).toBe("0,12");
  });

  it("spreads points evenly across the width", () => {
    const result = buildSparklinePoints([0, 10, 20, 30], 100, 24);
    const xs = result.split(" ").map((p) => p.split(",")[0]);
    // First x = 0, last x = 100, intermediate x evenly spaced.
    expect(xs[0]).toBe("0");
    expect(xs[xs.length - 1]).toBe("100");
    // For 4 values, intermediate x's are 33.33, 66.67 → rounded to 33.3, 66.7.
    expect(xs[1]).toBe("33.3");
    expect(xs[2]).toBe("66.7");
  });

  it("scales y to height — min value at bottom (y=height), max at top (y=0)", () => {
    // values 0, 10, 20 → min=0, max=20. y for 0 = 24, y for 20 = 0, y for 10 = 12.
    const result = buildSparklinePoints([0, 10, 20], 100, 24);
    const ys = result.split(" ").map((p) => p.split(",")[1]);
    expect(ys[0]).toBe("24"); // min → bottom
    expect(ys[1]).toBe("12"); // mid → middle
    expect(ys[2]).toBe("0");  // max → top
  });

  it("draws a flat line at the vertical midpoint when all values are equal (no div-by-zero)", () => {
    const result = buildSparklinePoints([5, 5, 5, 5], 100, 24);
    const ys = result.split(" ").map((p) => p.split(",")[1]);
    // All y = 12 (midpoint).
    expect(ys.every((y) => y === "12")).toBe(true);
  });

  it("skips null values — the polyline jumps over gaps (visual gap)", () => {
    // values [10, null, 30] → the polyline draws 10 then 30, skipping the null.
    // The middle x position is NOT included in the output.
    const result = buildSparklinePoints([10, null, 30], 100, 24);
    const points = result.split(" ");
    expect(points).toHaveLength(2); // only 2 points, NOT 3
    // First point at x=0, second at x=100 (last value's index is 2).
    expect(points[0].split(",")[0]).toBe("0");
    expect(points[1].split(",")[0]).toBe("100");
  });

  it("preserves the original indices — gaps don't compress the x-axis", () => {
    // values [10, null, null, 40] → two points at x=0 and x=100, NOT x=0 and x=50.
    // The sparkline shows there was a gap; it doesn't pretend the second value
    // came right after the first.
    const result = buildSparklinePoints([10, null, null, 40], 100, 24);
    const points = result.split(" ");
    expect(points).toHaveLength(2);
    expect(points[0].split(",")[0]).toBe("0");
    expect(points[1].split(",")[0]).toBe("100");
  });

  it("produces valid SVG points attribute syntax (comma-separated, space-delimited)", () => {
    const result = buildSparklinePoints([1, 2, 3, 4, 5], 100, 24);
    // Each point is "x,y"; points are space-separated.
    expect(result).toMatch(/^[0-9.]+,[0-9.]+( [0-9.]+,[0-9.]+)*$/);
  });
});

// =============================================================================
// extractSparklineSeries — per-series extraction for the three sparklines
// =============================================================================

describe("extractSparklineSeries", () => {
  const trend: ComplianceTrendPoint[] = [
    { date: "2026-06-13", compliant: 1, expiring: 1, overdue: 1, awaitingReview: 0, missing: 7, rateNumerator: 1, rateDenominator: 10, percentage: 10 },
    { date: "2026-06-14", compliant: 2, expiring: 1, overdue: 1, awaitingReview: 0, missing: 6, rateNumerator: 2, rateDenominator: 10, percentage: 20 },
    { date: "2026-06-15", compliant: 3, expiring: 1, overdue: 1, awaitingReview: 0, missing: 5, rateNumerator: 3, rateDenominator: 10, percentage: 30 },
  ];

  it("extracts the compliant series (counts for the Compliant KPI sparkline)", () => {
    expect(extractSparklineSeries(trend, "compliant")).toEqual([1, 2, 3]);
  });

  it("extracts the missing series (counts for the Missing KPI sparkline)", () => {
    expect(extractSparklineSeries(trend, "missing")).toEqual([7, 6, 5]);
  });

  it("extracts the rate series (percentages for the Compliance Summary sparkline)", () => {
    expect(extractSparklineSeries(trend, "rate")).toEqual([10, 20, 30]);
  });

  it("preserves null percentages in the rate series (no synthesis to 0)", () => {
    const withZeroDenom: ComplianceTrendPoint[] = [
      { date: "2026-06-13", compliant: 5, expiring: 0, overdue: 0, awaitingReview: 0, missing: 5, rateNumerator: 5, rateDenominator: 10, percentage: 50 },
      { date: "2026-06-14", compliant: 0, expiring: 0, overdue: 0, awaitingReview: 0, missing: 0, rateNumerator: 0, rateDenominator: 0, percentage: null },
      { date: "2026-06-15", compliant: 8, expiring: 0, overdue: 0, awaitingReview: 0, missing: 2, rateNumerator: 8, rateDenominator: 10, percentage: 80 },
    ];
    expect(extractSparklineSeries(withZeroDenom, "rate")).toEqual([50, null, 80]);
  });

  it("returns an array the same length as the input trend", () => {
    expect(extractSparklineSeries(trend, "compliant")).toHaveLength(trend.length);
    expect(extractSparklineSeries(trend, "missing")).toHaveLength(trend.length);
    expect(extractSparklineSeries(trend, "rate")).toHaveLength(trend.length);
  });

  it("returns [] for an empty trend", () => {
    expect(extractSparklineSeries([], "compliant")).toEqual([]);
    expect(extractSparklineSeries([], "missing")).toEqual([]);
    expect(extractSparklineSeries([], "rate")).toEqual([]);
  });
});

// =============================================================================
// Mutation test (DONE WHEN criterion): flip one fixture doc's status →
// today's snapshot changes → today's chart point changes → affected sparkline
// changes. Gap test as above. Suite stable across runs.
//
// This test seeds a small fixture DB, captures a snapshot, deletes a doc to
// mutate the matrix, captures again, and asserts:
//   - Today's chart datum changed (compliant count dropped, percentage dropped)
//   - The COMPLIANT sparkline series changed (last value lower)
//   - The MISSING sparkline series changed (last value higher)
//   - Yesterday's chart datum is unchanged (immutability, asserted indirectly
//     via the snapshot's past-day immutability guarantee from 4.2a)
//
// The DB-touching setup mirrors dashboard-snapshot.test.ts's seed pattern.
// =============================================================================

const MS_PER_DAY_MUT = 24 * 60 * 60 * 1000;

async function seedMutationFixture(now: Date): Promise<void> {
  // 3 unions × 2 rules = 6 cells.
  // 2 COMPLIANT (union-A's two docs), 1 EXPIRING, 1 OVERDUE, 2 MISSING (union-C).
  for (const id of ["union-A", "union-B", "union-C"]) {
    await testDb.union.create({
      data: {
        id,
        unionName: `Union ${id.slice(-1)}`,
        registrationNo: `TU-${id}`,
        status: "ACTIVE",
      },
    });
  }
  for (const rule of [
    { documentType: "Annual Return", renewalYears: 1, required: true },
    { documentType: "Financial Statement", renewalYears: 1, required: true },
  ]) {
    await testDb.complianceRule.create({ data: rule });
  }
  const docs = [
    { unionId: "union-A", documentType: "Annual Return", uploadedDaysAgo: 30 },
    { unionId: "union-A", documentType: "Financial Statement", uploadedDaysAgo: 100 },
    { unionId: "union-B", documentType: "Annual Return", uploadedDaysAgo: 335 }, // EXPIRING
    { unionId: "union-B", documentType: "Financial Statement", uploadedDaysAgo: 380 }, // OVERDUE
  ];
  for (const doc of docs) {
    const uploadedAt = new Date(now.getTime() - doc.uploadedDaysAgo * MS_PER_DAY_MUT);
    const created = await testDb.document.create({
      data: { unionId: doc.unionId, documentType: doc.documentType, reviewStatus: "APPROVED" },
    });
    const version = await testDb.documentVersion.create({
      data: {
        documentId: created.id, versionNumber: 1, fileName: "t.pdf",
        filePath: "/tmp/t.pdf", fileSize: 100, checksum: `c-${created.id}`, uploadedAt,
      },
    });
    await testDb.document.update({
      where: { id: created.id },
      data: { currentVersionId: version.id },
    });
  }
}

describe("mutation test — today's chart point + sparklines change under fixture mutation", () => {
  beforeEach(async () => {
    await resetDb();
    await seedMutationFixture(FROZEN_NOW);
  });

  it("flip a fixture doc's status → today's chart datum changes + sparklines change", async () => {
    // Step 1: Capture today's snapshot.
    const r1 = await ensureSnapshotForToday(FROZEN_NOW);
    expect(r1.counts.compliant).toBe(2);
    expect(r1.counts.missing).toBe(2);

    // Step 2: Read the trend, slice, build chart data, extract sparklines.
    let trend = await (await import("../dashboard/snapshot")).getComplianceTrend(FROZEN_NOW);
    let windowed = sliceTrendToWindow(trend, TREND_WINDOW_DAYS);
    let chartData = buildChartSeriesWithGaps(windowed);
    let compliantSeries = extractSparklineSeries(windowed, "compliant");
    let missingSeries = extractSparklineSeries(windowed, "missing");
    let rateSeries = extractSparklineSeries(windowed, "rate");

    // Today's chart datum (last entry) should reflect the seeded state.
    const todayDatumBefore = chartData[chartData.length - 1];
    expect(todayDatumBefore.point?.compliant).toBe(2);
    expect(todayDatumBefore.point?.missing).toBe(2);
    expect(todayDatumBefore.percentage).toBe(33); // 2/6 = 33%

    // Sparklines should reflect the seeded state (one value per point).
    expect(compliantSeries).toEqual([2]);
    expect(missingSeries).toEqual([2]);
    expect(rateSeries).toEqual([33]);

    // Step 3: MUTATION — delete union-A's "Annual Return" doc.
    // The cell goes from COMPLIANT → MISSING (no document on file).
    const target = await testDb.document.findFirst({
      where: { unionId: "union-A", documentType: "Annual Return" },
    });
    expect(target).not.toBeNull();
    await testDb.documentVersion.deleteMany({ where: { documentId: target!.id } });
    await testDb.document.delete({ where: { id: target!.id } });

    // Step 4: Re-trigger today's snapshot (PROVISIONAL — overwrites today's row).
    const r2 = await ensureSnapshotForToday(FROZEN_NOW);
    expect(r2.action).toBe("updated");
    expect(r2.counts.compliant).toBe(1); // was 2
    expect(r2.counts.missing).toBe(3);    // was 2
    expect(r2.counts.rateNumerator).toBe(1);
    expect(r2.counts.rateDenominator).toBe(6);

    // Step 5: Re-read the trend + chart + sparklines.
    trend = await (await import("../dashboard/snapshot")).getComplianceTrend(FROZEN_NOW);
    windowed = sliceTrendToWindow(trend, TREND_WINDOW_DAYS);
    chartData = buildChartSeriesWithGaps(windowed);
    compliantSeries = extractSparklineSeries(windowed, "compliant");
    missingSeries = extractSparklineSeries(windowed, "missing");
    rateSeries = extractSparklineSeries(windowed, "rate");

    // Today's chart datum (last entry) now reflects the MUTATED state.
    const todayDatumAfter = chartData[chartData.length - 1];
    expect(todayDatumAfter.point?.compliant).toBe(1);
    expect(todayDatumAfter.point?.missing).toBe(3);
    expect(todayDatumAfter.percentage).toBe(17); // 1/6 = 17%

    // The COMPLIANT sparkline series changed (last value: 2 → 1).
    expect(compliantSeries).toEqual([1]);

    // The MISSING sparkline series changed (last value: 2 → 3).
    expect(missingSeries).toEqual([3]);

    // The RATE sparkline series changed (last value: 33 → 17).
    expect(rateSeries).toEqual([17]);
  });

  it("gap test — deleting a middle snapshot from the trend produces a gap in the chart data", async () => {
    // Step 1: Capture 3 snapshots on 3 consecutive days (13, 14, 15).
    await ensureSnapshotForToday(new Date("2026-06-13T12:00:00Z"));
    await ensureSnapshotForToday(new Date("2026-06-14T12:00:00Z"));
    await ensureSnapshotForToday(new Date("2026-06-15T12:00:00Z"));

    // Step 2: Delete the middle snapshot directly from DB (simulating a missed
    // day — the pipeline didn't run on 2026-06-14).
    await testDb.complianceSnapshot.delete({
      where: { date: "2026-06-14" },
    });

    // Step 3: Read trend + build chart data.
    const trend = await (await import("../dashboard/snapshot")).getComplianceTrend(FROZEN_NOW);
    const windowed = sliceTrendToWindow(trend, TREND_WINDOW_DAYS);
    const chartData = buildChartSeriesWithGaps(windowed);

    // Step 4: Assert the gap is present in the chart data.
    // 3 rows: real (06-13), gap (06-14), real (06-15).
    expect(chartData).toHaveLength(3);
    expect(chartData[0].date).toBe("2026-06-13");
    expect(chartData[0].isGap).toBe(false);
    expect(chartData[1].date).toBe("2026-06-14");
    expect(chartData[1].isGap).toBe(true);
    expect(chartData[1].percentage).toBeNull();
    expect(chartData[2].date).toBe("2026-06-15");
    expect(chartData[2].isGap).toBe(false);

    // Step 5: The gap row has NO point (no fabricated values).
    expect(chartData[1].point).toBeNull();
  });
});
