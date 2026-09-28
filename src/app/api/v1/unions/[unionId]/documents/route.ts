import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "@/lib/prisma";
import { Role, Severity, NotificationType, ReviewStatus, WebhookEventType } from "@prisma/client";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { createNotificationForUsers } from "@/lib/notifications";
import { hasPdfMagicBytes, validatePdfIntegrity } from "@/lib/file-validation";
import {
  checkRateLimit,
  rateLimitedResponse,
  rateLimitHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { dispatchEvent } from "@/lib/webhooks/dispatcher";

// =============================================================================
// POST /api/v1/unions/[unionId]/documents
// -----------------------------------------------------------------------------
// Chunk 9: External document submission via API key.
//
// Mirrors the existing internal upload route
// (POST /api/unions/[unionId]/documents) but uses API key auth instead of
// session cookies. Designed for third-party integrations + the future union
// portal's programmatic uploads.
//
// AUTH: API key with `documents:write` scope (or session cookie with
// OFFICER/REPRESENTATIVE/REGISTRAR role). Inspector is blocked.
//
// REVIEW QUEUE: All external submissions enter PENDING status — the
// Registrar must approve before the document is "official". This is the
// security gate: even if an API key is compromised, the attacker can't
// inject official documents without Registrar approval.
//
// FORMDATA (same as the internal route):
//   - file (File, required, max 50MB, PDF-only)
//   - documentType (string, required)
//   - title (string, required — becomes the version's fileName)
//   - effectiveDate (optional ISO-8601 date string)
//
// RATE LIMIT: apiV1 bucket, 120/min per API key. Plus the documentUpload
// bucket, 10/min per user (same as the internal route — prevents a single
// key from spamming uploads).
//
// RESPONSE: 201 with the new version metadata, or 4xx with an error.
// =============================================================================

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ unionId: string }> },
) {
  const { unionId } = await params;

  // --- 1. Auth + scope check -------------------------------------------------
  const user = await getAuthUserOrApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasScope(user, "documents:write")) {
    return NextResponse.json(
      { error: "Your API key does not have the 'documents:write' scope." },
      { status: 403 },
    );
  }
  // Inspector is always read-only, even with an API key
  if (user.role === Role.INSPECTOR) {
    return NextResponse.json(
      { error: "Inspectors have read-only access." },
      { status: 403 },
    );
  }
  // Officer/Representative scoping
  const isUnionScopedRole = user.role === Role.OFFICER || user.role === Role.REPRESENTATIVE;
  if (isUnionScopedRole && user.assignedUnionId !== unionId) {
    return NextResponse.json(
      { error: "You can only submit documents for your own union." },
      { status: 403 },
    );
  }

  // --- 2. Rate limit (apiV1 bucket + documentUpload bucket) -----------------
  const rateLimitKey = user.scopes ? `apikey:${user.id}` : `user:${user.id}`;
  const rlApi = checkRateLimit(
    "apiV1",
    rateLimitKey,
    RATE_LIMITS.apiV1.max,
    RATE_LIMITS.apiV1.windowMs,
  );
  if (!rlApi.allowed) return rateLimitedResponse(rlApi);
  const rlUpload = checkRateLimit(
    "documentUpload",
    user.id,
    RATE_LIMITS.documentUpload.max,
    RATE_LIMITS.documentUpload.windowMs,
  );
  if (!rlUpload.allowed) return rateLimitedResponse(rlUpload);
  const rlHeaders = { ...rateLimitHeaders(rlApi), ...rateLimitHeaders(rlUpload) };

  // --- 3. Verify the union exists -------------------------------------------
  const existingUnion = await db.union.findUnique({
    where: { id: unionId },
    select: { id: true, unionName: true },
  });
  if (!existingUnion) {
    return NextResponse.json(
      { error: "Union not found." },
      { status: 404, headers: rlHeaders },
    );
  }

  // --- 4. Parse FormData ----------------------------------------------------
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid request. Expected multipart/form-data with 'file', 'documentType', and 'title' fields.",
      },
      { status: 400, headers: rlHeaders },
    );
  }

  const file = formData.get("file");
  const documentType = formData.get("documentType");
  const title = formData.get("title");
  const effectiveDateStr = formData.get("effectiveDate");

  let effectiveDate: Date | null = null;
  if (effectiveDateStr && typeof effectiveDateStr === "string" && effectiveDateStr.trim().length > 0) {
    const parsed = new Date(effectiveDateStr.trim());
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Invalid 'effectiveDate'. Expected an ISO 8601 date string (e.g., 2026-01-01)." },
        { status: 400, headers: rlHeaders },
      );
    }
    effectiveDate = parsed;
  }

  // Validate required fields
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing or invalid 'file'. Expected a File upload." },
      { status: 400, headers: rlHeaders },
    );
  }
  if (!documentType || typeof documentType !== "string" || documentType.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid 'documentType'. Expected a non-empty string." },
      { status: 400, headers: rlHeaders },
    );
  }
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid 'title'. Expected a non-empty string." },
      { status: 400, headers: rlHeaders },
    );
  }

  // --- 5. File size validation ----------------------------------------------
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty." }, { status: 400, headers: rlHeaders });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.` },
      { status: 413, headers: rlHeaders },
    );
  }

  // --- 6. Extract file extension + read buffer ------------------------------
  const originalName = file.name || "untitled";
  const fileExtension = path.extname(originalName).toLowerCase() || null;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // --- 7. PDF integrity check (same as internal route) ---------------------
  if (fileExtension === ".pdf") {
    if (!hasPdfMagicBytes(buffer)) {
      return NextResponse.json(
        {
          error:
            "File has a .pdf extension but is not a valid PDF (missing %PDF- magic bytes). " +
            "Please upload the original file or convert it to PDF before uploading.",
        },
        { status: 400, headers: rlHeaders },
      );
    }
    const pdfValid = await validatePdfIntegrity(buffer);
    if (!pdfValid) {
      return NextResponse.json(
        {
          error:
            "The PDF file appears to be corrupt or incomplete (pdfinfo failed to parse it). " +
            "Please re-export or re-download the PDF and try uploading again.",
        },
        { status: 400, headers: rlHeaders },
      );
    }
  }

  // --- 8. SHA-256 checksum + duplicate detection ---------------------------
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const existingDoc = await db.document.findUnique({
    where: { unionId_documentType: { unionId, documentType: documentType.trim() } },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  if (existingDoc && existingDoc.versions[0]?.checksum === checksum) {
    return NextResponse.json(
      {
        error: "Duplicate file detected. The latest version of this document type has the same SHA-256 checksum.",
        documentId: existingDoc.id,
        latestVersionNumber: existingDoc.versions[0].versionNumber,
      },
      { status: 409, headers: rlHeaders },
    );
  }

  // --- 9. Compute version number + file paths ------------------------------
  const versionNumber = existingDoc
    ? (existingDoc.versions[0]?.versionNumber ?? 0) + 1
    : 1;
  const documentId = existingDoc?.id ?? crypto.randomUUID();
  const relativeFilePath = path.posix.join(
    "unions",
    unionId,
    documentId,
    `${versionNumber}.bin`,
  );
  const absoluteFilePath = path.join(STORAGE_ROOT, relativeFilePath);
  const tmpFilePath = `${absoluteFilePath}.tmp`;

  // --- 10. Atomic write (.tmp → rename) ------------------------------------
  await fs.mkdir(path.dirname(absoluteFilePath), { recursive: true });
  try {
    await fs.writeFile(tmpFilePath, buffer);
    await fs.rename(tmpFilePath, absoluteFilePath);
  } catch (err) {
    try { await fs.unlink(tmpFilePath); } catch {}
    console.error("[v1/documents/submit] File write failed:", err);
    return NextResponse.json(
      { error: "Failed to write file to disk." },
      { status: 500, headers: rlHeaders },
    );
  }

  // --- 11. DB transaction (Document + DocumentVersion + review status) -----
  try {
    const result = await db.$transaction(async (tx) => {
      if (!existingDoc) {
        await tx.document.create({
          data: { id: documentId, unionId, documentType: documentType.trim() },
        });
      }
      const newVersion = await tx.documentVersion.create({
        data: {
          documentId,
          versionNumber,
          fileName: title.trim(),
          filePath: relativeFilePath,
          fileSize: buffer.length,
          checksum,
          fileExtension,
          uploadedById: user.id,
          supersedesVersionId: existingDoc?.currentVersionId ?? null,
          effectiveDate,
        },
      });
      // External submissions ALWAYS enter PENDING review
      await tx.document.update({
        where: { id: documentId },
        data: {
          currentVersionId: newVersion.id,
          reviewStatus: ReviewStatus.PENDING,
          reviewedById: null,
          reviewedAt: null,
          rejectionReason: null,
        },
      });
      return { documentId, documentType: documentType.trim(), newVersion };
    });

    // --- 12. Side effects: notify Registrars + audit log + webhook ----------
    try {
      const registrars = await db.user.findMany({
        where: { role: Role.REGISTRAR, disabled: false },
        select: { id: true },
      });
      for (const registrar of registrars) {
        await createNotificationForUsers([registrar.id], {
          type: NotificationType.TASK,
          title: `${existingUnion.unionName}: ${documentType.trim()} submitted via API`,
          body: `Version ${versionNumber} of "${documentType.trim()}" was submitted by ${user.email} via the v1 API. Please review it in the Review Queue.`,
          dedupKey: `review:${documentId}:${versionNumber}:${registrar.id}`,
          linkUrl: `/reviews`,
        });
      }
      await db.auditLog.create({
        data: {
          actorId: user.id,
          actorName: user.email,
          action: "document_upload_api_v1",
          entityType: "Document",
          entityId: documentId,
          afterJson: JSON.stringify({
            documentType: documentType.trim(),
            unionId,
            unionName: existingUnion.unionName,
            versionNumber,
            versionId: result.newVersion.id,
            fileName: result.newVersion.fileName,
            fileSize: result.newVersion.fileSize,
            checksum: result.newVersion.checksum,
            reviewStatus: "PENDING",
            source: "api_v1",
          }),
          severity: Severity.INFO,
        },
      });

      // Dispatch webhook event (best-effort)
      await dispatchEvent({
        eventType: WebhookEventType.DOCUMENT_UPLOADED,
        payload: {
          documentId,
          documentType: documentType.trim(),
          unionId,
          unionName: existingUnion.unionName,
          versionNumber,
          versionId: result.newVersion.id,
          uploadedBy: user.email,
          source: "api_v1",
        },
      });
    } catch (sideEffectErr) {
      console.error("[v1/documents/submit] Side-effect failed:", sideEffectErr);
    }

    // --- 13. Return 201 with the new version metadata ----------------------
    return NextResponse.json(
      {
        documentId: result.documentId,
        documentType: result.documentType,
        reviewStatus: "PENDING",
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
      { status: 201, headers: rlHeaders },
    );
  } catch (err) {
    // Compensation: delete the file we wrote
    try { await fs.unlink(absoluteFilePath); } catch {}
    console.error("[v1/documents/submit] DB transaction failed:", err);
    return NextResponse.json(
      { error: "Failed to create document record. The uploaded file has been cleaned up." },
      { status: 500, headers: rlHeaders },
    );
  }
}
