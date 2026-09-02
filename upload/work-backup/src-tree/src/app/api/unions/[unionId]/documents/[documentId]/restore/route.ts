import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";
import {
  checkRateLimit,
  rateLimitedResponse,
  rateLimitHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";

// =============================================================================
// POST /api/unions/[unionId]/documents/[documentId]/restore
// -----------------------------------------------------------------------------
// Restores an old version of a document — creates a NEW version with the
// old version's file content. The original version is NEVER mutated.
//
// Example: if a document has versions v1, v2, v3 (current), restoring v1
// creates v4 with v1's file content. v1, v2, v3 stay untouched.
//
// This is the "non-destructive versioning" pillar from the spec:
// "Restoring an old version creates a NEW version row; it never overwrites
// history."
//
// The body specifies which version to restore:
//   { versionId: "cmst..." }  — the DocumentVersion ID to restore
//
// AUTH:
// REGISTRAR + OFFICER (Inspectors read-only). Officers can only restore
// documents in their own union (checked via assignedUnionId).
// =============================================================================

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ unionId: string; documentId: string }> },
) {
  const { unionId, documentId } = await params;

  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role === Role.INSPECTOR) {
    return NextResponse.json(
      { error: "Inspectors have read-only access." },
      { status: 403 },
    );
  }
  if (user.role === Role.OFFICER && user.assignedUnionId !== unionId) {
    return NextResponse.json(
      { error: "You can only restore documents in your own union." },
      { status: 403 },
    );
  }

  // Rate limit — 10 restores/min per user. Same budget as uploads since
  // restore is also a write op (creates a new DocumentVersion). Stops a
  // stolen session cookie from creating endless restored versions.
  const rl = checkRateLimit(
    "documentRestore",
    user.id,
    RATE_LIMITS.documentRestore.max,
    RATE_LIMITS.documentRestore.windowMs,
  );
  if (!rl.allowed) {
    return rateLimitedResponse(rl);
  }
  const rlHeaders = rateLimitHeaders(rl);

  const body = await req.json().catch(() => null);
  if (!body || typeof body.versionId !== "string") {
    return NextResponse.json(
      { error: "versionId is required." },
      { status: 400 },
    );
  }

  // Verify the document exists + belongs to this union
  const doc = await db.document.findFirst({
    where: { id: documentId, unionId },
    select: {
      id: true,
      documentType: true,
      currentVersionId: true,
      disposedAt: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { versionNumber: true },
      },
    },
  });

  if (!doc) {
    return NextResponse.json(
      { error: "Document not found." },
      { status: 404 },
    );
  }

  if (doc.disposedAt) {
    return NextResponse.json(
      { error: "Cannot restore a disposed document." },
      { status: 400 },
    );
  }

  // Find the version to restore
  const versionToRestore = await db.documentVersion.findUnique({
    where: { id: body.versionId },
  });

  if (!versionToRestore || versionToRestore.documentId !== documentId) {
    return NextResponse.json(
      { error: "Version not found or does not belong to this document." },
      { status: 404 },
    );
  }

  // Don't restore if it's already the current version
  const latestVersion = doc.versions[0];
  if (latestVersion && versionToRestore.id === doc.currentVersionId) {
    return NextResponse.json(
      { error: "This is already the current version." },
      { status: 400 },
    );
  }

  // --- Read the old version's file content from disk ---
  const oldFilePath = path.join(STORAGE_ROOT, versionToRestore.filePath);
  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(oldFilePath);
  } catch {
    return NextResponse.json(
      { error: "The original file could not be read from disk." },
      { status: 500 },
    );
  }

  // --- Create the new version ---
  // The new version's filePath follows the same pattern:
  // unions/{unionId}/{documentId}/{newVersionNumber}.bin
  const newVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;
  const newRelativePath = path.posix.join(
    "unions",
    unionId,
    documentId,
    `${newVersionNumber}.bin`,
  );
  const newAbsolutePath = path.join(STORAGE_ROOT, newRelativePath);

  // Atomic write: .tmp → rename
  const tmpPath = `${newAbsolutePath}.tmp`;
  await fs.mkdir(path.dirname(newAbsolutePath), { recursive: true });
  await fs.writeFile(tmpPath, fileBuffer);
  await fs.rename(tmpPath, newAbsolutePath);

  // --- DB transaction: create version + update currentVersionId ---
  const newVersion = await db.$transaction(async (tx) => {
    const created = await tx.documentVersion.create({
      data: {
        documentId,
        versionNumber: newVersionNumber,
        fileName: versionToRestore.fileName,
        filePath: newRelativePath,
        fileSize: fileBuffer.length,
        checksum: versionToRestore.checksum, // same content = same checksum
        fileExtension: versionToRestore.fileExtension,
        uploadedById: user.id,
      },
    });

    await tx.document.update({
      where: { id: documentId },
      data: { currentVersionId: created.id },
    });

    return created;
  });

  return NextResponse.json(
    {
      documentId,
      restoredFromVersion: versionToRestore.versionNumber,
      newVersion: {
        id: newVersion.id,
        versionNumber: newVersion.versionNumber,
        fileName: newVersion.fileName,
        uploadedAt: newVersion.uploadedAt.toISOString(),
      },
    },
    { status: 201, headers: rlHeaders },
  );
}
