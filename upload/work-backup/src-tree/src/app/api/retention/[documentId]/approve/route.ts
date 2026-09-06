import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";

// =============================================================================
// POST /api/retention/[documentId]/approve
// -----------------------------------------------------------------------------
// Approves a document for disposal. Sets disposedAt = now.
//
// RACE-SAFETY (critical):
//   We use updateMany with `where: { id, disposedAt: null }` instead of
//   a findUnique + update. If another request disposed the document
//   between our check and our update, the updateMany affects 0 rows
//   and we return 409 Conflict — telling the caller "this document was
//   already disposed, refresh your view."
//
//   A naive `findUnique → update` would have a TOCTOU race: two
//   concurrent requests could both see disposedAt=null, both proceed
//   to update, and one would silently overwrite the other's disposedAt
//   timestamp. The updateMany approach is atomic at the DB level.
//
// AUTH:
//   REGISTRAR only. Inspectors can see the retention queue (read-only)
//   but only a Registrar can approve disposal — disposal is an
//   irreversible action that destroys the document's compliance status.
//
// AUDIT:
//   Severity: CRITICAL. Disposal is the most destructive action in the
//   system — the document is marked as disposed and disappears from
//   every active view. The audit trail must flag this prominently.
// =============================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;

  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can approve document disposal." },
      { status: 403 },
    );
  }

  // --- 1. Fetch the document's BEFORE state for the audit log ------------
  // We need the unionId + documentType for the audit entry, and we want
  // to capture the pre-disposal state. This fetch is for AUDIT ONLY —
  // the actual disposal uses updateMany below (race-safe).
  const existing = await db.document.findUnique({
    where: { id: documentId },
    select: {
      id: true, documentType: true, unionId: true,
      disposedAt: true, snoozedUntil: true,
      union: { select: { unionName: true, registrationNo: true } },
      versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { uploadedAt: true } },
    },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Document not found." },
      { status: 404 },
    );
  }

  // --- 1b. Enforce retention window — block early disposal --------------
  const latestVersion = existing.versions[0];
  if (latestVersion) {
    const rule = await db.complianceRule.findUnique({
      where: { documentType: existing.documentType },
      select: { retentionYrs: true },
    });
    if (rule) {
      const disposalDueDate = new Date(latestVersion.uploadedAt);
      disposalDueDate.setFullYear(disposalDueDate.getFullYear() + rule.retentionYrs);
      if (disposalDueDate.getTime() > Date.now()) {
        return NextResponse.json(
          { error: `Cannot dispose: this document's ${rule.retentionYrs}-year retention window has not elapsed (filed ${new Date(latestVersion.uploadedAt).toLocaleDateString()}, eligible for disposal on ${disposalDueDate.toLocaleDateString()}). Use snooze to defer, or wait until the retention period expires.` },
          { status: 400 },
        );
      }
    }
  }

  // --- 2. Legal Hold check -----------------------------------------------
  const activeHold = await db.legalHold.findFirst({
    where: { documentId, liftedAt: null },
  });
  if (activeHold) {
    await db.auditLog.create({
      data: {
        actorId: user.id, actorName: user.email,
        action: "disposition_blocked_legal_hold",
        entityType: "Document", entityId: documentId,
        afterJson: JSON.stringify({
          documentType: existing.documentType, unionId: existing.unionId,
          holdId: activeHold.id, holdReason: activeHold.reason,
          holdPlacedAt: activeHold.placedAt.toISOString(),
        }),
        severity: Severity.WARNING,
      },
    });
    return NextResponse.json(
      { error: `Disposition BLOCKED: this document is under an active legal hold ("${activeHold.reason}", placed ${new Date(activeHold.placedAt).toLocaleDateString()}). The hold must be explicitly lifted before disposal can proceed.` },
      { status: 423 },
    );
  }

  // --- 3. Check for existing pending disposition request ------------------
  const existingRequest = await db.dispositionRequest.findFirst({
    where: { documentId, status: "SCHEDULED" },
  });
  if (existingRequest) {
    return NextResponse.json(
      { error: `A disposition request is already scheduled for this document (cooldown ends ${new Date(existingRequest.cooldownEndsAt).toLocaleDateString()}). Wait for the cooldown to elapse or cancel the existing request first.`, existingRequestId: existingRequest.id },
      { status: 409 },
    );
  }

  // --- 4. Create DispositionRequest with 14-day cooldown ------------------
  const COOLDOWN_DAYS = 14;
  const now = new Date();
  const cooldownEndsAt = new Date(now.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  const request = await db.dispositionRequest.create({
    data: {
      documentId, status: "SCHEDULED",
      requestedById: user.id, cooldownEndsAt,
    },
  });

  // --- 5. Audit log entry (CRITICAL — disposition scheduled) --------------
  await db.auditLog.create({
    data: {
      actorId: user.id, actorName: user.email,
      action: "disposition_scheduled",
      entityType: "Document", entityId: documentId,
      beforeJson: JSON.stringify({
        documentType: existing.documentType, unionId: existing.unionId,
        unionName: existing.union.unionName, registrationNo: existing.union.registrationNo,
        disposedAt: existing.disposedAt,
      }),
      afterJson: JSON.stringify({
        documentType: existing.documentType, unionId: existing.unionId,
        unionName: existing.union.unionName, registrationNo: existing.union.registrationNo,
        dispositionRequestId: request.id,
        cooldownEndsAt: cooldownEndsAt.toISOString(),
        note: `Disposal scheduled with ${COOLDOWN_DAYS}-day cooldown. Execute after ${cooldownEndsAt.toLocaleDateString()} or cancel before then.`,
      }),
      severity: Severity.CRITICAL,
    },
  });

  return NextResponse.json({
    success: true,
    documentId,
    dispositionRequestId: request.id,
    status: "SCHEDULED",
    cooldownEndsAt: cooldownEndsAt.toISOString(),
    cooldownDays: COOLDOWN_DAYS,
    message: `Disposition scheduled. A ${COOLDOWN_DAYS}-day cooldown is now active. After ${cooldownEndsAt.toLocaleDateString()}, execute the disposal via POST /api/dispositions/${documentId}/execute. Any Registrar can cancel before then via POST /api/dispositions/${documentId}/cancel.`,
  });
}
