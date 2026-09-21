import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";

// =============================================================================
// GET /api/reviews
// Lists documents pending Registrar review (reviewStatus = PENDING, not
// disposed, has at least one version). Computed live — never stored as a
// separate queue table (same pattern as /api/retention).
// AUTH: REGISTRAR only.
// =============================================================================

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json({ error: "Only Registrars can view the review queue." }, { status: 403 });
  }

  const docs = await db.document.findMany({
    where: {
      reviewStatus: "PENDING",
      disposedAt: null,
      currentVersionId: { not: null },
    },
    select: {
      id: true,
      documentType: true,
      unionId: true,
      union: { select: { id: true, unionName: true, registrationNo: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          versionNumber: true,
          fileName: true,
          fileExtension: true,
          uploadedAt: true,
          fileSize: true,
          uploadedById: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Resolve uploader emails in a single IN query (DocumentVersion has
  // uploadedById but no relation to User).
  const uploaderIds = [
    ...new Set(
      docs
        .map((d) => d.versions[0]?.uploadedById)
        .filter((id): id is string => id !== null && id !== undefined),
    ),
  ];
  const uploaders =
    uploaderIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: uploaderIds } },
          select: { id: true, email: true },
        })
      : [];
  const uploaderById = new Map(uploaders.map((u) => [u.id, u.email]));

  const pending = docs.map((doc) => {
    const latest = doc.versions[0];
    return {
      documentId: doc.id,
      documentType: doc.documentType,
      unionId: doc.union.id,
      unionName: doc.union.unionName,
      registrationNo: doc.union.registrationNo,
      versionNumber: latest.versionNumber,
      fileName: latest.fileName,
      fileExtension: latest.fileExtension,
      uploadedAt: latest.uploadedAt.toISOString(),
      uploadedById: latest.uploadedById,
      uploadedByEmail: latest.uploadedById ? uploaderById.get(latest.uploadedById) ?? null : null,
      fileSize: latest.fileSize,
    };
  });

  return NextResponse.json({ pending });
}
