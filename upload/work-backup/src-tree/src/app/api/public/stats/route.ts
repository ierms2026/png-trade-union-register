import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";

// =============================================================================
// GET /api/public/stats
// -----------------------------------------------------------------------------
// Aggregate, non-sensitive registry statistics for the public portal hero.
//
// RETURNS:
//   { totalUnions, activeUnions, totalDocuments, overallComplianceRate }
//
// WHAT THIS DOESN'T EXPOSE:
//   - Per-union compliance breakdown
//   - Document contents, file paths, or download URLs
//   - User, Officer, or Registrar information
//   - Audit log entries
//
// RATE LIMITING:
//   Same per-IP limit as the other public routes (60 req/min).
// =============================================================================

export async function GET() {
  const [totalUnions, activeUnions, totalDocuments] = await Promise.all([
    db.union.count(),
    db.union.count({ where: { status: "ACTIVE" } }),
    db.document.count({ where: { disposedAt: null } }),
  ]);

  const data = await fetchMatrixData();
  const matrix = buildComplianceMatrix(data);

  let compliant = 0;
  let applicable = 0;
  for (const row of matrix.unions) {
    for (const cell of row.scores) {
      switch (cell.status) {
        case "COMPLIANT": compliant++; applicable++; break;
        case "EXPIRING":
        case "OVERDUE":
        case "MISSING": applicable++; break;
      }
    }
  }

  const overallComplianceRate = applicable === 0 ? 0 : Math.round((compliant / applicable) * 100);

  return NextResponse.json({
    totalUnions,
    activeUnions,
    totalDocuments,
    overallComplianceRate,
  });
}
