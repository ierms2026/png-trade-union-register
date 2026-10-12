import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import { tallyStatuses, computeRateFromCounts } from "@/lib/dashboard/metrics";
import { getUnionScope } from "@/lib/auth/union-scope";

// =============================================================================
// GET /api/dashboard/stats
// -----------------------------------------------------------------------------
// Headline metrics for the Dashboard view. Available to ALL authenticated
// roles — Officers see stats scoped to their union (the compliance matrix
// is computed live from the rules + documents; Officer scoping filters
// the unions query before the matrix is built).
//
// RESPONSE SHAPE:
//   {
//     totalUnions: number,
//     activeCount: number,  // non-disposed documents only (per chunk 0.1 audit)
//     compliance: {
//       compliant: number, expiring: number, overdue: number,
//       missing: number, notApplicable: number,
//       overallRate: number  // 0-100, % of COMPLIANT cells across all unions
//     }
//   }
// =============================================================================

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  // --- 1. Count unions + documents (parallel) ----------------------------
  // Officers see only their assigned union's counts.
  const scope = getUnionScope({ role: user.role, assignedUnionId: user.assignedUnionId });
  if (scope.kind === "none") {
    return NextResponse.json({ error: "Forbidden: your account is not assigned to a union." }, { status: 403 });
  }
  const unionWhere = scope.kind === "union" ? { id: scope.unionId } : {};

  // Per chunk 0.1 audit: "Documents" = active (non-disposed) docs only.
  // disposedAt: null excludes the 2 disposed docs, giving 21 (matching
  // the /api/dashboard/document-types endpoint).
  const [totalUnions, activeCount] = await Promise.all([
    db.union.count({ where: unionWhere }),
    db.document.count({
      where: scope.kind === "union"
        ? { unionId: scope.unionId, disposedAt: null }
        : { disposedAt: null },
    }),
  ]);

  // --- 2. Compliance summary via the live matrix -------------------------
  // fetchMatrixData loads all unions/rules/documents/versions. For
  // Officers, we filter the unions list post-fetch (the matrix builder
  // iterates over `data.unions`, so filtering there scopes the result).
  const data = await fetchMatrixData();
  if (scope.kind === "union") {
    data.unions = data.unions.filter((u) => u.id === scope.unionId);
  }
  const matrix = buildComplianceMatrix(data);

  // Tally the status counts across all unions × all rules using the
  // canonical helper from metrics.ts. This ensures AWAITING_REVIEW (and
  // any future status) is counted correctly — the old hand-rolled switch
  // omitted AWAITING_REVIEW, causing the dashboard KPI tile to render blank.
  const allCells = matrix.unions.flatMap((row) => row.scores);
  const counts = tallyStatuses(allCells);
  const rate = computeRateFromCounts(counts);

  // --- 3. Build needs-attention entries (overdue + expiring) -----------
  // Extract from the matrix cells that have status OVERDUE or EXPIRING,
  // with union name + expiry date for the Needs Attention panel.
  const needsAttention = matrix.unions.flatMap((row) =>
    row.scores
      .filter((cell) => cell.status === "OVERDUE" || cell.status === "EXPIRING")
      .filter((cell) => cell.expiresAt !== null)
      .map((cell) => ({
        unionId: row.unionId,
        unionName: row.unionName,
        documentType: cell.documentType,
        status: cell.status,
        expiryDate: cell.expiresAt,
      }))
  );

  // Sort: OVERDUE before EXPIRING, then by expiryDate ASC, then unionName ASC
  needsAttention.sort((a, b) => {
    const aPriority = a.status === "OVERDUE" ? 0 : 1;
    const bPriority = b.status === "OVERDUE" ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    if (a.expiryDate && b.expiryDate) {
      const dateDiff = new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
      if (dateDiff !== 0) return dateDiff;
    }
    return a.unionName.localeCompare(b.unionName);
  });

  return NextResponse.json({
    totalUnions,
    activeCount,
    compliance: {
      compliant: counts.COMPLIANT,
      expiring: counts.EXPIRING,
      overdue: counts.OVERDUE,
      awaitingReview: counts.AWAITING_REVIEW,
      missing: counts.MISSING,
      notApplicable: counts.NOT_APPLICABLE,
      overallRate: rate.percentage,
      rate: {
        numerator: rate.numerator,
        denominator: rate.denominator,
        percentage: rate.percentage,
      },
    },
    needsAttention,
  });
}
