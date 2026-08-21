import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db } from "@/lib/prisma";

// =============================================================================
// GET /api/public/files/[id]
// -----------------------------------------------------------------------------
// PUBLIC file download. The [id] is a DocumentVersion ID.
//
// SECURITY — INDISTINGUISHABLE 404s:
//   For ALL failure modes (file not found on disk, version not found in
//   DB, version's document is disposed, version's document type isn't
//   in the public whitelist), we return the SAME 404 response. This
//   prevents an attacker from probing to discover:
//     - which version IDs exist
//     - which document types a union has filed
//     - whether a document was disposed
//
//   The response body is identical for every failure: a generic 404.
//   The status code is identical. The timing is roughly identical (we
//   do the same DB queries regardless of outcome).
//
// PUBLIC DOC WHITELIST:
//   Only Registration Certificate + Constitution versions are downloadable.
//   The version's document type must be in this list, AND the document
//   must not be disposed.
// =============================================================================

const PUBLIC_DOC_TYPES = ["Registration Certificate", "Constitution"];
const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");

const NOT_FOUND_RESPONSE = NextResponse.json(
  { error: "File not found." },
  { status: 404 },
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // --- 1. Load the version + its document + union ------------------------
  const version = await db.documentVersion.findUnique({
    where: { id },
    select: {
      id: true,
      fileName: true,
      filePath: true,
      fileExtension: true,
      fileSize: true,
      document: {
        select: {
          id: true,
          documentType: true,
          disposedAt: true,
        },
      },
    },
  });

  if (!version) return NOT_FOUND_RESPONSE;

  // --- 2. Whitelist check (indistinguishable 404 if not public) ---------
  if (!PUBLIC_DOC_TYPES.includes(version.document.documentType)) {
    return NOT_FOUND_RESPONSE;
  }
  if (version.document.disposedAt) {
    return NOT_FOUND_RESPONSE;
  }

  // --- 3. Read the file from disk ----------------------------------------
  const absolutePath = path.join(STORAGE_ROOT, version.filePath);
  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(absolutePath);
  } catch {
    // File missing on disk — indistinguishable 404 (don't reveal it
    // existed in the DB).
    return NOT_FOUND_RESPONSE;
  }

  // --- 4. Serve the file -------------------------------------------------
  // Content-Type: default to application/pdf (the spec is about PDFs).
  // If the extension is something else, we'd branch here.
  const contentType =
    version.fileExtension === ".pdf"
      ? "application/pdf"
      : "application/octet-stream";

  // Content-Disposition: inline so the browser shows the PDF in-page
  // (rather than forcing a download). The user can still save via the
  // browser's print/save dialog.
  const fileName = `${version.fileName}${version.fileExtension ?? ""}`;

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(fileBuffer.length),
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, max-age=3600", // cache for 1h on the client
    },
  });
}
