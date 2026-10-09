import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/prisma";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";

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
//
// AUTH:
//   - REGISTRAR / INSPECTOR: any document in any union.
//   - OFFICER: only documents in their own union (assignedUnionId check).
//   - API KEY: accepted with `documents:read` scope. Officer-scoped keys
//     still get the Officer scoping check — a key can't escape its owner's
//     union.
// =============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ unionId: string; documentId: string }> },
) {
  const { unionId, documentId } = await params;

  const user = await getAuthUserOrApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // API-key callers must have the `documents:read` scope.
  if (!hasScope(user, "documents:read")) {
    return NextResponse.json(
      { error: "Your API key does not have the 'documents:read' scope." },
      { status: 403 },
    );
  }

  // Officer scoping — an Officer must not be able to read another union's
  // version history by guessing IDs. The 403 (not 404) is intentional: by
  // the time we get here, we've already authenticated the user; we're
  // refusing to authorize cross-union access, not denying existence.
  if (user.role === Role.OFFICER && user.assignedUnionId !== unionId) {
    return NextResponse.json(
      { error: "You can only view documents in your own union." },
      { status: 403 },
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
