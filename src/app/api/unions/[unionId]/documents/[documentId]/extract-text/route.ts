import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";
import { checkArchival } from "@/lib/document-archive";
import { extractTextFromFile } from "@/lib/auth/text-extraction";

// =============================================================================
// POST /api/unions/[unionId]/documents/[documentId]/extract-text
// -----------------------------------------------------------------------------
// Extracts text content from a document's latest version and stores it in
// the DocumentVersion.textContent field for full-text search.
//
// This endpoint is called:
//   1. Automatically after document upload (in the upload route)
//   2. Manually via a "Extract Text" button in the UI (for docs uploaded
//      before text extraction was added)
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
  if (user.role === Role.OFFICER && user.assignedUnionId !== unionId) {
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

  // Extract text from the file
  const textContent = await extractTextFromFile(
    latestVersion.filePath,
    latestVersion.fileExtension,
  );

  if (!textContent) {
    return NextResponse.json(
      {
        documentId,
        versionId: latestVersion.id,
        textContent: null,
        message: "No text could be extracted. The file may be a scanned image or an unsupported format.",
      },
      { status: 200 },
    );
  }

  // Persist the extracted text
  await db.documentVersion.update({
    where: { id: latestVersion.id },
    data: { textContent },
  });

  // Audit log: record the text extraction
  await db.auditLog.create({
    data: {
      actorId: user.id, actorName: user.email,
      action: "document_text_extracted",
      entityType: "DocumentVersion", entityId: latestVersion.id,
      afterJson: JSON.stringify({
        documentId, documentType: doc.documentType, unionId,
        versionNumber: latestVersion.versionNumber, textLength: textContent.length,
      }),
      severity: Severity.INFO,
    },
  });

  return NextResponse.json({
    documentId,
    versionId: latestVersion.id,
    textContent,
    alreadyExtracted: false,
    textLength: textContent.length,
  });
}
