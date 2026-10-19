import { NextRequest, NextResponse } from "next/server";
import { staffLinkUrl } from "@/lib/dashboard/vocabulary";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity, ReviewStatus, NotificationType } from "@prisma/client";
import { createNotification, createNotificationForUsers, getUserNotificationPrefs } from "@/lib/notifications";

// =============================================================================
// POST /api/reviews/[documentId]/approve
// Approves a pending document — Wave 3 / Item 1: TWO-PERSON APPROVAL WORKFLOW.
//
// State machine:
//   1. reviewStatus = PENDING, firstApprovedAt = null:
//      → FIRST APPROVAL. Set firstApprovedAt = now, firstApprovedById = caller.
//        Document STAYS in reviewStatus = PENDING. Notify all OTHER Registrars
//        asking them to second. Return 200 with `stage: "first_approval"`.
//
//   2. reviewStatus = PENDING, firstApprovedAt != null, firstApprovedById !== caller:
//      → SECOND APPROVAL. Set reviewStatus = APPROVED, reviewedAt = now,
//        reviewedById = caller. Clear is not needed for firstApproved* fields
//        (they remain as an audit trail of who gave first approval). Notify
//        the uploading Officer. Return 200 with `stage: "second_approval"`.
//
//   3. reviewStatus = PENDING, firstApprovedAt != null, firstApprovedById === caller:
//      → REJECT. Same person cannot second their own approval. Return 400
//        with a clear error message.
//
//   4. reviewStatus = APPROVED or REJECTED:
//      → 409 (race condition or stale UI). Same behavior as before.
//
// RACE SAFETY: each branch uses updateMany with the specific where-clause
// for its expected state. If two Registrars POST concurrently, only one
// transition succeeds; the other gets count=0 and a 409.
//
// AUTH: REGISTRAR only. AUDIT: INFO for both stages. NOTIFIES:
//   - First approval: all OTHER Registrars (not the caller).
//   - Second approval: the uploading Officer (existing behavior).
// =============================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;

  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json({ error: "Only Registrars can approve documents." }, { status: 403 });
  }

  const existing = await db.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      documentType: true,
      unionId: true,
      reviewStatus: true,
      rejectionReason: true,
      firstApprovedById: true,
      firstApprovedAt: true,
      union: { select: { unionName: true, registrationNo: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { versionNumber: true, uploadedById: true },
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  // Reject if no longer pending (race condition or stale UI).
  if (existing.reviewStatus !== "PENDING") {
    return NextResponse.json(
      { error: "This document is no longer pending review. Please refresh the review queue." },
      { status: 409 },
    );
  }

  const now = new Date();
  const hasFirstApproval = existing.firstApprovedAt !== null && existing.firstApprovedById !== null;

  // --- Branch 3: same person trying to second their own approval -----------
  if (hasFirstApproval && existing.firstApprovedById === user.id) {
    return NextResponse.json(
      {
        error:
          "You gave the first approval for this document. A different Registrar must give the second approval (two-person rule).",
      },
      { status: 400 },
    );
  }

  // --- Branch 1: FIRST APPROVAL --------------------------------------------
  // firstApprovedAt is null + caller is Registrar → record first approval.
  // Document stays in reviewStatus = PENDING. Notify other Registrars.
  if (!hasFirstApproval) {
    // Race-safe: only updates if firstApprovedAt is still null.
    const result = await db.document.updateMany({
      where: {
        id: documentId,
        reviewStatus: "PENDING",
        firstApprovedAt: null,
      },
      data: {
        firstApprovedById: user.id,
        firstApprovedAt: now,
      },
    });

    if (result.count === 0) {
      // Another Registrar beat us to the first approval (or the document
      // changed state). Tell the caller to refresh.
      return NextResponse.json(
        { error: "This document's state has changed. Please refresh the review queue." },
        { status: 409 },
      );
    }

    await db.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.email,
        action: "document_review_first_approve",
        entityType: "Document",
        entityId: documentId,
        beforeJson: JSON.stringify({
          documentType: existing.documentType,
          unionId: existing.unionId,
          unionName: existing.union.unionName,
          registrationNo: existing.union.registrationNo,
          reviewStatus: existing.reviewStatus,
          firstApprovedAt: null,
        }),
        afterJson: JSON.stringify({
          documentType: existing.documentType,
          unionId: existing.unionId,
          unionName: existing.union.unionName,
          registrationNo: existing.union.registrationNo,
          reviewStatus: "PENDING",
          firstApprovedAt: now.toISOString(),
          firstApprovedById: user.id,
          firstApprovedByEmail: user.email,
        }),
        severity: Severity.INFO,
      },
    });

    // Notify all OTHER Registrars (excluding the caller) — ask them to second.
    // Best-effort: failures don't fail the request.
    try {
      const otherRegistrars = await db.user.findMany({
        where: {
          role: Role.REGISTRAR,
          disabled: false,
          id: { not: user.id },
        },
        select: { id: true },
      });
      if (otherRegistrars.length > 0) {
        await createNotificationForUsers(
          otherRegistrars.map((r) => r.id),
          {
            type: NotificationType.TASK,
            title: `Second approval needed: ${existing.union.unionName} — ${existing.documentType}`,
            body:
              `${user.email} gave first approval to "${existing.documentType}" ` +
              `for ${existing.union.unionName} (${existing.union.registrationNo}). ` +
              `A different Registrar needs to confirm to finalize the approval.`,
            dedupKey: `review:first-approval:${documentId}`,
            linkUrl: staffLinkUrl("reviews"),
          },
        );
      }
    } catch {
      // Notification failure is non-fatal. The audit log already recorded
      // the first approval — the workflow state is correct even if the
      // notification didn't go out.
    }

    return NextResponse.json({
      success: true,
      stage: "first_approval",
      documentId,
      reviewStatus: "PENDING",
      firstApprovedAt: now.toISOString(),
      firstApprovedById: user.id,
      message: "First approval recorded. Another Registrar needs to confirm to finalize.",
    });
  }

  // --- Branch 2: SECOND APPROVAL -------------------------------------------
  // firstApprovedAt is set + caller is a DIFFERENT Registrar → finalize.
  // Set reviewStatus = APPROVED, reviewedAt = now, reviewedById = caller.
  // Keep firstApprovedAt + firstApprovedById (audit trail).
  const result = await db.document.updateMany({
    where: {
      id: documentId,
      reviewStatus: "PENDING",
      firstApprovedAt: { not: null },
      // Race-safe: ensure the first approver is NOT the caller. The check
      // above already verified this, but updateMany with this where-clause
      // makes it atomic in case of concurrent requests.
      firstApprovedById: { not: user.id },
    },
    data: {
      reviewStatus: ReviewStatus.APPROVED,
      reviewedById: user.id,
      reviewedAt: now,
      rejectionReason: null,
    },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "This document's state has changed. Please refresh the review queue." },
      { status: 409 },
    );
  }

  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "document_review_approve",
      entityType: "Document",
      entityId: documentId,
      beforeJson: JSON.stringify({
        documentType: existing.documentType,
        unionId: existing.unionId,
        unionName: existing.union.unionName,
        registrationNo: existing.union.registrationNo,
        reviewStatus: existing.reviewStatus,
        firstApprovedAt: existing.firstApprovedAt?.toISOString() ?? null,
        firstApprovedById: existing.firstApprovedById,
      }),
      afterJson: JSON.stringify({
        documentType: existing.documentType,
        unionId: existing.unionId,
        unionName: existing.union.unionName,
        registrationNo: existing.union.registrationNo,
        reviewStatus: "APPROVED",
        reviewedAt: now.toISOString(),
        reviewedById: user.id,
        firstApprovedAt: existing.firstApprovedAt?.toISOString() ?? null,
        firstApprovedById: existing.firstApprovedById,
      }),
      severity: Severity.INFO,
    },
  });

  // Notify the uploading Officer (best-effort) — existing behavior preserved.
  const latest = existing.versions[0];
  if (latest?.uploadedById) {
    const prefs = await getUserNotificationPrefs(latest.uploadedById);
    if (prefs) {
      await createNotification({
        userId: latest.uploadedById,
        userEmail: prefs.email,
        emailNotificationsEnabled: prefs.emailNotificationsEnabled,
        phone: prefs.phone,
        smsNotificationsEnabled: prefs.smsNotificationsEnabled,
        whatsappNotificationsEnabled: prefs.whatsappNotificationsEnabled,
        type: NotificationType.TASK,
        title: `${existing.union.unionName}: ${existing.documentType} approved`,
        body:
          `Version ${latest.versionNumber} of "${existing.documentType}" ` +
          `for ${existing.union.unionName} has been approved by the Registrar. ` +
          `It now counts toward your union's compliance score.`,
        dedupKey: `review:approved:${documentId}:${latest.versionNumber}:${latest.uploadedById}`,
        linkUrl: staffLinkUrl("unions"),
      });
    }
  }

  return NextResponse.json({
    success: true,
    stage: "second_approval",
    documentId,
    reviewStatus: "APPROVED",
    reviewedAt: now.toISOString(),
    message: "Document approved. It now counts toward the union's compliance score.",
  });
}
