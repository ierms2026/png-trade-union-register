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
}

export interface ComplianceRate {
  /** Number of COMPLIANT cells */
  numerator: number;
  /** Number of applicable cells (COMPLIANT + EXPIRING + OVERDUE + MISSING) */
  denominator: number;
  /** numerator / denominator × 100, rounded to nearest integer. 0 if denominator is 0. */
  percentage: number;
}

export interface ComplianceCounts {
  COMPLIANT: number;
  EXPIRING: number;
  OVERDUE: number;
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
 * denominator = COMPLIANT + EXPIRING + OVERDUE + MISSING (excludes NOT_APPLICABLE).
 * percentage = round(numerator / denominator × 100), or 0 if denominator is 0.
 */
export function computeComplianceRate(cells: ComplianceCell[]): ComplianceRate {
  const counts = tallyComplianceCounts(cells);
  const numerator = counts.COMPLIANT;
  const denominator =
    counts.COMPLIANT + counts.EXPIRING + counts.OVERDUE + counts.MISSING;
  const percentage =
    denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
  return { numerator, denominator, percentage };
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
 * Get unions that have at least one non-compliant cell (OVERDUE or MISSING).
 * Useful for "unions needing attention" widgets.
 */
export function getUnionsWithNonCompliance(
  metrics: DashboardMetrics,
): UnionSummary[] {
  const nonCompliantUnionIds = new Set(
    metrics.compliance.cells
      .filter((cell) => cell.status === "OVERDUE" || cell.status === "MISSING")
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
