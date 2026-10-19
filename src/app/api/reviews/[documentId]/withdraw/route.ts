import { NextRequest, NextResponse } from "next/server";
import { staffLinkUrl } from "@/lib/dashboard/vocabulary";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";

// =============================================================================
// POST /api/reviews/[documentId]/withdraw
// -----------------------------------------------------------------------------
// Wave 3 / Item 1: Two-person approval workflow — the FIRST approver can
// WITHDRAW their first approval before a second Registrar confirms.
//
// Why this exists:
//   First approval is reversible. A Registrar might click "Approve" then
//   realize they didn't actually mean to (wrong document, misread the file,
//   realized the document is missing a page, etc.). Without a withdraw
//   action, they'd have to either (a) wait for a second Registrar to
//   finalize + then ask them to undo, or (b) reject the document entirely
//   (which notifies the uploading Officer unnecessarily + hurts the union's
//   compliance rate). Withdraw lets them silently cancel their own pending
//   first approval.
//
// CONSTRAINTS:
//   - Only the FIRST APPROVER (firstApprovedById === caller.id) can withdraw.
//     Other Registrars cannot withdraw someone else's first approval.
//   - Only works while reviewStatus === PENDING (i.e., before second approval).
//     After APPROVED, the action is final — use the existing edit/re-upload
//     workflow instead.
//   - Race-safe: updateMany with where: { firstApprovedById: user.id }
//     ensures only the original approver's row is updated.
//
// AUDIT: INFO severity. Withdraw is a benign action (no state change beyond
// clearing the first-approval fields). NOTIFIES: nobody (the workflow simply
// reverts to "no first approval yet" — other Registrars may have received a
// "second approval needed" notification, but that's now stale; we don't try
// to retract it).
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
    return NextResponse.json({ error: "Only Registrars can withdraw approvals." }, { status: 403 });
  }

  // Fetch current state for the audit beforeJson.
  const existing = await db.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      documentType: true,
      unionId: true,
      reviewStatus: true,
      firstApprovedById: true,
      firstApprovedAt: true,
      union: { select: { unionName: true, registrationNo: true } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  // Guard: only the first approver can withdraw their own approval.
  if (existing.firstApprovedById !== user.id) {
    return NextResponse.json(
      {
        error:
          existing.firstApprovedById === null
            ? "This document has no first approval to withdraw."
            : "Only the Registrar who gave first approval can withdraw it.",
      },
      { status: 403 },
    );
  }

  // Guard: can only withdraw while still pending (before second approval).
  if (existing.reviewStatus !== "PENDING") {
    return NextResponse.json(
      {
        error:
          "This document has already been finalized (approved or rejected). Withdrawal is only possible while still pending.",
      },
      { status: 409 },
    );
  }

  // Race-safe: updateMany ensures only the row matching ALL of:
  //   id, reviewStatus=PENDING, firstApprovedById=caller
  // gets updated. If another Registrar finalized approval concurrently,
  // result.count = 0 → 409.
  const result = await db.document.updateMany({
    where: {
      id: documentId,
      reviewStatus: "PENDING",
      firstApprovedById: user.id,
    },
    data: {
      firstApprovedById: null,
      firstApprovedAt: null,
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
      action: "document_review_withdraw_first_approval",
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
        reviewStatus: "PENDING",
        firstApprovedAt: null,
        firstApprovedById: null,
      }),
      severity: Severity.INFO,
    },
  });

  return NextResponse.json({
    success: true,
    documentId,
    reviewStatus: "PENDING",
    firstApprovedAt: null,
    firstApprovedById: null,
    message: "First approval withdrawn. The document is back in the pending queue.",
  });
}
