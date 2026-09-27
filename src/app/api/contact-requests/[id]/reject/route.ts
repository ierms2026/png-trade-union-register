import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import {
  Role,
  Severity,
  NotificationType,
  ContactUpdateStatus,
} from "@prisma/client";
import { createNotificationForUsers } from "@/lib/notifications";

// =============================================================================
// POST /api/contact-requests/[id]/reject
// -----------------------------------------------------------------------------
// Chunk 5: Registrar rejects a contact-update request with a reason. The
// request is marked REJECTED (no changes applied to the Union row), and the
// rep is notified with the reason.
//
// BODY:
//   { reason: string }  (required, non-empty, max 1000 chars)
//
// RACE SAFETY: same updateMany pattern as approve.
// =============================================================================

interface RejectBody {
  reason?: unknown;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can reject contact-update requests." },
      { status: 403 },
    );
  }

  // --- 1. Parse + validate body -------------------------------------------
  let body: RejectBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }
  const reason =
    typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length === 0) {
    return NextResponse.json(
      { error: "A rejection reason is required." },
      { status: 400 },
    );
  }
  if (reason.length > 1000) {
    return NextResponse.json(
      { error: "Rejection reason must be 1000 characters or fewer." },
      { status: 400 },
    );
  }

  // --- 2. Load the request (must be PENDING) ------------------------------
  const request = await db.contactUpdateRequest.findUnique({
    where: { id },
    include: {
      union: { select: { id: true, unionName: true } },
      requestedBy: { select: { id: true, email: true } },
    },
  });
  if (!request) {
    return NextResponse.json(
      { error: "Contact-update request not found." },
      { status: 404 },
    );
  }
  if (request.status !== ContactUpdateStatus.PENDING) {
    return NextResponse.json(
      {
        error: `This request was already ${request.status.toLowerCase()}.`,
        currentStatus: request.status,
      },
      { status: 409 },
    );
  }

  // --- 3. Mark REJECTED (race-safe) ---------------------------------------
  try {
    const result = await db.$transaction(async (tx) => {
      const updateResult = await tx.contactUpdateRequest.updateMany({
        where: { id, status: ContactUpdateStatus.PENDING },
        data: {
          status: ContactUpdateStatus.REJECTED,
          reviewedById: user.id,
          reviewedAt: new Date(),
          rejectionReason: reason,
        },
      });
      if (updateResult.count === 0) {
        throw new Error("RACE: request was actioned concurrently");
      }
      return updateResult;
    });

    // --- 4. Side effects: notify the rep + audit log ----------------------
    try {
      if (request.requestedBy) {
        await createNotificationForUsers([request.requestedBy.id], {
          type: NotificationType.TASK,
          title: `Contact-info update rejected`,
          body: `Your contact-info update for ${request.union.unionName} was rejected. Reason: ${reason}`,
          dedupKey: `contact-update-rejected:${request.id}`,
          linkUrl: `/portal?view=contact`,
        });
      }
      await db.auditLog.create({
        data: {
          actorId: user.id,
          actorName: user.email,
          action: "contact_update_request_rejected",
          entityType: "ContactUpdateRequest",
          entityId: request.id,
          beforeJson: JSON.stringify({
            unionId: request.unionId,
            unionName: request.union.unionName,
            status: "PENDING",
          }),
          afterJson: JSON.stringify({
            status: "REJECTED",
            rejectionReason: reason,
            reviewedById: user.id,
          }),
          severity: Severity.WARNING,
        },
      });
    } catch (sideEffectErr) {
      console.error("[contact-requests/reject] Side-effect failed:", sideEffectErr);
    }

    return NextResponse.json({
      rejected: true,
      requestId: id,
      reason,
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("RACE:")) {
      return NextResponse.json(
        { error: "This request was actioned concurrently. Reload and try again." },
        { status: 409 },
      );
    }
    console.error("[contact-requests/reject] Transaction failed:", err);
    return NextResponse.json(
      { error: "Failed to reject request." },
      { status: 500 },
    );
  }
}
