import { NextResponse } from "next/server";
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
// IMPLEMENTATION:
// The actual matrix-building logic lives in src/lib/compliance/matrix.ts
// (shared with the preview endpoint — Step 3). This route is now a thin
// wrapper that fetches data and delegates to buildComplianceMatrix.
//
// OFFICER SCOPING (TODO):
// Per the business context, Officers see ONLY their assigned union's row.
// This should be enforced server-side by filtering the unions query:
//   where: user.role === "OFFICER" ? { id: user.assignedUnionId } : {}
// For now, the mock getAuthUser doesn't enforce scoping — flagging this
// as a TODO. When the real auth-guard ships (Session 1 Step 5), wrap
// this with `requireUser()` and apply the filter.
// =============================================================================

export async function GET() {
  const data = await fetchMatrixData();
  const matrix = buildComplianceMatrix(data);
  return NextResponse.json(matrix);
}
