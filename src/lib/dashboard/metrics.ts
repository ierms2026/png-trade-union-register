import type { ComplianceStatus } from "./status-config";
import { APPLICABLE_STATUSES } from "./status-config";

// =============================================================================
// DashboardMetrics — the canonical type for dashboard data.
//
// Per chunk 0.1 audit findings (encoded in the type design):
//
// 1. "Active documents" = non-disposed (disposedAt: null). The audit
//    recommends chunk 1.1 use this definition consistently (Option A).
//    The type names the field `activeCount` to make the definition
//    explicit — not just "totalDocuments" which is ambiguous.
//
// 2. "Required documents" = (union × required-rule) pairs. All 13 rules
//    are required in the current seed, so this = 6 × 13 = 78 cells.
//    The compliance matrix has one cell per pair.
//
// 3. "On-file" = a Document row exists for a (union × rule) pair, is not
//    disposed, AND has reviewStatus === "APPROVED". Per the review workflow
//    Option A (prior session), PENDING/REJECTED documents count as MISSING,
//    not as "on-file". The ComplianceCell.status field encodes this —
//    a cell with a PENDING document will have status = "MISSING".
//
// 4. complianceRate carries explicit numerator, denominator, and
//    percentage — so no component ever re-computes the rate from raw
//    counts (which is where drift bugs happen).
//
// TODO(chunk-1.1): The stats route currently returns `totalDocuments` (23,
// includes disposed). Chunk 1.1 should change it to return `activeCount`
// (21, excludes disposed) to match this type and the document-types route.
// The live "17 compliant" (not "14" from the chunk prompt) is authoritative
// — do not "fix" 17 → 14; the prompt value was data drift.
// =============================================================================

export interface UnionSummary {
  id: string;
  name: string;
  registrationNo: string;
  status: "ACTIVE" | "SUSPENDED" | "DEREGISTERED";
}

export interface DocumentTypeCount {
  documentType: string;
  count: number;
}

/**
 * Per-type required vs on-file comparison. Each required document type
 * gets one entry showing how many unions have that type on file vs
 * how many are required (totalUnions).
 */
export interface RequiredVsOnFileEntry {
  documentType: string;
  /** How many unions require this type (= totalUnions for a required rule). */
  required: number;
  /** How many non-disposed documents of this type exist on file. */
  onFile: number;
  /** required - onFile. Always >= 0 if data is consistent. */
  missing: number;
}

export interface ComplianceCell {
  unionId: string;
  documentType: string;
  status: ComplianceStatus;
  /** When the latest approved version was filed. Null if no version or not approved. */
  filedAt: Date | null;
  /** When the document expires (filedAt + renewalYears). Null if no version or N/A. */
  expiryDate: Date | null;
  /** The Document row's ID, if a document exists for this cell. Null for MISSING. */
  documentId?: string | null;
}

export interface ComplianceRate {
  /** Number of COMPLIANT cells */
  numerator: number;
  /** Number of applicable cells (COMPLIANT + EXPIRING + OVERDUE + AWAITING_REVIEW + MISSING) */
  denominator: number;
  /** numerator / denominator × 100, rounded to nearest integer. 0 if denominator is 0. */
  percentage: number;
}

export interface ComplianceCounts {
  COMPLIANT: number;
  EXPIRING: number;
  OVERDUE: number;
  AWAITING_REVIEW: number;
  MISSING: number;
  NOT_APPLICABLE: number;
}

export interface DashboardMetrics {
  /** Unions in the registry (all statuses — ACTIVE/SUSPENDED/DEREGISTERED) */
  unions: {
    count: number;
    list: UnionSummary[];
  };
  /** Documents on file. Per audit: "active" = non-disposed (disposedAt: null). */
  documents: {
    /** Total non-disposed documents across all unions. */
    activeCount: number;
    /** Per document-type breakdown (non-disposed only). */
    byType: DocumentTypeCount[];
  };
  /** Compliance matrix — one cell per (union × required rule) pair. */
  compliance: {
    cells: ComplianceCell[];
    counts: ComplianceCounts;
    rate: ComplianceRate;
  };
}

// ---------------------------------------------------------------------------
// Selector helpers — logic lives in this module, not in components.
// ---------------------------------------------------------------------------

/**
 * Tally compliance cells by status into a ComplianceCounts object.
 * Pure function — pass cells, get counts.
 */
export function tallyComplianceCounts(cells: ComplianceCell[]): ComplianceCounts {
  const counts: ComplianceCounts = {
    COMPLIANT: 0,
    EXPIRING: 0,
    OVERDUE: 0,
    AWAITING_REVIEW: 0,
    MISSING: 0,
    NOT_APPLICABLE: 0,
  };
  for (const cell of cells) {
    counts[cell.status]++;
  }
  return counts;
}

/**
 * Compute the compliance rate from a set of cells.
 * numerator = COMPLIANT count.
 * denominator = COMPLIANT + EXPIRING + OVERDUE + AWAITING_REVIEW + MISSING
 * (excludes NOT_APPLICABLE).
 *
 * AWAITING_REVIEW is included in the denominator — the document type IS
 * required, the union just hasn't gotten approval yet. This means a pending
 * review lowers the compliance rate (it's not compliant yet), but the
 * matrix shows it as a distinct status (not folded into MISSING) so the
 * Registrar can see their review backlog.
 */
export function computeComplianceRate(cells: ComplianceCell[]): ComplianceRate {
  const counts = tallyComplianceCounts(cells);
  return computeRateFromCounts(counts);
}

/**
 * Tally any array of `{ status: ComplianceStatus }` objects into a
 * ComplianceCounts object. More general than `tallyComplianceCounts` —
 * accepts ComplianceScoreCell, ComplianceCell, or any shape that has a
 * `status` field. Used by the dashboard stats API route which works with
 * ComplianceScoreCell (from the matrix builder), not ComplianceCell.
 *
 * Pure: no I/O, no side effects.
 */
export function tallyStatuses(
  cells: Array<{ status: ComplianceStatus }>,
): ComplianceCounts {
  const counts: ComplianceCounts = {
    COMPLIANT: 0,
    EXPIRING: 0,
    OVERDUE: 0,
    AWAITING_REVIEW: 0,
    MISSING: 0,
    NOT_APPLICABLE: 0,
  };
  for (const cell of cells) {
    counts[cell.status]++;
  }
  return counts;
}

/**
 * Compute the compliance rate from a ComplianceCounts object.
 * numerator = COMPLIANT count.
 * denominator = COMPLIANT + EXPIRING + OVERDUE + AWAITING_REVIEW + MISSING
 * (excludes NOT_APPLICABLE).
 *
 * This is the same rule as `computeComplianceRate` but operates on counts
 * directly (useful when the caller already has a ComplianceCounts object
 * from `tallyStatuses` and doesn't want to re-tally).
 *
 * Pure: no I/O, no side effects.
 */
// PROVISIONAL(D1): see docs/decisions-and-defaults.md
// Rule: numerator = COMPLIANT; denominator = COMPLIANT + EXPIRING + OVERDUE + AWAITING_REVIEW + MISSING (NOT_APPLICABLE excluded).
export function computeRateFromCounts(counts: ComplianceCounts): ComplianceRate {
  const numerator = counts.COMPLIANT;
  const denominator =
    counts.COMPLIANT + counts.EXPIRING + counts.OVERDUE + counts.AWAITING_REVIEW + counts.MISSING;
  const percentage =
    denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
  return { numerator, denominator, percentage };
}

/**
 * Compute a percentage from a numerator/denominator pair, returning null
 * for zero denominators (per chunk 1.2's rule: "no NaN, ever").
 *
 * THE standing invariant from chunk 1.2: "percentage arithmetic lives ONLY
 * in the metrics module — components never compute percentages." This
 * function is the single entry point for percentage computation when a
 * caller already has numerator + denominator (e.g. a ComplianceTrendPoint
 * from the 4.2a snapshot store, or a ComplianceRate numerator/denominator
 * that hasn't been resolved yet).
 *
 * Returns:
 *   - `null` when denominator === 0 (no applicable cells → no meaningful rate)
 *   - `Math.round(numerator / denominator × 100)` otherwise (0–100 integer)
 *
 * Why `null` instead of `0`:
 *   `computeComplianceRate` above returns `percentage: 0` for zero
 *   denominator because that's the right thing for a "live rate card"
 *   (the user sees "0%" and understands "no one's compliant"). But for
 *   HISTORICAL points (4.2b trend chart), a zero denominator means
 *   "this day had no applicable requirements" — which is semantically
 *   different from "0% compliant". Returning `null` lets the chart
 *   distinguish the two cases (null → skip the point on the line, vs
 *   0 → draw the point at y=0).
 *
 * The chart component MUST handle null percentage without producing NaN
 * downstream — see `sliceTrendToWindow` in snapshot.ts which preserves
 * the null through to the chart data array.
 */
export function computePercentage(
  numerator: number,
  denominator: number,
): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100);
}

/** Get the compliance counts object from a DashboardMetrics instance. */
export function getComplianceCounts(metrics: DashboardMetrics): ComplianceCounts {
  return metrics.compliance.counts;
}

/** Get the compliance rate (numerator, denominator, percentage) from metrics. */
export function getComplianceRate(metrics: DashboardMetrics): ComplianceRate {
  return metrics.compliance.rate;
}

/** Get the total active document count (non-disposed). */
export function getActiveDocumentCount(metrics: DashboardMetrics): number {
  return metrics.documents.activeCount;
}

/** Get the per-type document breakdown. */
export function getDocumentsByType(
  metrics: DashboardMetrics,
): DocumentTypeCount[] {
  return metrics.documents.byType;
}

/** Get the union list. */
export function getUnionList(metrics: DashboardMetrics): UnionSummary[] {
  return metrics.unions.list;
}

/**
 * Get all compliance cells expiring within the given number of days.
 * Only returns cells with status "EXPIRING" whose expiryDate falls
 * within the window. Pure function.
 */
export function getExpiringWithin(
  cells: ComplianceCell[],
  days: number,
): ComplianceCell[] {
  const now = Date.now();
  const thresholdMs = now + days * 24 * 60 * 60 * 1000;
  return cells.filter((cell) => {
    if (cell.status !== "EXPIRING" || !cell.expiryDate) return false;
    return cell.expiryDate.getTime() <= thresholdMs;
  });
}

/** Get all cells with status OVERDUE. */
export function getOverdueCells(cells: ComplianceCell[]): ComplianceCell[] {
  return cells.filter((cell) => cell.status === "OVERDUE");
}

/** Get all cells with status MISSING. */
export function getMissingCells(cells: ComplianceCell[]): ComplianceCell[] {
  return cells.filter((cell) => cell.status === "MISSING");
}

/**
 * Get unions that have at least one non-compliant cell (OVERDUE, AWAITING_REVIEW,
 * or MISSING). Useful for "unions needing attention" widgets.
 *
 * AWAITING_REVIEW is included because the union's compliance is not yet
 * confirmed — the Registrar needs to act. It's a different KIND of attention
 * than MISSING (which means the union needs to act), but both mean "this
 * union's compliance is not currently green."
 */
export function getUnionsWithNonCompliance(
  metrics: DashboardMetrics,
): UnionSummary[] {
  const nonCompliantUnionIds = new Set(
    metrics.compliance.cells
      .filter(
        (cell) =>
          cell.status === "OVERDUE" ||
          cell.status === "AWAITING_REVIEW" ||
          cell.status === "MISSING",
      )
      .map((cell) => cell.unionId),
  );
  return metrics.unions.list.filter((u) =>
    nonCompliantUnionIds.has(u.id),
  );
}

/**
 * Build a complete DashboardMetrics object from raw inputs.
 * This is the canonical constructor — API routes should use this to
 * assemble the response, ensuring the shape is always correct.
 */
export function buildDashboardMetrics(params: {
  unions: UnionSummary[];
  activeDocumentCount: number;
  documentsByType: DocumentTypeCount[];
  complianceCells: ComplianceCell[];
}): DashboardMetrics {
  const counts = tallyComplianceCounts(params.complianceCells);
  const rate = computeComplianceRate(params.complianceCells);
  return {
    unions: {
      count: params.unions.length,
      list: params.unions,
    },
    documents: {
      activeCount: params.activeDocumentCount,
      byType: params.documentsByType,
    },
    compliance: {
      cells: params.complianceCells,
      counts,
      rate,
    },
  };
}

/**
 * Compute required-vs-on-file per document type.
 *
 * Each required rule type requires 1 document per union (= totalUnions).
 * The on-file count comes from the document-types aggregation (non-disposed).
 * Types with 0 on-file are INCLUDED (they show the full gap).
 *
 * Sort order: missing DESC, ties broken by documentType ASC (deterministic).
 *
 * @param onFileByType  Array of { documentType, count } from the document-types API
 * @param requiredTypes Array of document type names that are required (from ComplianceRule)
 * @param totalUnions   Number of unions (required per type = totalUnions × 1)
 * @returns Sorted array of RequiredVsOnFileEntry
 */
export function getRequiredVsOnFileByType(
  onFileByType: DocumentTypeCount[],
  requiredTypes: string[],
  totalUnions: number,
): RequiredVsOnFileEntry[] {
  // Build a map of on-file counts for quick lookup
  const onFileMap = new Map<string, number>();
  for (const entry of onFileByType) {
    onFileMap.set(entry.documentType, entry.count);
  }

  const result: RequiredVsOnFileEntry[] = [];
  for (const docType of requiredTypes) {
    const required = totalUnions; // each required rule × 1 per union
    const onFile = onFileMap.get(docType) ?? 0;
    const missing = required - onFile;
    result.push({ documentType: docType, required, onFile, missing });
  }

  // Sort by missing DESC, ties by documentType ASC
  result.sort((a, b) => {
    if (b.missing !== a.missing) return b.missing - a.missing;
    return a.documentType.localeCompare(b.documentType);
  });

  return result;
}

/**
 * Sum the on-file counts across all RequiredVsOnFileEntry.
 * Must equal the Documents KPI (activeCount) if data is consistent.
 */
export function sumOnFile(entries: RequiredVsOnFileEntry[]): number {
  return entries.reduce((sum, e) => sum + e.onFile, 0);
}

/**
 * A single actionable compliance cell — overdue or expiring — with enough
 * context for the Needs Attention panel to render a row.
 */
export interface NeedsAttentionEntry {
  unionId: string;
  unionName: string;
  documentType: string;
  status: ComplianceStatus;
  /** When the document expires. Null if no version (shouldn't happen for OVERDUE/EXPIRING). */
  expiryDate: Date | null;
}

/**
 * Extract overdue + expiring cells from the compliance matrix, sorted for
 * the Needs Attention panel.
 *
 * Sort order:
 *   1. OVERDUE before EXPIRING (overdue is more urgent)
 *   2. Within each group, by expiryDate ascending (most urgent first)
 *   3. Ties broken by unionName ascending (deterministic)
 *
 * @param cells   ComplianceCell[] from the matrix
 * @param unions  UnionSummary[] (for name lookup)
 * @param now     Injectable "now" for testability — defaults to new Date()
 * @returns Sorted NeedsAttentionEntry[] — only OVERDUE + EXPIRING cells
 */
export function getNeedsAttention(
  cells: ComplianceCell[],
  unions: UnionSummary[],
  now: Date = new Date(),
): NeedsAttentionEntry[] {
  const unionNameById = new Map(unions.map((u) => [u.id, u.name]));

  const entries: NeedsAttentionEntry[] = [];
  for (const cell of cells) {
    if (cell.status !== "OVERDUE" && cell.status !== "EXPIRING") continue;
    if (!cell.expiryDate) continue;

    entries.push({
      unionId: cell.unionId,
      unionName: unionNameById.get(cell.unionId) ?? "Unknown Union",
      documentType: cell.documentType,
      status: cell.status,
      expiryDate: cell.expiryDate,
    });
  }

  // Sort: OVERDUE first, then by expiryDate ASC, then by unionName ASC
  entries.sort((a, b) => {
    // OVERDUE (0) before EXPIRING (1)
    const aPriority = a.status === "OVERDUE" ? 0 : 1;
    const bPriority = b.status === "OVERDUE" ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;

    // By expiryDate ascending (most urgent first)
    if (a.expiryDate && b.expiryDate) {
      const dateDiff = a.expiryDate.getTime() - b.expiryDate.getTime();
      if (dateDiff !== 0) return dateDiff;
    }

    // Ties by unionName ascending
    return a.unionName.localeCompare(b.unionName);
  });

  return entries;
}

/** Maximum number of rows to display in the Needs Attention panel. */
export const NEEDS_ATTENTION_CAP = 10;

// =============================================================================
// Expiry Forecast — forward-looking buckets of documents coming due.
// =============================================================================

/** A single forecast bucket: how many docs fall within this day-range. */
export interface ForecastBucket {
  /** Upper bound in days (inclusive). */
  days: number;
  /** Lower bound in days (exclusive). Always the previous bucket's `days`, or 0 for the first. */
  fromDays: number;
  /** How many documents fall in this bucket. */
  count: number;
  /** Document IDs in this bucket. */
  documentIds: string[];
}

/** The complete expiry forecast: 3 buckets + overdue count. */
export interface ExpiryForecast {
  buckets: ForecastBucket[];
  /** Documents that are already past due (excluded from buckets — the forecast is forward-looking only). */
  overdueCount: number;
  /** Total across all buckets + overdueCount. */
  totalActionable: number;
}

/**
 * Compute the expiry forecast from compliance cells.
 *
 * Buckets are exclusive: (0, bucket[0]], (bucket[0], bucket[1]], (bucket[1], bucket[2]].
 * A doc due exactly 30 days from now is in bucket 0 (inclusive upper bound).
 * A doc due exactly 31 days from now is in bucket 1.
 *
 * Exclusions:
 *   - Overdue docs (past due): excluded from buckets, counted in overdueCount
 *   - Docs with no due date: excluded entirely
 *   - Missing docs: never have a due date, never appear
 *   - Docs due > 90 days out: excluded from display (beyond the last bucket)
 *
 * @param cells  ComplianceCell[] from the matrix
 * @param now    Injectable "now" — defaults to new Date()
 * @param buckets  Day-count boundaries from FORECAST_BUCKETS. Defaults to [30, 60, 90].
 * @returns ExpiryForecast with 3 buckets + overdueCount
 */
export function getExpiryForecast(
  cells: ComplianceCell[],
  now: Date = new Date(),
  buckets: readonly number[] = [30, 60, 90],
): ExpiryForecast {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  const maxBucketDays = buckets[buckets.length - 1];

  // Initialize buckets
  const forecastBuckets: ForecastBucket[] = buckets.map((days, i) => ({
    days,
    fromDays: i === 0 ? 0 : buckets[i - 1],
    count: 0,
    documentIds: [],
  }));

  let overdueCount = 0;

  for (const cell of cells) {
    // Exclude: no due date
    if (!cell.expiryDate) continue;
    // Exclude: MISSING (no document on file), AWAITING_REVIEW (document
    // exists but isn't approved yet — its expiry date isn't meaningful for
    // compliance forecasting until the Registrar approves it), NOT_APPLICABLE.
    if (cell.status === "MISSING" || cell.status === "AWAITING_REVIEW" || cell.status === "NOT_APPLICABLE") continue;

    const diffDays = (cell.expiryDate.getTime() - nowMs) / MS_PER_DAY;

    if (diffDays < 0) {
      // Overdue: past due — count separately, not in buckets
      overdueCount++;
      continue;
    }

    // Beyond the last bucket (> 90 days): excluded from display
    if (diffDays > maxBucketDays) continue;

    // Find which bucket this falls into
    // Buckets are (fromDays, days] — inclusive upper bound
    for (let i = 0; i < forecastBuckets.length; i++) {
      const bucket = forecastBuckets[i];
      if (diffDays <= bucket.days) {
        bucket.count++;
        if (cell.documentId) {
          bucket.documentIds.push(cell.documentId);
        }
        break;
      }
    }
  }

  const totalActionable =
    forecastBuckets.reduce((sum, b) => sum + b.count, 0) + overdueCount;

  return {
    buckets: forecastBuckets,
    overdueCount,
    totalActionable,
  };
}

// =============================================================================
// UnionDocMatrix — the union × document-type compliance matrix.
//
// Per chunk 0.1 audit: required doc types are IDENTICAL for every union
// (13 global ComplianceRules, all required=true). The NOT_REQUIRED cell
// state is modeled defensively but will never occur in the current fixture.
//
// The status derivation is `calculateStatus` from calculator.ts — the
// canonical single derivation. No duplicate `deriveDocumentStatus` is
// created; the matrix builder (buildComplianceMatrix) already calls
// calculateStatusFromRows which wraps calculateStatus.
// =============================================================================

/** A single cell in the union × doc-type matrix. */
export interface UnionDocMatrixCell {
  /** The compliance status from STATUS_CONFIG. */
  status: ComplianceStatus;
  /** The Document row's ID, if a document exists. Null for MISSING / NOT_REQUIRED. */
  documentId: string | null;
  /** When the document expires (null for MISSING / NOT_REQUIRED / no version). */
  dueDate: Date | null;
}

/** A single row (one union) in the matrix. */
export interface UnionDocMatrixRow {
  unionId: string;
  unionName: string;
  /** One entry per required doc type, in config order. */
  cells: UnionDocMatrixCell[];
}

/** Aggregation helpers for the matrix. */
export interface MatrixTotals {
  /** Per-status counts across the entire matrix. */
  rowTotals: ComplianceCounts[];
  /** Per-status counts per doc type (column). */
  columnTotals: Record<string, ComplianceCounts>;
  /** Grand totals across all cells. */
  grandTotals: ComplianceCounts;
}

/** The complete matrix + metadata. */
export interface UnionDocMatrix {
  rows: UnionDocMatrixRow[];
  /** Doc type names in column order (matches cells[] order). */
  columnTypes: string[];
  totals: MatrixTotals;
}

/**
 * Build a union × document-type compliance matrix from cells + unions.
 *
 * Rows = unions (name ASC), columns = required doc types (first-seen order,
 * which matches the compliance matrix's rule order).
 * Cells = { status, documentId, dueDate } from the ComplianceCell data.
 *
 * NOT_REQUIRED cells are modeled as a status but will never appear in the
 * current fixture (all 13 rules are required for all unions).
 *
 * @param cells   ComplianceCell[] — one per (union × doc type) pair, enriched with documentId
 * @param unions  UnionSummary[] — determines row order + names
 * @param requiredTypes  String[] — determines column order
 * @returns UnionDocMatrix with rows, columns, and aggregation totals
 */
export function getUnionDocMatrix(
  cells: ComplianceCell[],
  unions: UnionSummary[],
  requiredTypes: string[],
): UnionDocMatrix {
  // Build a lookup: (unionId, documentType) → ComplianceCell
  const cellMap = new Map<string, ComplianceCell>();
  for (const cell of cells) {
    cellMap.set(`${cell.unionId}::${cell.documentType}`, cell);
  }

  // Sort unions by name ASC (deterministic)
  const sortedUnions = [...unions].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // Initialize column totals
  const columnTotals: Record<string, ComplianceCounts> = {};
  for (const docType of requiredTypes) {
    columnTotals[docType] = {
      COMPLIANT: 0,
      EXPIRING: 0,
      OVERDUE: 0,
      AWAITING_REVIEW: 0,
      MISSING: 0,
      NOT_APPLICABLE: 0,
    };
  }

  // Initialize grand totals
  const grandTotals: ComplianceCounts = {
    COMPLIANT: 0,
    EXPIRING: 0,
    OVERDUE: 0,
    AWAITING_REVIEW: 0,
    MISSING: 0,
    NOT_APPLICABLE: 0,
  };

  // Build rows
  const rows: UnionDocMatrixRow[] = sortedUnions.map((union) => {
    const rowCells: UnionDocMatrixCell[] = requiredTypes.map((docType) => {
      const cell = cellMap.get(`${union.id}::${docType}`);

      // If no cell exists for this (union × type), it's MISSING (or NOT_REQUIRED
      // if the type isn't required — but in the current fixture all types are
      // required for all unions, so this path produces MISSING)
      if (!cell) {
        grandTotals.MISSING++;
        columnTotals[docType].MISSING++;
        return {
          status: "MISSING" as ComplianceStatus,
          documentId: null,
          dueDate: null,
        };
      }

      // Count the status in totals
      grandTotals[cell.status]++;
      columnTotals[docType][cell.status]++;

      return {
        status: cell.status,
        documentId: cell.documentId ?? null,
        dueDate: cell.expiryDate,
      };
    });

    return {
      unionId: union.id,
      unionName: union.name,
      cells: rowCells,
    };
  });

  // Build row totals (per union)
  const rowTotals: ComplianceCounts[] = rows.map((row) => {
    const counts: ComplianceCounts = {
      COMPLIANT: 0,
      EXPIRING: 0,
      OVERDUE: 0,
      AWAITING_REVIEW: 0,
      MISSING: 0,
      NOT_APPLICABLE: 0,
    };
    for (const cell of row.cells) {
      counts[cell.status]++;
    }
    return counts;
  });

  return {
    rows,
    columnTypes: requiredTypes,
    totals: {
      rowTotals,
      columnTotals,
      grandTotals,
    },
  };
}
