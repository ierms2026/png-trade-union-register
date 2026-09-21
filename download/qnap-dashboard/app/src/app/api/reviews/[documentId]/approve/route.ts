import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity, ReviewStatus, NotificationType } from "@prisma/client";

// =============================================================================
// POST /api/reviews/[documentId]/approve
// Approves a pending document. Race-safe via updateMany with
// where: { id, reviewStatus: "PENDING" }. Returns 409 if no longer pending.
// AUTH: REGISTRAR only. AUDIT: INFO. NOTIFIES the uploading Officer.
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
      reviewStatus: ReviewStatus.APPROVED,
      reviewedById: user.id,
      reviewedAt: now,
      rejectionReason: null,
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
      action: "document_review_approve",
      entityType: "Document",
      entityId: documentId,
      beforeJson: JSON.stringify({
        documentType: existing.documentType,
        unionId: existing.unionId,
        unionName: existing.union.unionName,
        registrationNo: existing.union.registrationNo,
        reviewStatus: existing.reviewStatus,
      }),
      afterJson: JSON.stringify({
        documentType: existing.documentType,
        unionId: existing.unionId,
        unionName: existing.union.unionName,
        registrationNo: existing.union.registrationNo,
        reviewStatus: "APPROVED",
        reviewedAt: now.toISOString(),
      }),
      severity: Severity.INFO,
    },
  });

  // Notify the uploading Officer (best-effort)
  const latest = existing.versions[0];
  if (latest?.uploadedById) {
    try {
      await db.notification.create({
        data: {
          userId: latest.uploadedById,
          type: NotificationType.TASK,
          title: `${existing.union.unionName}: ${existing.documentType} approved`,
          body:
            `Version ${latest.versionNumber} of "${existing.documentType}" ` +
            `for ${existing.union.unionName} has been approved by the Registrar. ` +
            `It now counts toward your union's compliance score.`,
          dedupKey: `review:approved:${documentId}:${latest.versionNumber}:${latest.uploadedById}`,
          linkUrl: `/unions`,
        },
      });
    } catch {
      // Dedup collision or DB error — silently skip.
    }
  }

  return NextResponse.json({
    success: true,
    documentId,
    reviewStatus: "APPROVED",
    reviewedAt: now.toISOString(),
  });
}
