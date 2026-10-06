import { NextResponse } from "next/server";
import { computePublicStats } from "@/lib/compliance/public-stats";

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
//
// T72: the compliance rate now follows the D1 rule (AWAITING_REVIEW in the
// denominator) via tallyStatuses() + computeRateFromCounts(). The response
// shape is unchanged — same 4 fields, same names and types.
// =============================================================================

export async function GET() {
  const stats = await computePublicStats();
  return NextResponse.json(stats);
}
