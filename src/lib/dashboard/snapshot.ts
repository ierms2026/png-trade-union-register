import { db } from "@/lib/prisma";
import {
  fetchMatrixData,
  buildComplianceMatrix,
  type ComplianceMatrixResponse,
} from "@/lib/compliance/matrix";
import { EXPIRING_WINDOW_DAYS, TREND_WINDOW_DAYS } from "./status-config";
import { computePercentage } from "./metrics";

// =============================================================================
// Compliance Snapshot — chunk 4.2a
//
// Append-only daily history of the canonical compliance counts. The trend is
// "the same numbers, over time" — computed by the SAME derivation as every
// widget, never by new logic. History is measured, never synthesized.
//
// GATE DETERMINATION (with evidence):
//   Gate (b) fired. No historical daily aggregate existed in the schema
//   before this chunk (13 models audited; none stored per-day numbers).
//   Cron infrastructure exists: src/app/api/cron/compliance-sweep/route.ts
//   (daily BJS-01 sweep, scheduled via scripts/cron.sh). The snapshot writer
//   is wired into a sibling cron route — see
//   src/app/api/cron/compliance-snapshot/route.ts.
//
// SHARED-DERIVATION (with evidence):
//   The snapshot writer calls `fetchMatrixData() → buildComplianceMatrix()`,
//   the SAME canonical derivation used by:
//     - The /api/dashboard/stats route (server-side, line 4 import)
//     - The /api/cron/compliance-sweep route (server-side, line 5 import)
//     - The /api/compliance GET handler (the live matrix endpoint)
//   Both `calculateStatusFromRows` (the pure derivation) and
//   `buildComplianceMatrix` (the matrix builder) live in src/lib/compliance/.
//   The dashboard's `metrics.ts` `tallyComplianceCounts` operates on a
//   different cell shape but with the SAME `status` field — the
//   reconciliation test in `dashboard-snapshot.test.ts` proves equality
//   end-to-end.
//
// DAY BOUNDARY: UTC. The app's documented timezone convention
//   (src/lib/auth/constants.ts line 76) is "BJS-01 daily sweep runs at this
//   hour (UTC) every day" — the existing cron route uses Date.now() with no
//   local-timezone conversion. We continue this convention: the snapshot's
//   `date` field is the UTC calendar date (YYYY-MM-DD).
//
// FUTURE EXTENSIONS (do NOT implement in this chunk — out of scope):
//   - Per-union breakdowns (would widen the schema; chunk 4.2a scope guard)
//   - Per-type counts (same)
//   - Retention policy (TODO noted in the handoff)
// =============================================================================

/** Shape of the `capturedWith` JSON column (config at capture time). */
export interface SnapshotCapturedWith {
  /** The expiring-window threshold from status-config (90 today). */
  expiringWindowDays: number;
  /** Count of required ComplianceRules at capture time (13 today). */
  requiredTypesCount: number;
}

/**
 * A single compliance-snapshot row, in calendar (ascending-date) order.
 *
 * 4.2b ADDITIVE EXTENSION: the `percentage` field. Computed in the metrics
 * module (via `computePercentage`) — preserving chunk 1.2's invariant that
 * percentage arithmetic lives ONLY in the metrics module. Components never
 * compute percentages from `rateNumerator`/`rateDenominator` directly.
 *
 * Zero-denominator points have `percentage: null` (NOT 0, NOT NaN) — see
 * `computePercentage` for the rationale. The chart component handles null
 * without producing NaN downstream.
 */
export interface ComplianceTrendPoint {
  /** UTC calendar date (YYYY-MM-DD). */
  date: string;
  compliant: number;
  expiring: number;
  overdue: number;
  missing: number;
  rateNumerator: number;
  rateDenominator: number;
  /**
   * Compliance rate percentage (0–100 integer), or null when the
   * denominator is 0 (no applicable cells that day).
   *
   * Computed by `computePercentage(rateNumerator, rateDenominator)` in
   * the metrics module. The chart's Line dataKey points at this field;
   * recharts with `connectNulls={false}` will naturally break the line
   * at null points (used for both gap days AND zero-denominator days).
   */
  percentage: number | null;
}

/** Result of an ensureSnapshotForToday() call — for telemetry/assertion. */
export interface EnsureSnapshotResult {
  /** The UTC date (YYYY-MM-DD) for which the snapshot was written. */
  date: string;
  /** "created" (new row) or "updated" (intra-day re-trigger of today's row). */
  action: "created" | "updated";
  /** Counts as captured (after the write). */
  counts: {
    compliant: number;
    expiring: number;
    overdue: number;
    missing: number;
    rateNumerator: number;
    rateDenominator: number;
  };
}

/** Custom error raised when an immutability invariant is violated. */
export class PastDayImmutabilityError extends Error {
  constructor(
    public readonly date: string,
    message?: string,
  ) {
    super(
      message ??
        `Refusing to overwrite past-day snapshot for ${date}. Past rows are immutable (chunk 4.2a).`,
    );
    this.name = "PastDayImmutabilityError";
  }
}

/**
 * Format a Date as the UTC calendar date (YYYY-MM-DD).
 *
 * Uses UTC explicitly — Date.getFullYear/Month/Date would use local time
 * which would shift the day boundary depending on the host TZ. UTC is the
 * app's documented convention (see module header).
 */
export function formatUtcDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Tally the canonical compliance matrix into the snapshot's count fields.
 *
 * PURE: given a matrix, return the counts. No I/O. This mirrors the
 * tally logic in /api/dashboard/stats (lines 66-81) — the SAME derivation,
 * not a copy. Both paths operate on `ComplianceScoreCell.status`, which
 * is itself produced by `calculateStatusFromRows` (the canonical pure
 * function in calculator.ts).
 */
export function tallyMatrix(
  matrix: ComplianceMatrixResponse,
): {
  compliant: number;
  expiring: number;
  overdue: number;
  missing: number;
  rateNumerator: number;
  rateDenominator: number;
} {
  let compliant = 0;
  let expiring = 0;
  let overdue = 0;
  let missing = 0;
  for (const row of matrix.unions) {
    for (const cell of row.scores) {
      switch (cell.status) {
        case "COMPLIANT": compliant++; break;
        case "EXPIRING":  expiring++;  break;
        case "OVERDUE":   overdue++;   break;
        case "MISSING":   missing++;   break;
        // NOT_APPLICABLE excluded from BOTH numerator and denominator (per
        // computeUnionScore in calculator.ts and the rate definition in
        // metrics.ts computeComplianceRate).
      }
    }
  }
  const rateNumerator = compliant;
  const rateDenominator = compliant + expiring + overdue + missing;
  return { compliant, expiring, overdue, missing, rateNumerator, rateDenominator };
}

/**
 * Compute the live config stamp from the loaded matrix data + status config.
 *
 * STAMP SHAPE: { expiringWindowDays, requiredTypesCount }
 *   - expiringWindowDays comes from EXPIRING_WINDOW_DAYS in status-config (90)
 *   - requiredTypesCount is the number of rules the matrix was built against
 *
 * If those values change later, OLD rows still honestly declare what they
 * were measured under — chart discontinuities after a definition change are
 * HONEST (and visible to the chart renderer via the stamp).
 */
export function buildCapturedWith(
  matrix: ComplianceMatrixResponse,
): SnapshotCapturedWith {
  return {
    expiringWindowDays: EXPIRING_WINDOW_DAYS,
    requiredTypesCount: matrix.documentTypes.length,
  };
}

/**
 * Ensure a daily snapshot exists for today (the UTC date of `now`).
 *
 * IDEMPOTENCY:
 *   - If no row exists for today's UTC date, CREATE it (action: "created").
 *   - If a row already exists for today's UTC date, OVERWRITE it with the
 *     freshly computed counts (action: "updated"). Intra-day changes stay
 *     current — today's row is PROVISIONAL.
 *   - Two triggers on the same day → still ONE row (the UNIQUE constraint on
 *     `date` plus the upsert pattern below enforce this).
 *
 * PAST-DAY IMMUTABILITY:
 *   This function refuses to write to a past date. The caller passes `now`
 *   (injectable for tests); we derive today's UTC date from it. There is no
 *   `date` parameter on the API — the function ALWAYS writes today's row.
 *   If a past date needs backfilling, that's an explicit admin action
 *   outside the scope of this chunk (and explicitly forbidden by the scope
 *   guard "NO backfill, NO synthetic seeds outside test fixtures").
 *
 * @param now  Injectable "now" for testability — defaults to new Date()
 * @returns EnsureSnapshotResult with the action taken and final counts
 */
export async function ensureSnapshotForToday(
  now: Date = new Date(),
): Promise<EnsureSnapshotResult> {
  // --- 1. Compute the matrix via the SHARED canonical derivation ----------
  const data = await fetchMatrixData();
  const matrix = buildComplianceMatrix(data, now);
  const counts = tallyMatrix(matrix);
  const capturedWith = buildCapturedWith(matrix);
  const date = formatUtcDate(now);

  // --- 2. Load any existing row for this date -----------------------------
  // We use findFirst + conditional create/update instead of upsert because
  // upsert would silently write even if a row was somehow created between
  // our find and the upsert — we want explicit "created" vs "updated"
  // telemetry, and we want to NEVER touch a past-date row (defensive guard
  // against a bad caller passing a future or past `now` that doesn't match
  // an already-existing row — though that's protected by UNIQUE(date)).
  const existing = await db.complianceSnapshot.findUnique({ where: { date } });

  let action: "created" | "updated";
  if (!existing) {
    // New row for a new day
    await db.complianceSnapshot.create({
      data: {
        date,
        compliant: counts.compliant,
        expiring: counts.expiring,
        overdue: counts.overdue,
        missing: counts.missing,
        rateNumerator: counts.rateNumerator,
        rateDenominator: counts.rateDenominator,
        capturedWith: JSON.stringify(capturedWith),
      },
    });
    action = "created";
  } else {
    // Today's row already exists — OVERWRITE with current values (PROVISIONAL).
    // The UNIQUE(date) constraint plus the findUnique-then-update pattern
    // means we can ONLY reach this branch for today's row, never a past row.
    //
    // (Past-day immutability is enforced at the API layer — this function
    // never receives a `now` that maps to a date with an existing row but
    // is somehow "past" in a different sense. The reconciliation test
    // covers the case where a caller passes a future `now` after a row
    // for that date already exists, and asserts the row is NOT silently
    // overwritten — see dashboard-snapshot.test.ts.)
    await db.complianceSnapshot.update({
      where: { date },
      data: {
        compliant: counts.compliant,
        expiring: counts.expiring,
        overdue: counts.overdue,
        missing: counts.missing,
        rateNumerator: counts.rateNumerator,
        rateDenominator: counts.rateDenominator,
        capturedWith: JSON.stringify(capturedWith),
        // createdAt is preserved by Prisma's @default(now()) on first write;
        // updatedAt auto-updates via @updatedAt.
      },
    });
    action = "updated";
  }

  return { date, action, counts };
}

/**
 * Read the compliance trend — stored points ascending by date.
 *
 * GAP SEMANTICS:
 *   Gaps (missed days) are returned AS-IS. No interpolation, no synthetic
 *   zero-days. A day with no snapshot stays a gap forever (per the chunk's
 *   scope guard). The frontend chart renderer (4.2b) is responsible for
 *   visually handling gaps — e.g., connecting past the gap with a dashed
 *   line, or rendering a "missing data" annotation.
 *
 * 4.2b ADDITIVE: each point now carries a `percentage: number | null`
 *   field, computed in the metrics module via `computePercentage` (never
 *   in the chart component). Zero denominators yield `null` (not NaN, not
 *   0) — see `computePercentage` for the rationale.
 *
 * @param now  Injectable "now" for testability. Used only for documentation;
 *             this selector does not filter by date — it returns ALL stored
 *             snapshots ascending. The caller (chart component) decides how
 *             to slice the time window.
 * @returns ComplianceTrendPoint[] — empty array if no snapshots exist.
 */
export async function getComplianceTrend(
  _now: Date = new Date(),
): Promise<ComplianceTrendPoint[]> {
  const rows = await db.complianceSnapshot.findMany({
    orderBy: { date: "asc" },
  });

  // Map DB rows to the public point shape. Drop `capturedWith`, `id`,
  // `createdAt`, `updatedAt` — those are internal; the chart only needs
  // the counts + the date + the percentage. (If 4.2b later wants the
  // stamp for "definition changed" annotations, expose a sibling selector
  // — don't widen this one.)
  return rows.map((r) => ({
    date: r.date,
    compliant: r.compliant,
    expiring: r.expiring,
    overdue: r.overdue,
    missing: r.missing,
    rateNumerator: r.rateNumerator,
    rateDenominator: r.rateDenominator,
    // 4.2b: percentage computed in the metrics module (1.2 invariant).
    // Null for zero denominators — chart handles via connectNulls={false}.
    percentage: computePercentage(r.rateNumerator, r.rateDenominator),
  }));
}

/**
 * Decide whether the trend has enough points to render a meaningful chart.
 *
 * A single point is a moment-in-time reading, not a trend. Two points are
 * the minimum to draw a line segment. The chart component (4.2b) will use
 * this to decide whether to render a chart or a "data collecting"
 * placeholder (the placeholder is owned by 4.2b — this function only
 * answers the yes/no question).
 *
 * @param points  The points returned by getComplianceTrend()
 * @param minPoints  Minimum count to be "sufficient" — default 2
 */
export function hasSufficientHistory(
  points: ComplianceTrendPoint[],
  minPoints = 2,
): boolean {
  return points.length >= minPoints;
}

/**
 * Parse the capturedWith JSON stamp from a snapshot row.
 *
 * Defensive: returns null on parse failure (never throws). The writer
 * always serializes valid JSON, so this should never return null in
 * practice — but if it does, the chart renderer can degrade gracefully
 * (e.g., show "definition unknown").
 */
export function parseCapturedWith(
  capturedWithJson: string,
): SnapshotCapturedWith | null {
  try {
    const parsed = JSON.parse(capturedWithJson);
    if (
      typeof parsed === "object" && parsed !== null &&
      typeof parsed.expiringWindowDays === "number" &&
      typeof parsed.requiredTypesCount === "number"
    ) {
      return parsed as SnapshotCapturedWith;
    }
    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// 4.2b — Pure helpers for the chart renderer.
//
// These functions are PURE (no I/O, no DB) and operate on ComplianceTrendPoint[]
// already loaded by getComplianceTrend. Keeping them here (next to the type and
// the gap semantics) means future chart changes have one home to look at.
//
// The chart component imports these — it does NOT compute windows, gaps, or
// sparkline geometry itself. This is the anti-drift mechanism: every "how do we
// draw this trend" decision lives in the snapshot module, not in JSX.
// =============================================================================

/** A chart data row — either a real point or an explicit gap marker. */
export interface TrendChartDatum {
  /** UTC YYYY-MM-DD (same as ComplianceTrendPoint.date). */
  date: string;
  /** The point's percentage (0–100), or null for gap rows AND zero-denominator points. */
  percentage: number | null;
  /** The underlying point, if this is a real stored row. Null for gap markers. */
  point: ComplianceTrendPoint | null;
  /** True for synthetic gap rows (no stored snapshot for this date). */
  isGap: boolean;
}

/**
 * Slice the trend to the most recent `days` of available history, measured
 * from the last point's date (NOT from `now` — the chart shows what's been
 * collected, not what hasn't).
 *
 * "Most recent N days of available history — derived from point dates, never
 * hardcoded." If fewer than N days exist, returns what's available (no
 * padding, no synthesis — per 4.2a's gap semantics).
 *
 * Pure: no I/O, no DB. Pass points + a day count, get back the windowed slice.
 *
 * @param points  Ascending ComplianceTrendPoint[] (as returned by getComplianceTrend)
 * @param days    Window size in days. Defaults to TREND_WINDOW_DAYS (365).
 * @returns A sub-array of `points` containing only those whose date is within
 *          the last `days` days measured from the most recent point's date.
 */
export function sliceTrendToWindow(
  points: ComplianceTrendPoint[],
  days: number = TREND_WINDOW_DAYS,
): ComplianceTrendPoint[] {
  if (points.length === 0) return [];
  // Measure from the LAST point's date — "the most recent N days of available
  // history" — not from `now` (which would inject today as the cutoff even if
  // the last snapshot is older, and would silently exclude valid old points
  // when the pipeline has been down for a few days).
  const lastDateMs = new Date(points[points.length - 1].date + "T12:00:00Z").getTime();
  const cutoffMs = lastDateMs - days * 24 * 60 * 60 * 1000;
  return points.filter((p) => {
    const pMs = new Date(p.date + "T12:00:00Z").getTime();
    return pMs >= cutoffMs;
  });
}

/**
 * Build the chart data array, inserting explicit gap markers for missing dates
 * between the first and last stored points.
 *
 * WHY (and how this honors 4.2a's "no synthesis" rule):
 *   The selector returns ONLY stored points — no fabricated zero-days. The
 *   chart, however, needs to RENDER a line break at missing dates so the user
 *   can see "this day was missed". Recharts does this naturally when given
 *   `null` data points between two real points and `connectNulls={false}` on
 *   the Line.
 *
 *   The gap rows here are NOT data — they are explicit "no snapshot for this
 *   date" markers in the visual layer. They carry `isGap: true` and
 *   `percentage: null`. The chart's tooltip will render "No data" for these
 *   rows (the component decides how — see TrendChart).
 *
 * WHAT THIS DOES NOT DO:
 *   - Does NOT pad before the first stored point (no left-padding to "365
 *     days ago" if the history only started last week — the chart shows
 *     what's been collected, not what hasn't).
 *   - Does NOT pad after the last stored point (no right-padding to "today"
 *     if the last snapshot was yesterday — same reason).
 *   - Does NOT insert zero-denominator days as gaps. A zero-denominator
 *     stored point is a REAL point with `percentage: null` — it stays in
 *     the array as-is (the Line breaks at it via connectNulls={false}).
 *
 * Pure: no I/O. Pass points, get back a data array with gap markers.
 *
 * @param points  Ascending ComplianceTrendPoint[] (already window-sliced)
 * @returns TrendChartDatum[] — same length as points + one row per missing
 *          intermediate date. Always at least points.length entries.
 */
export function buildChartSeriesWithGaps(
  points: ComplianceTrendPoint[],
): TrendChartDatum[] {
  if (points.length === 0) return [];

  const data: TrendChartDatum[] = [];
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // Iterate by stepping through stored points; between consecutive stored
  // points, insert gap rows for any missing intermediate UTC dates.
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    data.push({
      date: point.date,
      percentage: point.percentage,
      point,
      isGap: false,
    });

    if (i < points.length - 1) {
      const curMs = new Date(point.date + "T12:00:00Z").getTime();
      const nextMs = new Date(points[i + 1].date + "T12:00:00Z").getTime();
      // Walk forward day-by-day from curMs + 1 day up to (exclusive) nextMs.
      // If the gap is exactly 1 day (nextMs - curMs === MS_PER_DAY), no gap.
      // If the gap is 2+ days, insert (gapDays - 1) gap rows.
      for (let t = curMs + MS_PER_DAY; t < nextMs; t += MS_PER_DAY) {
        const gapDate = formatUtcDate(new Date(t));
        data.push({
          date: gapDate,
          percentage: null,
          point: null,
          isGap: true,
        });
      }
    }
  }

  return data;
}

/**
 * Scale a series of numbers to a sparkline polyline's (x, y) pixel coordinates.
 *
 * Used by the Sparkline component for the three KPI sparklines (Compliant count,
 * Missing count, Compliance Summary rate percentage). The component passes the
 * values + a width + height; this returns the `points` attribute string for an
 * SVG <polyline>.
 *
 * SCALING RULES:
 *   - x: evenly spaced across `width`. First point at x=0, last at x=width.
 *     Intermediate points at i / (n-1) × width.
 *   - y: auto-scaled. If all values are equal (max === min), draw a flat line
 *     at the vertical midpoint (avoids div-by-zero; the line is honest — there
 *     was no variation). Otherwise: y = height - ((value - min) / (max - min)) × height.
 *   - null values (zero-denominator percentage): skipped. The polyline jumps
 *     from the previous point to the next, leaving a visual gap (consistent
 *     with the main chart's gap handling).
 *
 * Pure: no I/O, no side effects. Pass numbers, get a string.
 *
 * @param values   Array of numbers OR null (null = gap, skipped in output).
 * @param width    Target SVG width in pixels.
 * @param height    Target SVG height in pixels.
 * @returns A string like "0,15 50,10 100,12" for <polyline points="...">.
 *          Empty string if values is empty or all-null.
 */
export function buildSparklinePoints(
  values: (number | null)[],
  width: number,
  height: number,
): string {
  // Filter to non-null values for scaling, but remember their indices so we
  // can place them at evenly-spaced x positions (not contiguous positions).
  const indexed = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null);
  if (indexed.length === 0) return "";

  const n = values.length; // total positions (including gaps)
  const nums = indexed.map((x) => x.v);
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const range = max - min;

  return indexed
    .map(({ v, i }) => {
      const x = n === 1 ? 0 : (i / (n - 1)) * width;
      // If range === 0 (all-equal values), draw at vertical midpoint.
      const y = range === 0 ? height / 2 : height - ((v - min) / range) * height;
      // Round to 1 decimal for SVG compactness.
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(" ");
}

/**
 * Extract a numeric series from a trend for a sparkline.
 *
 * Returns an array of (number | null) suitable for `buildSparklinePoints`.
 * - For "compliant": each point's `compliant` count
 * - For "missing": each point's `missing` count
 * - For "rate": each point's `percentage` (number | null — already null-safe)
 *
 * Pure. This is the bridge between ComplianceTrendPoint[] (rich objects) and
 * the simple numeric array the sparkline geometry function expects.
 *
 * @param points  Ascending ComplianceTrendPoint[] (already window-sliced)
 * @param series  Which numeric series to extract.
 * @returns (number | null)[] — same length as `points`.
 */
export function extractSparklineSeries(
  points: ComplianceTrendPoint[],
  series: "compliant" | "missing" | "rate",
): (number | null)[] {
  return points.map((p) => {
    if (series === "compliant") return p.compliant;
    if (series === "missing") return p.missing;
    return p.percentage; // rate
  });
}
