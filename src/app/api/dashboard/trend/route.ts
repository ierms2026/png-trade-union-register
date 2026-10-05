import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { getComplianceTrend, type ComplianceTrendPoint } from "@/lib/dashboard/snapshot";

// =============================================================================
// GET /api/dashboard/trend
// -----------------------------------------------------------------------------
// Chunk 4.2b: Returns the historical compliance trend as an ascending array
// of daily snapshot points. Powers the Compliance Trend chart and the KPI
// sparklines on the Dashboard.
//
// AUTH: Any authenticated user (REGISTRAR / OFFICER / INSPECTOR). Officer
// scoping is NOT applied here — snapshots are global aggregate counts
// (the per-union breakdown is a 4.2a out-of-scope TODO). When per-union
// snapshots are added, this endpoint will need an `officer` scope that
// filters by unionId — see the 4.2a handoff "Out-of-scope TODOs" #1.
//
// RESPONSE SHAPE:
//   {
//     points: ComplianceTrendPoint[]  // ascending by date, gaps preserved
//   }
//
// Each point:
//   {
//     date: "YYYY-MM-DD" (UTC),
//     compliant: number,
//     expiring: number,
//     overdue: number,
//     awaitingReview: number,
//     missing: number,
//     rateNumerator: number,
//     rateDenominator: number,
//     percentage: number | null  // 0-100, or null for zero-denominator days
//   }
//
// EMPTY STATE: when no snapshots exist (fresh deployment, before the first
// cron run), returns { points: [] }. The caller's `hasSufficientHistory`
// check handles the placeholder rendering — this endpoint never fabricates
// data.
//
// NO INTERPOLATION: missing days are simply absent from the array. The
// caller's chart renderer inserts explicit gap markers between stored
// points (see `buildChartSeriesWithGaps` in snapshot.ts).
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const points: ComplianceTrendPoint[] = await getComplianceTrend(new Date());

  return NextResponse.json({ points });
}
