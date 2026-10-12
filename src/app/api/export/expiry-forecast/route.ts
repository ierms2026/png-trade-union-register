import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import { getExpiryForecast, type ComplianceCell } from "@/lib/dashboard/metrics";
import { toCsv, CSV_HEADERS } from "@/lib/csv";
import { getUnionScope } from "@/lib/auth/union-scope";

// =============================================================================
// GET /api/export/expiry-forecast — CSV export of all expiring + overdue docs
// REGISTRAR/INSPECTOR: all unions. OFFICER: their union only.
// Chunk 9: now accepts API keys with `compliance:read` scope.
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUserOrApiKey(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasScope(user, "compliance:read")) {
    return NextResponse.json(
      { error: "Your API key does not have the 'compliance:read' scope." },
      { status: 403 },
    );
  }

  const data = await fetchMatrixData();
  const scope = getUnionScope({ role: user.role, assignedUnionId: user.assignedUnionId });
  if (scope.kind === "none") {
    return new Response("Forbidden: your account is not assigned to a union.", { status: 403 });
  }
  if (scope.kind === "union") {
    data.unions = data.unions.filter((u) => u.id === scope.unionId);
  }
  const matrix = buildComplianceMatrix(data);
  const now = new Date();

  // Build a flat list of all actionable cells (overdue + expiring)
  const renewalByType = new Map(data.rules.map((r) => [r.documentType, r.renewalYears]));
  const msPerDay = 24 * 60 * 60 * 1000;
  const rows: Record<string, unknown>[] = [];

  for (const row of matrix.unions) {
    for (const cell of row.scores) {
      if (!cell.expiresAt) continue;
      const renewalYears = renewalByType.get(cell.documentType) ?? 1;
      if (renewalYears >= 99) continue;

      const expiryMs = new Date(cell.expiresAt).getTime();
      const daysUntil = Math.floor((expiryMs - now.getTime()) / msPerDay);

      // Only include actionable items (overdue or within 90 days)
      if (daysUntil > 90) continue;

      let urgencyBucket: string;
      if (daysUntil < 0) urgencyBucket = "Overdue";
      else if (daysUntil <= 30) urgencyBucket = "Expiring ≤30 days";
      else if (daysUntil <= 60) urgencyBucket = "Expiring 31–60 days";
      else urgencyBucket = "Expiring 61–90 days";

      rows.push({
        "Union Name": row.unionName,
        "Document Type": cell.documentType,
        "Status": cell.status,
        "Expiry Date": new Date(cell.expiresAt).toISOString().split("T")[0],
        "Days Until Expiry": daysUntil,
        "Urgency": urgencyBucket,
        "Renewal Cycle": `${renewalYears} years`,
      });
    }
  }

  // Sort: overdue first, then by days until expiry ascending
  rows.sort((a, b) => Number(a["Days Until Expiry"]) - Number(b["Days Until Expiry"]));

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      ...CSV_HEADERS,
      "Content-Disposition": `attachment; filename="expiry-forecast-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
