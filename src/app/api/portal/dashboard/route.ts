import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";

// =============================================================================
// GET /api/portal/dashboard
// -----------------------------------------------------------------------------
// Chunk 5: Headline metrics for the rep portal dashboard. Same logic as
// /api/dashboard/stats but scoped to the rep's assigned union + REPRESENTATIVE
// role check (reps cannot see registry-wide stats).
//
// RESPONSE SHAPE:
//   {
//     union: { id, unionName, registrationNo, status },
//     activeCount: number,           // non-disposed documents for this union
//     compliance: {
//       compliant, expiring, overdue, missing, notApplicable,
//       overallRate,                  // 0-100
//       rate: { numerator, denominator, percentage }
//     },
//     needsAttention: Array<{ documentType, status, expiryDate }>,
//     pendingUploads: number,         // documents with reviewStatus PENDING
//     pendingContactUpdates: number,  // ContactUpdateRequests in PENDING state
//   }
//
// The `pendingUploads` + `pendingContactUpdates` fields are rep-specific —
// they tell the rep "you have N items waiting for Registrar review".
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

  const unionId = user.assignedUnionId;

  // --- 1. Parallel: union info + active doc count + pending uploads + pending contact updates ---
  const [union, activeCount, pendingUploads, pendingContactUpdates] = await Promise.all([
    db.union.findUnique({
      where: { id: unionId },
      select: { id: true, unionName: true, registrationNo: true, status: true },
    }),
    db.document.count({
      where: { unionId, disposedAt: null },
    }),
    db.document.count({
      where: { unionId, reviewStatus: "PENDING" },
    }),
    db.contactUpdateRequest.count({
      where: { unionId, status: "PENDING" },
    }),
  ]);

  if (!union) {
    return NextResponse.json(
      { error: "Assigned union not found." },
      { status: 404 },
    );
  }

  // --- 2. Compliance matrix scoped to this union ---
  // Same pattern as /api/dashboard/stats Officer scoping: fetch all data,
  // filter to this union, then build the matrix.
  const data = await fetchMatrixData();
  data.unions = data.unions.filter((u) => u.id === unionId);
  const matrix = buildComplianceMatrix(data);

  let compliant = 0,
    expiring = 0,
    overdue = 0,
    missing = 0,
    notApplicable = 0;
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
  const overallRate = applicable === 0 ? 0 : Math.round((compliant / applicable) * 100);

  // --- 3. Needs-attention entries (overdue + expiring) for this union ---
  const needsAttention = matrix.unions.flatMap((row) =>
    row.scores
      .filter((cell) => cell.status === "OVERDUE" || cell.status === "EXPIRING")
      .filter((cell) => cell.expiresAt !== null)
      .map((cell) => ({
        documentType: cell.documentType,
        status: cell.status,
        expiryDate: cell.expiresAt,
      }))
  );
  needsAttention.sort((a, b) => {
    const aPriority = a.status === "OVERDUE" ? 0 : 1;
    const bPriority = b.status === "OVERDUE" ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    if (a.expiryDate && b.expiryDate) {
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    }
    return 0;
  });

  return NextResponse.json({
    union,
    activeCount,
    compliance: {
      compliant,
      expiring,
      overdue,
      missing,
      notApplicable,
      overallRate,
      rate: {
        numerator: compliant,
        denominator: applicable,
        percentage: overallRate,
      },
    },
    needsAttention,
    pendingUploads,
    pendingContactUpdates,
  });
}
