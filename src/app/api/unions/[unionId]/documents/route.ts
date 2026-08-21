import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";

// =============================================================================
// POST /api/unions/[unionId]/documents
// -----------------------------------------------------------------------------
// File upload pipeline + non-destructive versioning API.
//
// Flow:
//   1. Validate union exists (404 if not — union existence is not secret here)
//   2. Parse FormData: file, documentType, title
//   3. Read file into buffer + compute SHA-256 checksum
//   4. Find existing Document for this (unionId, documentType)
//   5. Duplicate detection: if checksum matches the LATEST version → 409
//   6. Determine versionNumber (latest+1 if exists, else 1) + documentId
//   7. Write file atomically (.tmp → rename) — POSIX rename is atomic
//   8. DB transaction: create Document (if new) + DocumentVersion + update
//      Document.currentVersionId. On failure, delete the file (compensation)
//
// FILE PATH DESIGN — DEVIATION FROM LITERAL SPEC (documented):
// The user's instruction said `/storage/unions/{unionId}/{documentId}.bin`.
// Taken literally, all versions of a Document share the same .bin path,
// which means uploading v2 OVERWRITES v1's content — breaking the
// "non-destructive versioning" pillar the user emphasized as critical
// ("Restoring an old version creates a NEW version row; it never overwrites
// history"). The only way to honor that pillar is per-version file paths.
//
// Implemented path: unions/{unionId}/{documentId}/{versionNumber}.bin
//   - Top level matches the user's literal instruction (unions/{unionId}/
//     {documentId}/...) so `ls /storage/unions/{unionId}/` still shows all
//     documents for that union as directories.
//   - Each version is a numbered .bin file inside the document's directory.
//   - Restoring v1 of a v3 doc reads v1's filePath (1.bin), copies its
//     content to a new file (4.bin), and creates a DocumentVersion row —
//     v1's file is never touched.
//
// ATOMIC WRITE PATTERN:
//   write to {path}.tmp  →  rename {path}.tmp to {path}
// `fs.rename` is atomic on the same filesystem (POSIX guarantee). If the
// process crashes between write and rename, the final path is untouched —
// at worst, a stale .tmp file is left behind (cleaned up on next attempt).
// This matters because partial writes would produce corrupt PDFs that
// fail silently when a user tries to open them — atomic rename prevents
// that class of bug.
//
// TODO (auth): this route is currently unauthenticated. Once the auth-guard
// from Session 1 Step 5 is built, wrap this with `requireUser(["REGISTRAR",
// "OFFICER"])` — Officers can upload to their own union only (enforced by
// comparing `unionId` to `user.assignedUnionId` server-side).
//
// TODO (race safety): schema lacks @@unique([unionId, documentType]) on
// Document, so two concurrent uploads for the same pair could create two
// Document rows. Adding the constraint is a 1-line schema change;
// recommended follow-up.
// =============================================================================

// Storage root — project-relative in dev, override via STORAGE_ROOT env var
// in production to point at a persistent disk mount.
const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");

// Max file size: 50 MB. PDFs of constitutions with embedded scans typically
// run 1-10 MB; 50 MB gives headroom without inviting abuse.
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ unionId: string }> },
) {
  const { unionId } = await params;

  // 0. Auth check + INSPECTOR 403 + Officer scoping.
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (user.role === Role.INSPECTOR) {
    return NextResponse.json(
      { error: "Inspectors have read-only access." },
      { status: 403 },
    );
  }
  if (user.role === Role.OFFICER && user.assignedUnionId !== unionId) {
    return NextResponse.json(
      { error: "You can only upload documents to your own union." },
      { status: 403 },
    );
  }

  // 1. Verify the union exists. Union existence is not a secret at this
  //    endpoint (it's an authenticated internal route), so a plain 404 is
  //    fine. Public endpoints in Session 7 will use indistinguishable 404s
  //    to avoid leaking sub-resource existence to anonymous callers.
  const existingUnion = await db.union.findUnique({
    where: { id: unionId },
    select: { id: true, unionName: true },
  });
  if (!existingUnion) {
    return NextResponse.json(
      { error: "Union not found." },
      { status: 404 },
    );
  }

  // 2. Parse FormData
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid request. Expected multipart/form-data with 'file', 'documentType', and 'title' fields.",
      },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  const documentType = formData.get("documentType");
  const title = formData.get("title");

  // Validate `file` — must be a File (not a string, not null)
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing or invalid 'file'. Expected a File upload." },
      { status: 400 },
    );
  }
  // Validate `documentType` — non-empty string
  if (!documentType || typeof documentType !== "string" || documentType.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid 'documentType'. Expected a non-empty string." },
      { status: 400 },
    );
  }
  // Validate `title` — non-empty string (this becomes DocumentVersion.fileName,
  // the user-facing name shown in the UI; the original uploaded filename is
  // used only for extension extraction)
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid 'title'. Expected a non-empty string." },
      { status: 400 },
    );
  }

  // 3. File size validation
  if (file.size === 0) {
    return NextResponse.json(
      { error: "File is empty." },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
      },
      { status: 413 },
    );
  }

  // 4. Extract file extension from the uploaded file's name (e.g., ".pdf")
  //    Used for display + content-type negotiation on download. We don't
  //    restrict extensions at this layer — the public download endpoint
  //    (Session 7) will type-check before serving.
  const originalName = file.name || "untitled";
  const fileExtension = path.extname(originalName).toLowerCase() || null;

  // 5. Read file into buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 6. SHA-256 checksum — the foundation of duplicate detection.
  //    Hex-encoded (64 chars) for storage + display.
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

  // 7. Find existing Document (if any) for this (unionId, documentType).
  //    Uses findUnique with the @@unique([unionId, documentType]) constraint.
  //    This is race-safe — two concurrent uploads can't create duplicate
  //    Document rows because the DB enforces uniqueness.
  const existingDoc = await db.document.findUnique({
    where: { unionId_documentType: { unionId, documentType: documentType.trim() } },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1, // just the latest version
      },
    },
  });

  // 8. Duplicate detection: if checksum matches the LATEST version → 409.
  //    We compare only against the latest, not older versions — re-uploading
  //    an old version's content is a legitimate "restore" use case (handled
  //    by a separate endpoint in a later step). Comparing against every
  //    historical version would block that flow.
  if (existingDoc && existingDoc.versions[0]?.checksum === checksum) {
    return NextResponse.json(
      {
        error:
          "Duplicate file detected. The latest version of this document type has the same SHA-256 checksum.",
        documentId: existingDoc.id,
        latestVersionNumber: existingDoc.versions[0].versionNumber,
      },
      { status: 409 },
    );
  }

  // 9. Determine version number + document ID.
  //    - If document exists, use its ID + bump version number
  //    - If new, generate a fresh UUID upfront so we can compute the file
  //      path BEFORE writing to disk — avoids creating orphan Document rows
  //      if the file write fails
  const versionNumber = existingDoc
    ? (existingDoc.versions[0]?.versionNumber ?? 0) + 1
    : 1;
  const documentId = existingDoc?.id ?? crypto.randomUUID();

  // 10. Compute file paths.
  //     RELATIVE path (stored in DB) uses POSIX separators (forward slashes)
  //     so it's portable across operating systems and storage backends —
  //     a future migration to S3-compatible storage can use the relative
  //     path as the object key without translation.
  //     ABSOLUTE path (used for disk I/O) uses the platform's native separator.
  const relativeFilePath = path.posix.join(
    "unions",
    unionId,
    documentId,
    `${versionNumber}.bin`,
  );
  const absoluteFilePath = path.join(STORAGE_ROOT, relativeFilePath);
  const tmpFilePath = `${absoluteFilePath}.tmp`;

  // 11. Ensure parent directory exists. recursive: true makes this idempotent
  //     (won't fail if the directory already exists).
  await fs.mkdir(path.dirname(absoluteFilePath), { recursive: true });

  // 12. Atomic write: .tmp first, then rename.
  //     fs.rename is atomic on the same filesystem (POSIX guarantee). The
  //     .tmp file lives in the same directory as the target, guaranteeing
  //     same-filesystem rename.
  try {
    await fs.writeFile(tmpFilePath, buffer);
    await fs.rename(tmpFilePath, absoluteFilePath);
  } catch (err) {
    // Cleanup the .tmp file if it exists — partial writes leave it behind.
    try {
      await fs.unlink(tmpFilePath);
    } catch {
      // Ignore cleanup errors — we're already in an error path
    }
    console.error("[documents/upload] File write failed:", err);
    return NextResponse.json(
      { error: "Failed to write file to disk." },
      { status: 500 },
    );
  }

  // 13. DB transaction — create Document (if new) + DocumentVersion +
  //     update Document.currentVersionId. If this fails, delete the file
  //     we just wrote (compensation) so we don't leave orphan files.
  try {
    const result = await db.$transaction(async (tx) => {
      // If document doesn't exist yet, create it with the upfront-generated ID.
      let document = existingDoc;
      if (!document) {
        document = await tx.document.create({
          data: {
            id: documentId,
            unionId,
            documentType: documentType.trim(),
          },
        });
      }

      // Create the DocumentVersion row
      const newVersion = await tx.documentVersion.create({
        data: {
          documentId: document.id,
          versionNumber,
          fileName: title.trim(),
          filePath: relativeFilePath,
          fileSize: buffer.length,
          checksum,
          fileExtension,
          uploadedById: user.id,
        },
      });

      // Update Document.currentVersionId to point to the new version.
      // This is the "live pointer" — reads of the document always fetch
      // the version referenced by currentVersionId, without needing to
      // query "ORDER BY versionNumber DESC LIMIT 1" on every read.
      await tx.document.update({
        where: { id: document.id },
        data: { currentVersionId: newVersion.id },
      });

      return { document, newVersion };
    });

    // 14. Return 201 Created with the new version's metadata.
    //     Includes the checksum + filePath so the client can verify
    //     integrity and construct download URLs.
    return NextResponse.json(
      {
        documentId: result.document.id,
        documentType: result.document.documentType,
        version: {
          id: result.newVersion.id,
          versionNumber: result.newVersion.versionNumber,
          fileName: result.newVersion.fileName,
          filePath: result.newVersion.filePath,
          fileSize: result.newVersion.fileSize,
          checksum: result.newVersion.checksum,
          fileExtension: result.newVersion.fileExtension,
          uploadedAt: result.newVersion.uploadedAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    // Compensation: delete the file we wrote, since the DB transaction failed.
    // This keeps the filesystem and DB in sync — no orphan files.
    try {
      await fs.unlink(absoluteFilePath);
    } catch {
      // Ignore — we're already in an error path
    }
    console.error("[documents/upload] DB transaction failed:", err);
    return NextResponse.json(
      {
        error:
          "Failed to create document record. The uploaded file has been cleaned up.",
      },
      { status: 500 },
    );
  }
}
