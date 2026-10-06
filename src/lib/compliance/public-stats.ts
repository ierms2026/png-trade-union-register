import { db } from "@/lib/prisma";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import { tallyStatuses, computeRateFromCounts } from "@/lib/dashboard/metrics";

// =============================================================================
// Public stats computation — extracted from /api/public/stats/route.ts so the
// REAL code can be unit-tested without spinning up a Next server.
//
// T72: replaced the route's hand-rolled switch + arithmetic (which omitted
// AWAITING_REVIEW from the denominator) with the canonical tallyStatuses() +
// computeRateFromCounts() from metrics.ts. The response shape is unchanged:
// { totalUnions, activeUnions, totalDocuments, overallComplianceRate }.
//
// D1/D2: the public rate now follows the same rule as the staff dashboard
// rate — AWAITING_REVIEW is in the denominator. See
// docs/decisions-and-defaults.md D1 + D2.
// =============================================================================

export interface PublicStats {
  totalUnions: number;
  activeUnions: number;
  totalDocuments: number;
  overallComplianceRate: number;
}

/**
 * Compute the public stats: union counts, active document count, and the
 * overall compliance rate following the D1 rule (AWAITING_REVIEW in the
 * denominator).
 *
 * @returns PublicStats with the same 4 fields the route has always returned.
 */
export async function computePublicStats(): Promise<PublicStats> {
  const [totalUnions, activeUnions, totalDocuments] = await Promise.all([
    db.union.count(),
    db.union.count({ where: { status: "ACTIVE" } }),
    db.document.count({ where: { disposedAt: null } }),
  ]);

  const data = await fetchMatrixData();
  const matrix = buildComplianceMatrix(data);

  // Tally all cells using the canonical helper — AWAITING_REVIEW is now
  // included in the denominator (was omitted before T72).
  const allCells = matrix.unions.flatMap((row) => row.scores);
  const counts = tallyStatuses(allCells);
  const rate = computeRateFromCounts(counts);

  return {
    totalUnions,
    activeUnions,
    totalDocuments,
    overallComplianceRate: rate.percentage,
  };
}
