// =============================================================================
// Digest issue collection — extracted from /api/cron/compliance-digest so
// the logic is unit-testable without calling the authenticated cron handler.
//
// This function takes a built compliance matrix + the rules map + a reference
// time, and returns three buckets: overdue, expiring within 30 days, and
// expiring within 31-90 days. The digest route uses this function directly;
// tests call it with a seeded matrix.
//
// The behavior is IDENTICAL to the inline loop that was in the digest handler
// before extraction — no logic changes, just moved so tests can exercise it.
//
// This is NOT the same as collectSweepIssues (src/lib/compliance/sweep-issues.ts):
//   - collectSweepIssues buckets into tier codes (T_30_DAYS, T_0_OVERDUE, etc.)
//     for notification routing + auto-task creation.
//   - collectDigestIssues buckets into overdue / expiring30 / expiring90 for
//     the weekly digest email's table sections.
// They bucket differently and must not be merged.
// =============================================================================

import type { ComplianceMatrixResponse } from "./matrix";

export interface DigestItem {
  unionName: string;
  documentType: string;
  daysUntilExpiry: number;
  expiryDate: string;
}

export interface DigestIssues {
  overdue: DigestItem[];
  expiring30: DigestItem[];
  expiring90: DigestItem[];
}

/**
 * Collect digest issues from a built compliance matrix, bucketed by
 * days-until-expiry.
 *
 * Skips cells with no expiry date (NOT_APPLICABLE, MISSING, and — after T50 —
 * AWAITING_REVIEW, whose expiry date is not meaningful until the Registrar
 * approves the document). Also skips one-time filings (renewalYears >= 99).
 *
 * @param matrix The built compliance matrix (from buildComplianceMatrix)
 * @param renewalByType Map of documentType → renewalYears
 * @param now The reference time (usually `new Date()`)
 * @returns Three buckets: overdue, expiring30 (≤30 days), expiring90 (31-90 days)
 */
export function collectDigestIssues(
  matrix: ComplianceMatrixResponse,
  renewalByType: Map<string, number>,
  now: Date,
): DigestIssues {
  const overdue: DigestItem[] = [];
  const expiring30: DigestItem[] = [];
  const expiring90: DigestItem[] = [];

  const nowMs = now.getTime();
  const msPerDay = 24 * 60 * 60 * 1000;

  for (const row of matrix.unions) {
    for (const cell of row.scores) {
      // No expiry date → not an active filing (MISSING / NOT_APPLICABLE /
      // AWAITING_REVIEW after T50). Skip.
      if (!cell.expiresAt) continue;
      const renewalYears = renewalByType.get(cell.documentType) ?? 1;
      if (renewalYears >= 99) continue; // skip one-time filings

      const expiryMs = new Date(cell.expiresAt).getTime();
      const daysUntil = Math.floor((expiryMs - nowMs) / msPerDay);
      const expiryStr = new Date(cell.expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

      const item: DigestItem = {
        unionName: row.unionName,
        documentType: cell.documentType,
        daysUntilExpiry: daysUntil,
        expiryDate: expiryStr,
      };

      if (daysUntil < 0) overdue.push(item);
      else if (daysUntil <= 30) expiring30.push(item);
      else if (daysUntil <= 90) expiring90.push(item);
    }
  }

  // Sort each bucket: most urgent first (most overdue / soonest expiry)
  overdue.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  expiring30.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  expiring90.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  return { overdue, expiring30, expiring90 };
}
