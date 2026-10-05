import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";
import { isRetentionEnabled, RETENTION_DISABLED_MESSAGE } from "@/lib/retention-flag";

// =============================================================================
// POST /api/retention/[documentId]/reject
// -----------------------------------------------------------------------------
// Snoozes a document's disposal for 30 days. The document stays in the
// system, marked as snoozed, and won't reappear in the retention queue
// until the snooze expires.
//
// USE CASE:
//   A Registrar reviews the retention queue and sees a document whose
//   retention period has elapsed. Before disposing, they want to confirm
//   with the union (or check for an active legal hold). They click
//   "Snooze" to defer the decision by 30 days.
//
// AUTH:
//   REGISTRAR + INSPECTOR. Inspectors can snooze (it's a reversible
//   action — the snooze can expire or be overridden). Only Registrars
//   can approve disposal (irreversible).
//
// AUDIT:
//   Severity: INFO. Snoozing is a routine deferral, not a destructive
//   action. The audit trail records it for completeness.
// =============================================================================

const SNOOZE_DAYS = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  // --- Retention feature guard -------------------------------------------
  // When the retention flag is off, the entire retention/disposition/
  // legal-hold workflow is hidden. These API routes return 404 so nobody
  // can dispose of real records by hitting the URL directly.
  if (!isRetentionEnabled()) {
    return NextResponse.json(
      { error: RETENTION_DISABLED_MESSAGE },
      { status: 404 },
    );
  }

  const { documentId } = await params;

  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (user.role !== Role.REGISTRAR && user.role !== Role.INSPECTOR) {
    return NextResponse.json(
      { error: "Only Registrars and Inspectors can snooze disposal." },
      { status: 403 },
    );
  }

  // --- 1. Fetch the document (404 if not found) --------------------------
  const existing = await db.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      documentType: true,
      unionId: true,
      disposedAt: true,
      snoozedUntil: true,
      union: { select: { unionName: true, registrationNo: true } },
    },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Document not found." },
      { status: 404 },
    );
  }

  // Can't snooze a disposed document.
  if (existing.disposedAt) {
    return NextResponse.json(
      { error: "This document has already been disposed." },
      { status: 400 },
    );
  }

  // --- 2. Set snoozedUntil = now + 30 days -------------------------------
  const snoozedUntil = new Date(
    Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000,
  );

  const updated = await db.document.update({
    where: { id: documentId },
    data: { snoozedUntil },
    select: { id: true, snoozedUntil: true },
  });

  // --- 3. Audit log entry ------------------------------------------------
  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "retention_snooze",
      entityType: "Document",
      entityId: documentId,
      beforeJson: JSON.stringify({
        documentType: existing.documentType,
        unionName: existing.union.unionName,
        registrationNo: existing.union.registrationNo,
        snoozedUntil: existing.snoozedUntil,
      }),
      afterJson: JSON.stringify({
        documentType: existing.documentType,
        unionName: existing.union.unionName,
        registrationNo: existing.union.registrationNo,
        snoozedUntil: snoozedUntil.toISOString(),
      }),
      severity: Severity.INFO,
    },
  });

  return NextResponse.json({
    success: true,
    documentId,
    snoozedUntil: updated.snoozedUntil?.toISOString(),
  });
}
