import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";

// =============================================================================
// POST /api/legal-holds/[documentId]/place
// Places a legal hold on a document — blocks disposal until explicitly lifted.
// AUTH: REGISTRAR only. AUDIT: CRITICAL (a legal hold overrides the retention
// schedule and must be prominently flagged).
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
    return NextResponse.json({ error: "Only Registrars can place legal holds." }, { status: 403 });
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
      { error: "A reason is required (e.g., 'Court order 2026/123', 'Active audit ref AUD-456')." },
      { status: 400 },
    );
  }

  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: { id: true, documentType: true, unionId: true, disposedAt: true },
  });

  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  if (doc.disposedAt) {
    return NextResponse.json(
      { error: "Cannot place a legal hold on a document that has already been disposed." },
      { status: 400 },
    );
  }

  // Check if there's already an active hold
  const existingHold = await db.legalHold.findFirst({
    where: { documentId, liftedAt: null },
  });
  if (existingHold) {
    return NextResponse.json(
      { error: "This document is already under an active legal hold." },
      { status: 409 },
    );
  }

  const hold = await db.legalHold.create({
    data: {
      documentId,
      reason,
      placedById: user.id,
    },
  });

  // Cancel any pending disposition requests on this document
  const cancelled = await db.dispositionRequest.updateMany({
    where: { documentId, status: "SCHEDULED" },
    data: {
      status: "BLOCKED",
      cancelledAt: new Date(),
      cancelledById: user.id,
      cancelReason: `Legal hold placed: ${reason}`,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "legal_hold_placed",
      entityType: "Document",
      entityId: documentId,
      afterJson: JSON.stringify({
        documentId,
        documentType: doc.documentType,
        unionId: doc.unionId,
        holdId: hold.id,
        reason,
        pendingDispositionsCancelled: cancelled.count,
      }),
      severity: Severity.CRITICAL,
    },
  });

  return NextResponse.json({
    success: true,
    holdId: hold.id,
    documentId,
    reason,
    placedAt: hold.placedAt.toISOString(),
    pendingDispositionsCancelled: cancelled.count,
  });
}
