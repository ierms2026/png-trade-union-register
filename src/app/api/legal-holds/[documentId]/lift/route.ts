import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";

// =============================================================================
// POST /api/legal-holds/[documentId]/lift
// Lifts an active legal hold, allowing the document to re-enter the
// disposition workflow. AUTH: REGISTRAR only. AUDIT: CRITICAL.
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
    return NextResponse.json({ error: "Only Registrars can lift legal holds." }, { status: 403 });
  }

  const activeHold = await db.legalHold.findFirst({
    where: { documentId, liftedAt: null },
  });

  if (!activeHold) {
    return NextResponse.json(
      { error: "No active legal hold found on this document." },
      { status: 404 },
    );
  }

  const now = new Date();
  await db.legalHold.update({
    where: { id: activeHold.id },
    data: {
      liftedAt: now,
      liftedById: user.id,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "legal_hold_lifted",
      entityType: "Document",
      entityId: documentId,
      beforeJson: JSON.stringify({
        holdId: activeHold.id,
        reason: activeHold.reason,
        placedAt: activeHold.placedAt.toISOString(),
      }),
      afterJson: JSON.stringify({
        holdId: activeHold.id,
        liftedAt: now.toISOString(),
        note: "Document can now re-enter the disposition workflow.",
      }),
      severity: Severity.CRITICAL,
    },
  });

  return NextResponse.json({
    success: true,
    holdId: activeHold.id,
    documentId,
    liftedAt: now.toISOString(),
    note: "Legal hold lifted. The document can now re-enter the disposition workflow.",
  });
}
