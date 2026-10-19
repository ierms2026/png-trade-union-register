import { NextRequest, NextResponse } from "next/server";
import { staffLinkUrl } from "@/lib/dashboard/vocabulary";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity, ReviewStatus, NotificationType } from "@prisma/client";
import { createNotification, getUserNotificationPrefs } from "@/lib/notifications";

// =============================================================================
// POST /api/reviews/[documentId]/reject
// Rejects a pending document with a required reason. Race-safe.
// AUTH: REGISTRAR only. AUDIT: WARNING. NOTIFIES the uploading Officer
// with the rejection reason so they know what to fix before re-uploading.
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
    return NextResponse.json({ error: "Only Registrars can reject documents." }, { status: 403 });
  }

  let body: { reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length === 0) {
    return NextResponse.json(
      { error: "A rejection reason is required. Please explain why the document is being rejected." },
      { status: 400 },
    );
  }
  if (reason.length > 1000) {
    return NextResponse.json({ error: "Rejection reason is too long (max 1000 characters)." }, { status: 400 });
  }

  const existing = await db.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      documentType: true,
      unionId: true,
      reviewStatus: true,
      rejectionReason: true,
      // Wave 3 / Item 1: capture first-approval state for the audit beforeJson.
      // Rejection clears these fields (cancels the pending two-person approval).
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

  const now = new Date();
  const result = await db.document.updateMany({
    where: { id: documentId, reviewStatus: "PENDING" },
    data: {
      reviewStatus: ReviewStatus.REJECTED,
      reviewedById: user.id,
      reviewedAt: now,
      rejectionReason: reason,
      // Wave 3 / Item 1: clear the pending first-approval (if any). Either
      // approver can reject — this cancels the two-person workflow.
      firstApprovedById: null,
      firstApprovedAt: null,
    },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "This document is no longer pending review. Please refresh the review queue." },
      { status: 409 },
    );
  }

  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "document_review_reject",
      entityType: "Document",
      entityId: documentId,
      beforeJson: JSON.stringify({
        documentType: existing.documentType,
        unionId: existing.unionId,
        unionName: existing.union.unionName,
        registrationNo: existing.union.registrationNo,
        reviewStatus: existing.reviewStatus,
        rejectionReason: existing.rejectionReason,
        firstApprovedAt: existing.firstApprovedAt?.toISOString() ?? null,
        firstApprovedById: existing.firstApprovedById,
      }),
      afterJson: JSON.stringify({
        documentType: existing.documentType,
        unionId: existing.unionId,
        unionName: existing.union.unionName,
        registrationNo: existing.union.registrationNo,
        reviewStatus: "REJECTED",
        reviewedAt: now.toISOString(),
        rejectionReason: reason,
        firstApprovedAt: null,
        firstApprovedById: null,
      }),
      severity: Severity.WARNING,
    },
  });

  // Notify the uploading Officer WITH the rejection reason
  const latest = existing.versions[0];
  if (latest?.uploadedById) {
    const prefs = await getUserNotificationPrefs(latest.uploadedById);
    if (prefs) {
      await createNotification({
        userId: latest.uploadedById,
        userEmail: prefs.email,
        emailNotificationsEnabled: prefs.emailNotificationsEnabled,
        type: NotificationType.TASK,
        title: `${existing.union.unionName}: ${existing.documentType} needs revision`,
        body:
          `Version ${latest.versionNumber} of "${existing.documentType}" ` +
          `for ${existing.union.unionName} was rejected by the Registrar. ` +
          `Reason: ${reason}`,
        dedupKey: `review:rejected:${documentId}:${latest.versionNumber}:${latest.uploadedById}`,
        linkUrl: staffLinkUrl("unions"),
      });
    }
  }

  return NextResponse.json({
    success: true,
    documentId,
    reviewStatus: "REJECTED",
    reviewedAt: now.toISOString(),
    rejectionReason: reason,
  });
}
