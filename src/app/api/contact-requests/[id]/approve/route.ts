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
// POST /api/contact-requests/[id]/approve
// -----------------------------------------------------------------------------
// Chunk 5: Registrar approves a contact-update request. The four fields
// (only non-null ones) are applied to the Union row, the request is marked
// APPROVED, and the rep is notified.
//
// RACE SAFETY: uses updateMany with `where: { id, status: "PENDING" }` —
// if the request was already actioned, the count is 0 and we return 409.
// Same pattern as /api/reviews/[documentId]/approve.
//
// ATOMICITY: the Union update + ContactUpdateRequest update happen in a
// single transaction — either both succeed or both roll back. No partial
// state.
// =============================================================================

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
      { error: "Only Registrars can approve contact-update requests." },
      { status: 403 },
    );
  }

  // --- 1. Load the request (must be PENDING) ------------------------------
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

  // --- 2. Build the update payload (only non-null fields) -----------------
  const unionUpdate: Record<string, string> = {};
  if (request.address !== null) unionUpdate.address = request.address;
  if (request.contactPerson !== null) unionUpdate.contactPerson = request.contactPerson;
  if (request.contactEmail !== null) unionUpdate.contactEmail = request.contactEmail;
  if (request.contactPhone !== null) unionUpdate.contactPhone = request.contactPhone;

  // --- 3. Transaction: apply Union update + mark request APPROVED ---------
  // Race-safe: updateMany with `where: { id, status: "PENDING" }` so if
  // another Registrar acted on it concurrently, count === 0 → 409.
  try {
    const result = await db.$transaction(async (tx) => {
      // Apply the contact-info changes to the Union row (only if there
      // are any non-null fields).
      if (Object.keys(unionUpdate).length > 0) {
        await tx.union.update({
          where: { id: request.unionId },
          data: unionUpdate,
        });
      }
      // Mark the request APPROVED. Race-safe: only updates if still PENDING.
      const updateResult = await tx.contactUpdateRequest.updateMany({
        where: { id, status: ContactUpdateStatus.PENDING },
        data: {
          status: ContactUpdateStatus.APPROVED,
          reviewedById: user.id,
          reviewedAt: new Date(),
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
          title: `Contact-info update approved`,
          body: `Your contact-info update for ${request.union.unionName} was approved by the Registrar. The changes are now live.`,
          dedupKey: `contact-update-approved:${request.id}`,
          linkUrl: `/portal?view=contact`,
        });
      }
      await db.auditLog.create({
        data: {
          actorId: user.id,
          actorName: user.email,
          action: "contact_update_request_approved",
          entityType: "ContactUpdateRequest",
          entityId: request.id,
          beforeJson: JSON.stringify({
            unionId: request.unionId,
            unionName: request.union.unionName,
            status: "PENDING",
          }),
          afterJson: JSON.stringify({
            status: "APPROVED",
            appliedFields: Object.keys(unionUpdate),
            reviewedById: user.id,
          }),
          severity: Severity.INFO,
        },
      });
    } catch (sideEffectErr) {
      console.error("[contact-requests/approve] Side-effect failed:", sideEffectErr);
    }

    return NextResponse.json({
      approved: true,
      requestId: id,
      appliedFields: Object.keys(unionUpdate),
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("RACE:")) {
      return NextResponse.json(
        { error: "This request was actioned concurrently. Reload and try again." },
        { status: 409 },
      );
    }
    console.error("[contact-requests/approve] Transaction failed:", err);
    return NextResponse.json(
      { error: "Failed to approve request." },
      { status: 500 },
    );
  }
}
