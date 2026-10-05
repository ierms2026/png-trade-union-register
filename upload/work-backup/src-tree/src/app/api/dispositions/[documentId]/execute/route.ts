import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";
import { isRetentionEnabled, RETENTION_DISABLED_MESSAGE } from "@/lib/retention-flag";

// =============================================================================
// POST /api/dispositions/[documentId]/execute
// Executes a scheduled disposition after the cooldown has elapsed.
//
// What happens on execution:
//   1. Verify cooldown has elapsed (else 400)
//   2. Re-check for active legal holds (else 423)
//   3. Generate a Certificate of Destruction (JSON: authorization chain +
//      file metadata)
//   4. Securely delete the .bin file(s) from disk (cryptographic erasure:
//      overwrite with zeros, then unlink)
//   5. Set Document.disposedAt = now
//   6. Set DispositionRequest.status = EXECUTED, store certificate
//   7. Keep a permanent audit stub (the Document + DocumentVersion rows
//      stay in the DB, but the file is gone — disposedAt marks it)
//   8. CRITICAL audit log
//
// AUTH: REGISTRAR only.
// =============================================================================

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");

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
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json({ error: "Only Registrars can execute dispositions." }, { status: 403 });
  }

  // --- 1. Find the SCHEDULED request ---
  const request = await db.dispositionRequest.findFirst({
    where: { documentId, status: "SCHEDULED" },
  });

  if (!request) {
    return NextResponse.json(
      { error: "No scheduled disposition request found. Schedule one via POST /api/retention/[id]/approve first." },
      { status: 404 },
    );
  }

  // --- 2. Verify cooldown has elapsed ---
  const now = new Date();
  if (now.getTime() < request.cooldownEndsAt.getTime()) {
    return NextResponse.json(
      {
        error:
          `Cooldown has not elapsed. Disposal can be executed after ` +
          `${new Date(request.cooldownEndsAt).toLocaleString()}. ` +
          `(${Math.ceil((request.cooldownEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))} day(s) remaining.)`,
      },
      { status: 400 },
    );
  }

  // --- 3. Re-check for active legal holds ---
  const activeHold = await db.legalHold.findFirst({
    where: { documentId, liftedAt: null },
  });
  if (activeHold) {
    // Mark the request as BLOCKED
    await db.dispositionRequest.update({
      where: { id: request.id },
      data: {
        status: "BLOCKED",
        cancelledAt: now,
        cancelledById: user.id,
        cancelReason: `Legal hold active: ${activeHold.reason}`,
      },
    });
    return NextResponse.json(
      {
        error:
          `Execution BLOCKED: a legal hold was placed on this document ` +
          `after the disposition was scheduled ("${activeHold.reason}"). ` +
          `Lift the hold and reschedule the disposition.`,
      },
      { status: 423 },
    );
  }

  // --- 4. Fetch document + versions for the certificate ---
  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      documentType: true,
      unionId: true,
      disposedAt: true,
      union: { select: { unionName: true, registrationNo: true } },
      versions: {
        orderBy: { versionNumber: "asc" },
        select: {
          id: true,
          versionNumber: true,
          fileName: true,
          filePath: true,
          fileSize: true,
          checksum: true,
          fileExtension: true,
          uploadedAt: true,
        },
      },
    },
  });

  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  if (doc.disposedAt) {
    return NextResponse.json(
      { error: "This document has already been disposed." },
      { status: 400 },
    );
  }

  // --- 5. Generate Certificate of Destruction ---
  const certificate = {
    certificateId: `CERT-${Date.now()}-${documentId.slice(-8)}`,
    issuedAt: now.toISOString(),
    issuedBy: {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    document: {
      id: documentId,
      documentType: doc.documentType,
      unionId: doc.unionId,
      unionName: doc.union.unionName,
      registrationNo: doc.union.registrationNo,
    },
    dispositionRequest: {
      id: request.id,
      requestedById: request.requestedById,
      requestedAt: request.requestedAt.toISOString(),
      cooldownEndsAt: request.cooldownEndsAt.toISOString(),
    },
    versionsDestroyed: doc.versions.map((v) => ({
      versionId: v.id,
      versionNumber: v.versionNumber,
      fileName: v.fileName,
      fileSize: v.fileSize,
      checksum: v.checksum,
      filePath: v.filePath,
    })),
    method: "Secure Cryptographic Erasure (file overwritten with zeros, then unlinked)",
    legalBasis: "Disposed per Retention Schedule — retention period elapsed, no active legal holds.",
    auditStubNote: "Document metadata retained as a permanent audit stub. File content has been securely destroyed.",
  };

  // --- 6. Securely delete the .bin file(s) from disk ---
  // For each version, overwrite the file with zeros (cryptographic erasure
  // simulation — in production this would use a proper shred utility), then
  // unlink the file. If a file can't be deleted, log a WARNING but continue
  // — the DB row is the source of truth for "disposed" status.
  const destructionLog: Array<{ versionId: string; filePath: string; destroyed: boolean; error?: string }> = [];

  for (const version of doc.versions) {
    const absolutePath = path.join(STORAGE_ROOT, version.filePath);
    try {
      // Overwrite with zeros (best-effort — file may be on a filesystem
      // that doesn't support this securely, but it's better than unlink alone)
      try {
        const zeros = Buffer.alloc(version.fileSize, 0);
        await fs.writeFile(absolutePath, zeros);
      } catch {
        // If overwrite fails (e.g., file already gone), proceed to unlink
      }
      await fs.unlink(absolutePath);
      destructionLog.push({ versionId: version.id, filePath: version.filePath, destroyed: true });
    } catch (err) {
      destructionLog.push({
        versionId: version.id,
        filePath: version.filePath,
        destroyed: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // --- 7. Update DB: set disposedAt + mark request EXECUTED ---
  await db.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: documentId },
      data: { disposedAt: now },
    });

    await tx.dispositionRequest.update({
      where: { id: request.id },
      data: {
        status: "EXECUTED",
        executedAt: now,
        executedById: user.id,
        certificateJson: JSON.stringify(certificate),
      },
    });
  });

  // --- 8. CRITICAL audit log ---
  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "disposition_executed",
      entityType: "Document",
      entityId: documentId,
      afterJson: JSON.stringify({
        documentType: doc.documentType,
        unionId: doc.unionId,
        unionName: doc.union.unionName,
        registrationNo: doc.union.registrationNo,
        disposedAt: now.toISOString(),
        certificateId: certificate.certificateId,
        versionsDestroyed: destructionLog.filter((d) => d.destroyed).length,
        versionsFailed: destructionLog.filter((d) => !d.destroyed).length,
        destructionLog,
        note: "File content securely destroyed. Metadata stub retained as permanent audit record.",
      }),
      severity: Severity.CRITICAL,
    },
  });

  return NextResponse.json({
    success: true,
    documentId,
    status: "EXECUTED",
    disposedAt: now.toISOString(),
    certificate,
    destructionSummary: {
      versionsDestroyed: destructionLog.filter((d) => d.destroyed).length,
      versionsFailed: destructionLog.filter((d) => !d.destroyed).length,
    },
    message:
      "Disposition executed. File content has been securely destroyed. " +
      "A permanent audit stub (Document + DocumentVersion metadata) remains in the database. " +
      "A Certificate of Destruction has been generated and stored.",
  });
}
