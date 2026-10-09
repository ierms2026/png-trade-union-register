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
// GET /api/unions/[unionId]/documents/[documentId]/versions/[versionId]/download
// -----------------------------------------------------------------------------
// Chunk 11 fix: serves a SPECIFIC version of a document by versionId.
//
// The existing download route
// (/api/unions/[unionId]/documents/[documentId]/download) serves the current
// version by default, or a historical version via ?version=N (version NUMBER).
// But the chunk-11 views (Documents list, Document Detail, Portal Documents)
// construct URLs with the version ID (not number) in the path:
//   /api/unions/.../versions/${versionId}/download
//
// This route resolves the versionId → looks up the file → serves it. It shares
// the same auth, scoping, rate-limit, + audit-log logic as the existing route.
//
// AUTH: any authenticated role. OFFICER scoped to their union.
// =============================================================================

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ unionId: string; documentId: string; versionId: string }> },
) {
  const { unionId, documentId, versionId } = await params;

  // --- 1. Auth check -------------------------------------------------------
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- 2. Officer/Representative scoping -----------------------------------
  const isUnionScopedRole = user.role === Role.OFFICER;
  if (isUnionScopedRole && user.assignedUnionId !== unionId) {
    return NextResponse.json(
      { error: "You can only download documents from your own union." },
      { status: 403 },
    );
  }

  // --- 3. Rate limit (30 downloads/min per user) ---------------------------
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

  // --- 4. Fetch the document + the specific version ------------------------
  const doc = await db.document.findFirst({
    where: { id: documentId, unionId },
    include: {
      versions: {
        where: { id: versionId },
        take: 1,
        select: {
          id: true,
          filePath: true,
          fileName: true,
          fileExtension: true,
          versionNumber: true,
        },
      },
    },
  });

  if (!doc) {
    return NextResponse.json(
      { error: "Document not found." },
      { status: 404, headers: rlHeaders },
    );
  }

  const targetVersion = doc.versions[0];
  if (!targetVersion || !targetVersion.filePath) {
    return NextResponse.json(
      { error: "Version not found or no file available." },
      { status: 404, headers: rlHeaders },
    );
  }

  // --- 5. Read the file from disk ------------------------------------------
  const absoluteFilePath = path.join(STORAGE_ROOT, targetVersion.filePath);

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(absoluteFilePath);
  } catch {
    return NextResponse.json(
      { error: "File not found on disk." },
      { status: 404, headers: rlHeaders },
    );
  }

  // --- 6. Serve the file ---------------------------------------------------
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
        documentId,
        documentType: doc.documentType,
        unionId,
        versionId,
        versionNumber: targetVersion.versionNumber,
        fileName: targetVersion.fileName,
        disposed: isDisposed,
        ip,
        userAgent,
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
