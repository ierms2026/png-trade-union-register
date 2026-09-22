import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Severity } from "@prisma/client";

// =============================================================================
// PATCH /api/unions/[unionId]/documents/[documentId]/visibility
// -----------------------------------------------------------------------------
// Toggles a document's public visibility (isPublic flag). REGISTRAR only.
//
// REQUEST BODY:
//   { isPublic: boolean }  — true to publish, false to unpublish
//
// RESPONSE:
//   200 with the updated document { id, documentType, isPublic }
//
// AUDIT:
//   Writes an audit log entry (action: "document_visibility_change") with
//   before/after isPublic values.
//
// SECURITY:
//   - Only REGISTRAR can toggle visibility.
//   - Officers + Inspectors get 403.
//   - The document must exist + belong to the specified union.
// =============================================================================

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ unionId: string; documentId: string }> },
) {
  const { unionId, documentId } = await params;

  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== "REGISTRAR") {
    return NextResponse.json(
      { error: "Only Registrars can control document visibility." },
      { status: 403 },
    );
  }

  // Parse the request body
  let body: { isPublic?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.isPublic !== "boolean") {
    return NextResponse.json(
      { error: "Field 'isPublic' must be a boolean." },
      { status: 400 },
    );
  }

  // Verify the document exists + belongs to the union
  const existing = await db.document.findFirst({
    where: { id: documentId, unionId },
    select: { id: true, documentType: true, isPublic: true, disposedAt: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  // Don't allow publishing disposed documents
  if (body.isPublic && existing.disposedAt) {
    return NextResponse.json(
      { error: "Cannot publish a disposed document." },
      { status: 400 },
    );
  }

  // No-op if the value isn't changing
  if (existing.isPublic === body.isPublic) {
    return NextResponse.json({
      id: existing.id,
      documentType: existing.documentType,
      isPublic: existing.isPublic,
    });
  }

  // Update the document
  const updated = await db.document.update({
    where: { id: documentId },
    data: { isPublic: body.isPublic },
    select: { id: true, documentType: true, isPublic: true },
  });

  // Audit log
  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "document_visibility_change",
      entityType: "Document",
      entityId: documentId,
      beforeJson: JSON.stringify({ isPublic: existing.isPublic }),
      afterJson: JSON.stringify({ isPublic: updated.isPublic }),
      severity: Severity.INFO,
    },
  });

  return NextResponse.json(updated);
}
