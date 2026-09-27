import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { getComplianceTrend } from "@/lib/dashboard/snapshot";
import { toCSV, csvResponse } from "@/lib/csv";

// GET /api/export/trend — compliance trend history as CSV
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const trend = await getComplianceTrend(new Date());

  const rows = trend.map((p) => ({
    Date: p.date,
    Compliant: p.compliant,
    Expiring: p.expiring,
    Overdue: p.overdue,
    Missing: p.missing,
    RateNumerator: p.rateNumerator,
    RateDenominator: p.rateDenominator,
    Percentage: p.percentage ?? "",
  }));

  return csvResponse(toCSV(rows), `compliance-trend-${new Date().toISOString().split("T")[0]}.csv`);
}
