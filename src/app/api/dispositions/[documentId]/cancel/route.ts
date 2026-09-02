import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";

// =============================================================================
// POST /api/dispositions/[documentId]/cancel
// Cancels a SCHEDULED disposition request. Any Registrar can cancel during
// the cooldown period. Requires a reason. AUDIT: WARNING.
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
    return NextResponse.json({ error: "Only Registrars can cancel disposition requests." }, { status: 403 });
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
      { error: "A cancellation reason is required for the audit trail." },
      { status: 400 },
    );
  }

  // Find the active SCHEDULED request
  const request = await db.dispositionRequest.findFirst({
    where: { documentId, status: "SCHEDULED" },
  });

  if (!request) {
    return NextResponse.json(
      { error: "No scheduled disposition request found for this document." },
      { status: 404 },
    );
  }

  const now = new Date();
  await db.dispositionRequest.update({
    where: { id: request.id },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      cancelledById: user.id,
      cancelReason: reason,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "disposition_cancelled",
      entityType: "Document",
      entityId: documentId,
      afterJson: JSON.stringify({
        dispositionRequestId: request.id,
        cancelledAt: now.toISOString(),
        cancelReason: reason,
        note: "Disposition cancelled during cooldown. Document is NOT disposed.",
      }),
      severity: Severity.WARNING,
    },
  });

  return NextResponse.json({
    success: true,
    documentId,
    dispositionRequestId: request.id,
    status: "CANCELLED",
    cancelledAt: now.toISOString(),
    message: "Disposition cancelled. The document is not disposed and remains in the system.",
  });
}
