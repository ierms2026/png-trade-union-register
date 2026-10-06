import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";
import { checkArchival } from "@/lib/document-archive";
import { extractTextFromFileWithMeta } from "@/lib/auth/text-extraction";

// =============================================================================
// POST /api/unions/[unionId]/documents/[documentId]/extract-text
// -----------------------------------------------------------------------------
// Extracts text content from a document's latest version and stores it in
// the DocumentVersion.textContent field for full-text search.
//
// Chunk 7: This route now uses OCR fallback (pdftoppm + tesseract) for
// scanned PDFs that have no text layer. OCR is SLOW (30-60s for a 10-page
// scanned PDF) — the caller should expect long response times.
//
// This endpoint is called:
//   1. Manually via a "Extract Text" button in the UI (for docs uploaded
//      before text extraction was added, or scanned PDFs that need OCR)
//   2. By the backfill script (scripts/backfill-text-content.ts)
//
// Note: the upload route's auto-extraction (chunk 6) does NOT use OCR —
// it uses pdftotext only (fast). Scanned PDFs uploaded via the upload
// route get textContent=null until this endpoint is called manually.
//
// AUTH: REGISTRAR + OFFICER (Inspectors read-only). Officer scoping enforced.
// =============================================================================

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
  // Chunk 5: REPRESENTATIVE scoping (same as OFFICER)
  const isUnionScopedRole = user.role === Role.OFFICER;
  if (isUnionScopedRole && user.assignedUnionId !== unionId) {
    return NextResponse.json(
      { error: "You can only extract text from your own union's documents." },
      { status: 403 },
    );
  }

  // Find the document + its latest version
  const doc = await db.document.findFirst({
    where: { id: documentId, unionId },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });

  if (!doc) {
    return NextResponse.json(
      { error: "Document not found." },
      { status: 404 },
    );
  }

  const latestVersion = doc.versions[0];
  if (!latestVersion) {
    return NextResponse.json(
      { error: "No version available for this document." },
      { status: 404 },
    );
  }

  // Archival lockdown — block text extraction on archived documents.
  const archivalCheck = checkArchival(doc);
  if (archivalCheck) return archivalCheck;

  // If text is already extracted, return it (idempotent)
  if (latestVersion.textContent) {
    return NextResponse.json({
      documentId,
      versionId: latestVersion.id,
      textContent: latestVersion.textContent,
      alreadyExtracted: true,
      textLength: latestVersion.textContent.length,
    });
  }

  // Extract text from the file WITH OCR fallback (chunk 7).
  // This is the slow path — pdftotext first, then pdftoppm + tesseract
  // if the PDF is scanned. Can take 30-60s for a 10-page scanned PDF.
  const result = await extractTextFromFileWithMeta(
    latestVersion.filePath,
    latestVersion.fileExtension,
    { useOcr: true },
  );

  if (!result.text) {
    return NextResponse.json(
      {
        documentId,
        versionId: latestVersion.id,
        textContent: null,
        message: "No text could be extracted. The file may be an unsupported format, or OCR failed on all pages.",
        method: result.method,
        ocrPages: result.ocrPages,
      },
      { status: 200 },
    );
  }

  // Persist the extracted text
  await db.documentVersion.update({
    where: { id: latestVersion.id },
    data: { textContent: result.text },
  });

  // Audit log: record the text extraction (includes method + page count)
  await db.auditLog.create({
    data: {
      actorId: user.id, actorName: user.email,
      action: "document_text_extracted",
      entityType: "DocumentVersion", entityId: latestVersion.id,
      afterJson: JSON.stringify({
        documentId, documentType: doc.documentType, unionId,
        versionNumber: latestVersion.versionNumber,
        textLength: result.text.length,
        method: result.method, // "pdftotext" or "ocr"
        ocrPages: result.ocrPages,
        source: "manual_route",
      }),
      severity: Severity.INFO,
    },
  });

  return NextResponse.json({
    documentId,
    versionId: latestVersion.id,
    textContent: result.text,
    alreadyExtracted: false,
    textLength: result.text.length,
    method: result.method,
    ocrPages: result.ocrPages,
  });
}
