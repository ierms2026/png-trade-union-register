import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";

// =============================================================================
// GET /api/public/unions/[id]
// -----------------------------------------------------------------------------
// PUBLIC endpoint — no auth required. Returns a single union's public
// details + ONLY Certificate/Constitution documents (the ones a member
// or researcher would legitimately want to verify).
//
// WHY ONLY Certificate + Constitution:
//   Other document types (Financial Returns, Election of Office Bearers,
//   Secret Ballots, etc.) contain sensitive internal info. The public
//   portal exposes only the documents whose verification is a legitimate
//   public interest: "Is this union really registered? What's their
//   governing document?"
//
// FILE DOWNLOADS:
//   The documents include a `fileUrl` pointing at /api/public/files/[id]
//   — the secure download endpoint that serves the file content.
// =============================================================================

const PUBLIC_DOC_TYPES = ["IO-02", "IO-03"];

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
          documentType: { in: PUBLIC_DOC_TYPES },
          disposedAt: null, // don't expose disposed docs
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
