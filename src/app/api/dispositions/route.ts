import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";

// =============================================================================
// GET /api/dispositions
// Lists disposition requests. REGISTRAR only.
//
// Query params:
//   - status: SCHEDULED | CANCELLED | EXECUTED | BLOCKED (optional filter)
//
// Returns all disposition requests with document + union metadata.
// Used by the disposition queue UI (future) to show pending/executed/cancelled
// requests.
// =============================================================================

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json({ error: "Only Registrars can view disposition requests." }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");

  const where = statusFilter ? { status: statusFilter as any } : {};

  const requests = await db.dispositionRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      documentId: true,
      status: true,
      requestedAt: true,
      cooldownEndsAt: true,
      executedAt: true,
      cancelledAt: true,
      cancelReason: true,
      requestedBy: { select: { email: true } },
      document: {
        select: {
          documentType: true,
          unionId: true,
          union: { select: { unionName: true, registrationNo: true } },
        },
      },
    },
  });

  const serialized = requests.map((r) => ({
    id: r.id,
    documentId: r.documentId,
    documentType: r.document.documentType,
    unionName: r.document.union.unionName,
    registrationNo: r.document.union.registrationNo,
    status: r.status,
    requestedBy: r.requestedBy.email,
    requestedAt: r.requestedAt.toISOString(),
    cooldownEndsAt: r.cooldownEndsAt.toISOString(),
    executedAt: r.executedAt?.toISOString() ?? null,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    cancelReason: r.cancelReason,
  }));

  return NextResponse.json({ requests: serialized });
}
