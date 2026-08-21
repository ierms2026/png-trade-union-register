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

  // --- 2. Race-safe disposal via updateMany ------------------------------
  // The `where` clause includes `disposedAt: null` — if the document
  // was already disposed by a concurrent request, this affects 0 rows.
  const now = new Date();
  const result = await db.document.updateMany({
    where: { id: documentId, disposedAt: null },
    data: { disposedAt: now },
  });

  if (result.count === 0) {
    // Either the document was already disposed, or it doesn't exist.
    // We already checked existence above, so this means it was disposed
    // between our fetch and our update — a TOCTOU race that we caught.
    return NextResponse.json(
      {
        error:
          "This document was already disposed by another request. Please refresh the retention queue.",
      },
      { status: 409 },
    );
  }

  // --- 3. Audit log entry (CRITICAL severity) ----------------------------
  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "retention_dispose",
      entityType: "Document",
      entityId: documentId,
      beforeJson: JSON.stringify({
        documentType: existing.documentType,
        unionId: existing.unionId,
        unionName: existing.union.unionName,
        registrationNo: existing.union.registrationNo,
        disposedAt: existing.disposedAt, // null before
        snoozedUntil: existing.snoozedUntil,
      }),
      afterJson: JSON.stringify({
        documentType: existing.documentType,
        unionId: existing.unionId,
        unionName: existing.union.unionName,
        registrationNo: existing.union.registrationNo,
        disposedAt: now.toISOString(),
        snoozedUntil: existing.snoozedUntil,
      }),
      severity: Severity.CRITICAL,
    },
  });

  return NextResponse.json({
    success: true,
    documentId,
    disposedAt: now.toISOString(),
  });
}
