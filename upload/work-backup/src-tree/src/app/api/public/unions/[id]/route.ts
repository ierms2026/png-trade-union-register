import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";

// =============================================================================
// GET /api/public/unions/[id]
// -----------------------------------------------------------------------------
// PUBLIC endpoint — no auth required. Returns a single union's public
// details + ONLY documents the Registrar has explicitly published
// (isPublic: true). The Registrar controls per-document visibility via
// the staff dashboard's "Publish to Public" / "Unpublish" toggle.
//
// FILTERS:
//   - isPublic: true (Registrar must explicitly publish)
//   - disposedAt: null (disposed docs are never public)
//
// FILE DOWNLOADS:
//   The documents include a `fileUrl` pointing at /api/public/files/[id]
//   — the secure download endpoint that serves the file content.
// =============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const union = await db.union.findUnique({
    where: { id },
    select: {
      id: true,
      unionName: true,
      registrationNo: true,
      status: true,
      documents: {
        where: {
          isPublic: true, // Only Registrar-published documents
          disposedAt: null, // Don't expose disposed docs
        },
        select: {
          id: true,
          documentType: true,
          currentVersionId: true,
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: {
              id: true,
              versionNumber: true,
              fileName: true,
              uploadedAt: true,
              fileExtension: true,
            },
          },
        },
      },
    },
  });

  if (!union) {
    return NextResponse.json(
      { error: "Union not found." },
      { status: 404 },
    );
  }

  // Serialize + flatten the latest version + add fileUrl.
  const serialized = {
    ...union,
    documents: union.documents.map((d) => ({
      id: d.id,
      documentType: d.documentType,
      latestVersion: d.versions[0]
        ? {
            ...d.versions[0],
            uploadedAt: d.versions[0].uploadedAt.toISOString(),
          }
        : null,
      fileUrl: d.versions[0] ? `/api/public/files/${d.versions[0].id}` : null,
    })),
  };

  return NextResponse.json({ union: serialized });
}
