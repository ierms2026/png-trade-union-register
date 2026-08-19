import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";

// =============================================================================
// GET /api/unions/[unionId]/documents/[documentId]/versions
// -----------------------------------------------------------------------------
// Returns the full version chain for a document — every version with its
// uploader, timestamp, file size, and checksum.
//
// The version chain is ordered by versionNumber DESC (newest first) so the
// UI shows the current version at the top of the list.
//
// This endpoint powers the "Version History" dialog in the union detail view.
// =============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ unionId: string; documentId: string }> },
) {
  const { unionId, documentId } = await params;

  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        select: {
          id: true,
          versionNumber: true,
          fileName: true,
          fileSize: true,
          checksum: true,
          fileExtension: true,
          uploadedById: true,
          uploadedAt: true,
        },
      },
    },
  });

  if (!doc) {
    return NextResponse.json(
      { error: "Document not found." },
      { status: 404 },
    );
  }

  // Serialize dates
  const versions = doc.versions.map((v) => ({
    ...v,
    uploadedAt: v.uploadedAt.toISOString(),
    isCurrent: v.id === doc.currentVersionId,
  }));

  return NextResponse.json({
    documentId: doc.id,
    documentType: doc.documentType,
    currentVersionId: doc.currentVersionId,
    disposedAt: doc.disposedAt?.toISOString() ?? null,
    versions,
  });
}
