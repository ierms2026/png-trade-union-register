import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser, getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { Role, ReviewStatus } from "@prisma/client";
import { getUnionScope } from "@/lib/auth/union-scope";

// =============================================================================
// GET /api/documents
// -----------------------------------------------------------------------------
// Chunk 11: Cross-union document list. Returns all documents (or filtered by
// union/documentType/reviewStatus) with their latest version metadata.
//
// AUTH: Session OR API key with `documents:read` scope. Role scoping:
//   - REGISTRAR + INSPECTOR → all unions
//   - OFFICER → their assigned union only
//
// QUERY PARAMS (all optional):
//   unionId          — filter to a specific union
//   documentType     — filter to a specific document type
//   reviewStatus     — filter to PENDING | APPROVED | REJECTED
//   includeDisposed  — if "true", include disposed documents (default: false)
//   q                — search within fileName (NOT textContent — use /api/search for that)
//
// RESPONSE SHAPE:
//   {
//     documents: [{
//       id, documentType, reviewStatus, reviewedAt, rejectionReason,
//       disposedAt, snoozedUntil, createdAt, updatedAt,
//       union: { id, unionName, registrationNo, status },
//       latestVersion: { id, versionNumber, fileName, fileSize, fileExtension,
//                        uploadedAt, uploadedByEmail } | null
//     }],
//     count: number,
//     filters: { unionId, documentType, reviewStatus, includeDisposed }
//   }
// =============================================================================

export async function GET(req: NextRequest) {
  // Try API key first, fall back to session
  const user = await getAuthUserOrApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!hasScope(user, "documents:read")) {
    return NextResponse.json(
      { error: "Your API key does not have the 'documents:read' scope." },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const unionId = url.searchParams.get("unionId") || undefined;
  const documentType = url.searchParams.get("documentType") || undefined;
  const reviewStatusParam = url.searchParams.get("reviewStatus");
  const includeDisposed = url.searchParams.get("includeDisposed") === "true";
  const q = url.searchParams.get("q") || undefined;

  // Validate reviewStatus param
  let reviewStatus: ReviewStatus | undefined;
  if (reviewStatusParam && ["PENDING", "APPROVED", "REJECTED"].includes(reviewStatusParam)) {
    reviewStatus = reviewStatusParam as ReviewStatus;
  }

  // Build the where clause with role scoping
  const where: Record<string, unknown> = {};

  const scope = getUnionScope({ role: user.role, assignedUnionId: user.assignedUnionId });
  if (scope.kind === "none") {
    return NextResponse.json({ error: "Forbidden: your account is not assigned to a union." }, { status: 403 });
  }
  if (scope.kind === "union") {
    where.unionId = scope.unionId;
  } else if (unionId) {
    where.unionId = unionId;
  }

  // Exclude disposed docs by default (they're "gone from active views")
  if (!includeDisposed) {
    where.disposedAt = null;
  }

  // Filter by documentType
  if (documentType) {
    where.documentType = documentType;
  }

  // Filter by reviewStatus
  if (reviewStatus) {
    where.reviewStatus = reviewStatus;
  }

  // Search within fileName (via the latest version relation)
  // Note: this searches fileName, NOT textContent. Use /api/search for full-text search.
  if (q) {
    where.versions = {
      some: { fileName: { contains: q } },
    };
  }

  const documents = await db.document.findMany({
    where,
    orderBy: [{ reviewStatus: "asc" }, { updatedAt: "desc" }],
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
      union: {
        select: { id: true, unionName: true, registrationNo: true, status: true },
      },
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

  // Fetch uploader emails in one go (avoids N+1 queries)
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

  // Build the result array
  const result = documents.map((d) => {
    const v = d.versions[0] ?? null;
    return {
      id: d.id,
      documentType: d.documentType,
      reviewStatus: d.reviewStatus,
      reviewedAt: d.reviewedAt?.toISOString() ?? null,
      rejectionReason: d.rejectionReason,
      disposedAt: d.disposedAt?.toISOString() ?? null,
      snoozedUntil: d.snoozedUntil?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      union: d.union,
      latestVersion: v
        ? {
            id: v.id,
            versionNumber: v.versionNumber,
            fileName: v.fileName,
            fileSize: v.fileSize,
            fileExtension: v.fileExtension,
            uploadedAt: v.uploadedAt.toISOString(),
            uploadedByEmail: v.uploadedById ? (uploaderMap.get(v.uploadedById) ?? "Unknown") : "Unknown",
          }
        : null,
    };
  });

  return NextResponse.json({
    documents: result,
    count: result.length,
    filters: {
      unionId: unionId ?? null,
      documentType: documentType ?? null,
      reviewStatus: reviewStatus ?? null,
      includeDisposed,
      q: q ?? null,
    },
  });
}
