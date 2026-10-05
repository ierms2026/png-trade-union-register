import { NextRequest } from "next/server";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { getComplianceTrend } from "@/lib/dashboard/snapshot";
import { toCSV, csvResponse } from "@/lib/csv";

// GET /api/export/trend — compliance trend history as CSV
export async function GET(req: NextRequest) {
  const user = await getAuthUserOrApiKey(req);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!hasScope(user, "compliance:read")) return new Response("Forbidden: requires compliance:read scope", { status: 403 });

  const trend = await getComplianceTrend(new Date());

  const rows = trend.map((p) => ({
    Date: p.date,
    Compliant: p.compliant,
    Expiring: p.expiring,
    Overdue: p.overdue,
    AwaitingReview: p.awaitingReview,
    Missing: p.missing,
    RateNumerator: p.rateNumerator,
    RateDenominator: p.rateDenominator,
    Percentage: p.percentage ?? "",
  }));

  return csvResponse(toCSV(rows), `compliance-trend-${new Date().toISOString().split("T")[0]}.csv`);
}
