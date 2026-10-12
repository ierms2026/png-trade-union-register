import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import { tallyStatuses, computeRateFromCounts } from "@/lib/dashboard/metrics";
import { toCSV, csvResponse } from "@/lib/csv";
import { getUnionScope } from "@/lib/auth/union-scope";

// GET /api/export/stats — summary stats + needs attention as CSV
export async function GET(req: NextRequest) {
  const user = await getAuthUserOrApiKey(req);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!hasScope(user, "compliance:read")) return new Response("Forbidden: requires compliance:read scope", { status: 403 });

  const data = await fetchMatrixData();
  const scope = getUnionScope({ role: user.role, assignedUnionId: user.assignedUnionId });
  if (scope.kind === "none") {
    return new Response("Forbidden: your account is not assigned to a union.", { status: 403 });
  }
  if (scope.kind === "union") {
    data.unions = data.unions.filter((u) => u.id === scope.unionId);
  }
  const matrix = buildComplianceMatrix(data);

  const allCells = matrix.unions.flatMap((row) => row.scores);
  const counts = tallyStatuses(allCells);
  const rate = computeRateFromCounts(counts);

  // Summary section
  const summaryRows = [
    { Metric: "Total Unions", Value: matrix.unions.length },
    { Metric: "Document Types", Value: matrix.documentTypes.length },
    { Metric: "Total Cells", Value: matrix.unions.length * matrix.documentTypes.length },
    { Metric: "Compliant", Value: counts.COMPLIANT },
    { Metric: "Expiring", Value: counts.EXPIRING },
    { Metric: "Overdue", Value: counts.OVERDUE },
    { Metric: "Awaiting Review", Value: counts.AWAITING_REVIEW },
    { Metric: "Missing", Value: counts.MISSING },
    { Metric: "Not Applicable", Value: counts.NOT_APPLICABLE },
    { Metric: "Applicable Cells", Value: rate.denominator },
    { Metric: "Compliance Rate (%)", Value: rate.percentage },
  ];

  // Needs attention section
  const needsAttentionRows = matrix.unions.flatMap((row) =>
    row.scores
      .filter((c) => c.status === "OVERDUE" || c.status === "EXPIRING")
      .filter((c) => c.expiresAt !== null)
      .map((c) => ({
        Union: row.unionName,
        DocumentType: c.documentType,
        Status: c.status,
        ExpiryDate: c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("en-US") : "",
      }))
  );

  // Combine: summary first, then a blank row, then needs attention
  const csv = toCSV(summaryRows) + "\r\n" + toCSV(needsAttentionRows);
  return csvResponse(csv, `compliance-summary-${new Date().toISOString().split("T")[0]}.csv`);
}
