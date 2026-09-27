import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";

// =============================================================================
// GET /api/portal/compliance
// -----------------------------------------------------------------------------
// Chunk 5: Returns the compliance matrix scoped to the rep's assigned union.
// Same logic as /api/compliance but REPRESENTATIVE-only + always scoped.
//
// The matrix returned has exactly 1 row (the rep's union). The rep's
// ComplianceView component uses this to render the single-row matrix.
// =============================================================================

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "REPRESENTATIVE") {
    return NextResponse.json(
      { error: "This endpoint is for union representatives only." },
      { status: 403 },
    );
  }
  if (!user.assignedUnionId) {
    return NextResponse.json(
      { error: "No assigned union. Contact the Registrar." },
      { status: 400 },
    );
  }

  const data = await fetchMatrixData();
  // Always scope to the rep's union — they only see their own row.
  data.unions = data.unions.filter((u) => u.id === user.assignedUnionId);
  const matrix = buildComplianceMatrix(data);
  return NextResponse.json(matrix);
}
