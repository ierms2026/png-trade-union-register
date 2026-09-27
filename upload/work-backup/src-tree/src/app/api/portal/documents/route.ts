import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";

// =============================================================================
// GET /api/portal/documents
// -----------------------------------------------------------------------------
// Chunk 5: List documents for the rep's assigned union. Includes the latest
// version metadata + review status. Reps see ALL their union's documents
// (not just isPublic ones — they're the union's own rep).
//
// RESPONSE SHAPE:
//   {
//     documents: Array<{
//       id, documentType, reviewStatus, reviewedAt, rejectionReason,
//       disposedAt, snoozedUntil, createdAt, updatedAt,
//       latestVersion: {
//         id, versionNumber, fileName, fileSize, fileExtension,
//         uploadedAt, uploadedByEmail
//       } | null
//     }>
//   }
//
// SORT: reviewStatus PENDING first (so the rep sees what's awaiting review),
// then by documentType alphabetically.
// =============================================================================

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "REPRESENTATIVE") {
    return NextResponse.json(
      { error: "This endpoint is for union representatives only." },
      { status: 403 },
    );
  }
  if (!user.assignedUnionId) {
    return NextResponse.json(
      { error: "No assigned union. Contact the Registrar." },
      { status: 400 },
    );
  }

  const documents = await db.document.findMany({
    where: { unionId: user.assignedUnionId },
    select: {
      id: true,
      documentType: true,
      reviewStatus: true,
      reviewedAt: true,
      rejectionReason: true,
      disposedAt: true,
      snoozedUntil: true,
      createdAt: true,
      updatedAt: true,
      currentVersionId: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          id: true,
          versionNumber: true,
          fileName: true,
          fileSize: true,
          fileExtension: true,
          uploadedAt: true,
          uploadedById: true,
        },
      },
    },
  });

  // Map to a cleaner shape + fetch uploader emails in one go.
  const uploaderIds = Array.from(
    new Set(
      documents
        .map((d) => d.versions[0]?.uploadedById)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const uploaders = await db.user.findMany({
    where: { id: { in: uploaderIds } },
    select: { id: true, email: true },
  });
  const uploaderMap = new Map(uploaders.map((u) => [u.id, u.email]));

  const docs = documents.map((d) => {
    const v = d.versions[0] ?? null;
    return {
      id: d.id,
      documentType: d.documentType,
      reviewStatus: d.reviewStatus,
      reviewedAt: d.reviewedAt,
      rejectionReason: d.rejectionReason,
      disposedAt: d.disposedAt,
      snoozedUntil: d.snoozedUntil,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      latestVersion: v
        ? {
            id: v.id,
            versionNumber: v.versionNumber,
            fileName: v.fileName,
            fileSize: v.fileSize,
            fileExtension: v.fileExtension,
            uploadedAt: v.uploadedAt,
            uploadedByEmail: v.uploadedById ? (uploaderMap.get(v.uploadedById) ?? "Unknown") : "Unknown",
          }
        : null,
    };
  });

  // Sort: PENDING first, then by documentType
  docs.sort((a, b) => {
    const aPending = a.reviewStatus === "PENDING" ? 0 : 1;
    const bPending = b.reviewStatus === "PENDING" ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return a.documentType.localeCompare(b.documentType);
  });

  return NextResponse.json({ documents: docs });
}
