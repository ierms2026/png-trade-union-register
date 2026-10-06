import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";
import {
  checkRateLimit,
  rateLimitedResponse,
  rateLimitHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";

// =============================================================================
// GET /api/unions/[unionId]/documents/[documentId]/download
// -----------------------------------------------------------------------------
// Authenticated document download — serves the file from disk.
//
// Unlike the public download endpoint (/api/public/files/[id]) which only
// serves Certificate/Constitution documents, this endpoint serves ANY
// document type to authenticated users. The role-based access is:
//   - REGISTRAR: can download any document from any union
//   - INSPECTOR: can download any document from any union (read-only oversight)
//   - OFFICER: can only download documents from their own union
//
// Disposed documents are still downloadable (for audit/forensic purposes) —
// the disposedAt flag prevents them from appearing in active views, but
// the file stays on disk and the audit trail needs to be able to retrieve it.
// =============================================================================

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ unionId: string; documentId: string }> },
) {
  const { unionId, documentId } = await params;

  // --- 1. Auth check — any authenticated role ------------------------------
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- 2. Officer/Representative scoping — can only access their own union's docs ---
  const isUnionScopedRole = user.role === Role.OFFICER;
  if (isUnionScopedRole && user.assignedUnionId !== unionId) {
    return NextResponse.json(
      { error: "You can only download documents from your own union." },
      { status: 403 },
    );
  }

  // --- 2b. Rate limit — 30 downloads/min per user --------------------------
  //     Per-userId: stops a stolen session cookie from scraping every
  //     document in the system. 30/min is generous for normal browsing
  //     (clicking through 5-10 docs in a row) but blocks a script.
  const rl = checkRateLimit(
    "documentDownload",
    user.id,
    RATE_LIMITS.documentDownload.max,
    RATE_LIMITS.documentDownload.windowMs,
  );
  if (!rl.allowed) {
    return rateLimitedResponse(rl);
  }
  const rlHeaders = rateLimitHeaders(rl);

  // --- 3. Fetch the document + versions -----------------------------------
  // By default we serve the LATEST version. If a `?version=N` query param
  // is present, we serve that specific historical version.
  const requestedVersion = req.nextUrl.searchParams.get("version");
  const requestedVersionNum = requestedVersion
    ? parseInt(requestedVersion, 10)
    : null;

  const doc = await db.document.findFirst({
    where: { id: documentId, unionId },
    include: {
      versions: {
        where:
          requestedVersionNum !== null && !Number.isNaN(requestedVersionNum)
            ? { versionNumber: requestedVersionNum }
            : undefined,
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { id: true, filePath: true, fileName: true, fileExtension: true, versionNumber: true },
      },
    },
  });

  if (!doc) {
    return NextResponse.json(
      { error: "Document not found." },
      { status: 404 },
    );
  }

  const targetVersion = doc.versions[0];
  if (!targetVersion || !targetVersion.filePath) {
    return NextResponse.json(
      { error: "No file available for this document." },
      { status: 404 },
    );
  }

  // --- 4. Read the file from disk ------------------------------------------
  const absoluteFilePath = path.join(STORAGE_ROOT, targetVersion.filePath);

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(absoluteFilePath);
  } catch {
    return NextResponse.json(
      { error: "File not found on disk." },
      { status: 404 },
    );
  }

  // --- 5. Serve the file ---------------------------------------------------
  const ext = targetVersion.fileExtension?.toLowerCase();
  const contentTypes: Record<string, string> = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
  };
  const contentType = contentTypes[ext || ""] || "application/octet-stream";
  const fileName = targetVersion.fileName || "document";

  // AUDIT: log the download
  const isDisposed = !!doc.disposedAt;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;
  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "document_download",
      entityType: "DocumentVersion",
      entityId: targetVersion.id,
      afterJson: JSON.stringify({
        documentId, documentType: doc.documentType, unionId,
        versionNumber: targetVersion.versionNumber,
        fileName: targetVersion.fileName, disposed: isDisposed, ip, userAgent,
      }),
      severity: isDisposed ? Severity.WARNING : Severity.INFO,
    },
  }).catch(() => { /* audit-log failures must never block download */ });

  return new NextResponse(fileBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${fileName}${ext || ""}"`,
      "Content-Length": String(fileBuffer.length),
      "Cache-Control": "private, no-cache",
      ...rlHeaders,
    },
  });
}
