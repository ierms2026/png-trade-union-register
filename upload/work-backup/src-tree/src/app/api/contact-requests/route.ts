import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, ContactUpdateStatus } from "@prisma/client";

// =============================================================================
// GET /api/contact-requests
// -----------------------------------------------------------------------------
// Chunk 5: List contact-update requests for the Registrar's review queue.
// REGISTRAR-only.
//
// QUERY PARAMS:
//   ?status=PENDING|APPROVED|REJECTED  (default: PENDING)
//
// RESPONSE SHAPE:
//   {
//     requests: Array<{
//       id, status, address, contactPerson, contactEmail, contactPhone,
//       createdAt, reviewedAt, rejectionReason,
//       union: { id, unionName, registrationNo, status,
//                address, contactPerson, contactEmail, contactPhone },
//       requestedBy: { id, email }
//       reviewedBy: { id, email } | null
//     }>
//   }
//
// SORT: createdAt DESC (newest first) — same as /api/reviews.
// =============================================================================

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can review contact-update requests." },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") || "PENDING";

  // Validate status param — only allow the 3 enum values (or "ALL").
  const validStatuses = ["PENDING", "APPROVED", "REJECTED", "ALL"];
  if (!validStatuses.includes(statusParam)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}.` },
      { status: 400 },
    );
  }

  // Cast to the enum — we validated above that it's one of the 3 values.
  // "ALL" means no status filter.
  const where =
    statusParam === "ALL"
      ? {}
      : { status: statusParam as ContactUpdateStatus };

  const requests = await db.contactUpdateRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200, // safety cap
    include: {
      union: {
        select: {
          id: true,
          unionName: true,
          registrationNo: true,
          status: true,
          address: true,
          contactPerson: true,
          contactEmail: true,
          contactPhone: true,
        },
      },
      requestedBy: { select: { id: true, email: true } },
      reviewedBy: { select: { id: true, email: true } },
    },
  });

  return NextResponse.json({ requests });
}
