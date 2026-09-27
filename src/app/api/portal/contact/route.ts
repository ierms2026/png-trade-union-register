import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";

// =============================================================================
// GET /api/portal/contact
// -----------------------------------------------------------------------------
// Chunk 5: Returns the rep's union current contact info + their pending
// contact-update requests (so the rep can see "you have a request awaiting
// review" in the Contact Info view).
//
// RESPONSE SHAPE:
//   {
//     current: {
//       address, contactPerson, contactEmail, contactPhone,
//       unionName, registrationNo, status
//     },
//     pendingRequests: Array<{
//       id, address, contactPerson, contactEmail, contactPhone,
//       status, createdAt, reviewedAt, rejectionReason
//     }>
//   }
//
// `pendingRequests` includes ALL the rep's union's requests, not just
// PENDING — the rep can see the history (including REJECTED with reason).
// Only this rep's union's requests are visible (the route filters by
// unionId = user.assignedUnionId).
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

  const [union, requests] = await Promise.all([
    db.union.findUnique({
      where: { id: user.assignedUnionId },
      select: {
        unionName: true,
        registrationNo: true,
        status: true,
        address: true,
        contactPerson: true,
        contactEmail: true,
        contactPhone: true,
      },
    }),
    db.contactUpdateRequest.findMany({
      where: { unionId: user.assignedUnionId },
      orderBy: { createdAt: "desc" },
      take: 20, // last 20 requests — enough history without unbounded growth
      select: {
        id: true,
        address: true,
        contactPerson: true,
        contactEmail: true,
        contactPhone: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        rejectionReason: true,
      },
    }),
  ]);

  if (!union) {
    return NextResponse.json(
      { error: "Assigned union not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    current: union,
    pendingRequests: requests,
  });
}
