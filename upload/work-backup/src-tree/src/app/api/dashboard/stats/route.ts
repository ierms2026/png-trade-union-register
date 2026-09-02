import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";

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
  const unionWhere =
    user.role === "OFFICER" && user.assignedUnionId
      ? { id: user.assignedUnionId }
      : {};

  // Per chunk 0.1 audit: "Documents" = active (non-disposed) docs only.
  // disposedAt: null excludes the 2 disposed docs, giving 21 (matching
  // the /api/dashboard/document-types endpoint).
  const [totalUnions, activeCount] = await Promise.all([
    db.union.count({ where: unionWhere }),
    db.document.count({
      where:
        user.role === "OFFICER" && user.assignedUnionId
          ? { unionId: user.assignedUnionId, disposedAt: null }
          : { disposedAt: null },
    }),
  ]);

  // --- 2. Compliance summary via the live matrix -------------------------
  // fetchMatrixData loads all unions/rules/documents/versions. For
  // Officers, we filter the unions list post-fetch (the matrix builder
  // iterates over `data.unions`, so filtering there scopes the result).
  const data = await fetchMatrixData();
  if (user.role === "OFFICER" && user.assignedUnionId) {
    data.unions = data.unions.filter((u) => u.id === user.assignedUnionId);
  }
  const matrix = buildComplianceMatrix(data);

  // Tally the status counts across all unions × all rules.
  let compliant = 0,
    expiring = 0,
    overdue = 0,
    missing = 0,
    notApplicable = 0;
  for (const row of matrix.unions) {
    for (const cell of row.scores) {
      switch (cell.status) {
        case "COMPLIANT": compliant++; break;
        case "EXPIRING": expiring++; break;
        case "OVERDUE": overdue++; break;
        case "MISSING": missing++; break;
        case "NOT_APPLICABLE": notApplicable++; break;
      }
    }
  }

  // Overall rate = COMPLIANT / (all applicable cells). NOT_APPLICABLE
  // cells are excluded from BOTH numerator and denominator (per the
  // spec — see computeUnionScore in calculator.ts).
  const applicable = compliant + expiring + overdue + missing;
  const overallRate = applicable === 0 ? 0 : Math.round((compliant / applicable) * 100);

  return NextResponse.json({
    totalUnions,
    activeCount,
    compliance: {
      compliant,
      expiring,
      overdue,
      missing,
      notApplicable,
      overallRate,
    },
  });
}
