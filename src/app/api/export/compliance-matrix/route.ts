import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/prisma";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import { toCsv, CSV_HEADERS } from "@/lib/csv";

// =============================================================================
// GET /api/export/compliance-matrix — CSV export of the full compliance matrix
// REGISTRAR/INSPECTOR: all unions. OFFICER: their union only.
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUserOrApiKey(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasScope(user, "compliance:read")) return NextResponse.json({ error: "Your API key does not have the 'compliance:read' scope." }, { status: 403 });

  const data = await fetchMatrixData();
  if (user.role === Role.OFFICER && user.assignedUnionId) {
    data.unions = data.unions.filter((u) => u.id === user.assignedUnionId);
  }
  const matrix = buildComplianceMatrix(data);

  // Flatten the matrix: one row per (union × document type) cell
  const rows = matrix.unions.flatMap((row) =>
    row.scores.map((cell) => ({
      "Union Name": row.unionName,
      "Document Type": cell.documentType,
      "Status": cell.status,
      "Document ID": cell.documentId || "",
      "Expiry Date": cell.expiresAt ? new Date(cell.expiresAt).toISOString().split("T")[0] : "",
      "Union Score": row.overallScore ?? "",
    })),
  );

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      ...CSV_HEADERS,
      "Content-Disposition": `attachment; filename="compliance-matrix-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
