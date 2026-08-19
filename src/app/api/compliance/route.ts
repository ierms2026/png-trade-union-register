import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";

// =============================================================================
// GET /api/compliance
// -----------------------------------------------------------------------------
// Returns the live compliance matrix: every union × every document type.
//
// CORE MANDATE OF SESSION 3: "Compute live, never store."
// No status is read from the DB — every cell's status is computed on the
// fly via calculateStatus (Step 1). If a Registrar edits a rule, the next
// call to this endpoint returns the updated matrix immediately. No cache
// invalidation, no drift, no migration.
//
// OFFICER SCOPING:
// Officers see ONLY their assigned union's row. We enforce this by
// filtering the `data.unions` array post-fetch (fetchMatrixData loads
// all unions; we trim the array before buildComplianceMatrix iterates
// over it).
//
// AUTH:
// Any authenticated role can view the matrix. Officers get a scoped view;
// Registrars + Inspectors see the full matrix.
// =============================================================================

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const data = await fetchMatrixData();

  // Officer scoping: filter the unions array to just their assigned union.
  // (We could also pass a where clause to fetchMatrixData, but filtering
  // post-fetch is simpler and the dataset is small — 6 demo unions.)
  if (user.role === "OFFICER" && user.assignedUnionId) {
    data.unions = data.unions.filter((u) => u.id === user.assignedUnionId);
  }

  const matrix = buildComplianceMatrix(data);
  return NextResponse.json(matrix);
}
