import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import { toCSV, csvResponse } from "@/lib/csv";

// GET /api/export/stats — summary stats + needs attention as CSV
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const data = await fetchMatrixData();
  if (user.role === "OFFICER" && user.assignedUnionId) {
    data.unions = data.unions.filter((u) => u.id === user.assignedUnionId);
  }
  const matrix = buildComplianceMatrix(data);

  let compliant = 0, expiring = 0, overdue = 0, missing = 0, notApplicable = 0;
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
  const applicable = compliant + expiring + overdue + missing;
  const rate = applicable === 0 ? 0 : Math.round((compliant / applicable) * 100);

  // Summary section
  const summaryRows = [
    { Metric: "Total Unions", Value: matrix.unions.length },
    { Metric: "Document Types", Value: matrix.documentTypes.length },
    { Metric: "Total Cells", Value: matrix.unions.length * matrix.documentTypes.length },
    { Metric: "Compliant", Value: compliant },
    { Metric: "Expiring", Value: expiring },
    { Metric: "Overdue", Value: overdue },
    { Metric: "Missing", Value: missing },
    { Metric: "Not Applicable", Value: notApplicable },
    { Metric: "Applicable Cells", Value: applicable },
    { Metric: "Compliance Rate (%)", Value: rate },
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
