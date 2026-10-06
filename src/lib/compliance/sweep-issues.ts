// =============================================================================
// Sweep issue collection — extracted from /api/cron/compliance-sweep so the
// logic is unit-testable without calling the authenticated cron handler.
//
// This function takes a built compliance matrix + the rules map + a reference
// time, and returns the list of tiered "issues" that the sweep would notify
// on. The cron route uses this function directly; tests call it with a
// seeded matrix.
//
// The behavior is IDENTICAL to the inline loop that was in the route handler
// before extraction — no logic changes, just moved so tests can exercise it.
// =============================================================================

import type { ComplianceMatrixResponse } from "./matrix";

export type Tier = "T_180_DAYS" | "T_90_DAYS" | "T_30_DAYS" | "T_0_OVERDUE" | "T_30_OVERDUE";

export interface SweepIssue {
  unionId: string;
  unionName: string;
  documentType: string;
  tier: Tier;
  expiresAt: string | null;
  renewalYears: number;
  daysUntilExpiry: number | null;
}

/**
 * Collect tiered compliance issues from a built compliance matrix.
 *
 * Skips cells with no expiry date (NOT_APPLICABLE, MISSING, and — after T50 —
 * AWAITING_REVIEW, whose expiry date is not meaningful until the Registrar
 * approves the document). Also skips one-time filings (renewalYears >= 99).
 *
 * @param matrix The built compliance matrix (from buildComplianceMatrix)
 * @param renewalByType Map of documentType → renewalYears
 * @param now The reference time (usually `new Date()`)
 * @returns Array of SweepIssue objects, one per cell that falls into a tier
 */
export function collectSweepIssues(
  matrix: ComplianceMatrixResponse,
  renewalByType: Map<string, number>,
  now: Date,
): SweepIssue[] {
  const issues: SweepIssue[] = [];
  const nowMs = now.getTime();
  const msPerDay = 24 * 60 * 60 * 1000;

  for (const row of matrix.unions) {
    for (const cell of row.scores) {
      // No expiry date → not an active filing (MISSING / NOT_APPLICABLE /
      // AWAITING_REVIEW after T50). Skip.
      if (!cell.expiresAt) continue;
      // AWAITING_REVIEW defensive guard (T50): even if a future change
      // re-introduces an expiry date on these cells, the sweep must never
      // send renewal notices for documents that haven't been approved.
      if (cell.status === "AWAITING_REVIEW") continue;
      const renewalYears = renewalByType.get(cell.documentType) ?? 1;
      if (renewalYears >= 99) continue; // skip one-time filings
      const expiryMs = new Date(cell.expiresAt).getTime();
      const daysUntil = Math.floor((expiryMs - nowMs) / msPerDay);
      let tier: Tier | null = null;
      if (daysUntil < -30) tier = "T_30_OVERDUE";
      else if (daysUntil < 0) tier = "T_0_OVERDUE";
      else if (daysUntil <= 30) tier = "T_30_DAYS";
      else if (daysUntil <= 90) tier = "T_90_DAYS";
      else if (daysUntil <= 180 && renewalYears >= 3) tier = "T_180_DAYS";
      if (tier) {
        issues.push({
          unionId: row.unionId,
          unionName: row.unionName,
          documentType: cell.documentType,
          tier,
          expiresAt: cell.expiresAt,
          renewalYears,
          daysUntilExpiry: daysUntil,
        });
      }
    }
  }

  return issues;
}
