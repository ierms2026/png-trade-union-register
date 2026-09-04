import { db } from "@/lib/prisma";
import {
  fetchMatrixData,
  buildComplianceMatrix,
  type ComplianceMatrixResponse,
} from "@/lib/compliance/matrix";
import { EXPIRING_WINDOW_DAYS } from "./status-config";

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

/** A single compliance-snapshot row, in calendar (ascending-date) order. */
export interface ComplianceTrendPoint {
  /** UTC calendar date (YYYY-MM-DD). */
  date: string;
  compliant: number;
  expiring: number;
  overdue: number;
  missing: number;
  rateNumerator: number;
  rateDenominator: number;
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
  // the counts + the date. (If 4.2b later wants the stamp for "definition
  // changed" annotations, expose a sibling selector — don't widen this one.)
  return rows.map((r) => ({
    date: r.date,
    compliant: r.compliant,
    expiring: r.expiring,
    overdue: r.overdue,
    missing: r.missing,
    rateNumerator: r.rateNumerator,
    rateDenominator: r.rateDenominator,
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
