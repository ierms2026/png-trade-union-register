import { NextRequest } from "next/server";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import { toCSV, csvResponse } from "@/lib/csv";

// GET /api/export/compliance — full compliance matrix as CSV
export async function GET(req: NextRequest) {
  const user = await getAuthUserOrApiKey(req);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!hasScope(user, "compliance:read")) return new Response("Forbidden", { status: 403 });

  const data = await fetchMatrixData();
  if (user.role === "OFFICER" && user.assignedUnionId) {
    data.unions = data.unions.filter((u) => u.id === user.assignedUnionId);
  }
  const matrix = buildComplianceMatrix(data);

  // Flatten the matrix into one row per (union, documentType) cell
  const rows = matrix.unions.flatMap((row) =>
    row.scores.map((cell) => ({
      Union: row.unionName,
      UnionStatus: row.status,
      DocumentType: cell.documentType,
      Status: cell.status,
      DocumentId: cell.documentId ?? "",
      ExpiresAt: cell.expiresAt ?? "",
      OverallScore: row.overallScore ?? "",
    }))
  );

  return csvResponse(toCSV(rows), `compliance-matrix-${new Date().toISOString().split("T")[0]}.csv`);
}
