import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";

// =============================================================================
// GET /api/reviews
// -----------------------------------------------------------------------------
// Lists documents pending Registrar review. Wave 3 / Item 1: TWO BUCKETS:
//   - pending: documents with NO first approval yet (firstApprovedAt = null).
//     These need a first Registrar to click "Approve".
//   - awaitingSecondApproval: documents with first approval (firstApprovedAt
//     != null) but reviewStatus still PENDING. These need a DIFFERENT
//     Registrar (not the first approver) to click "Approve" to finalize.
//
// Both buckets are computed live from Document rows (no separate queue table
// — same pattern as /api/retention). AUTH: REGISTRAR only.
//
// Each item includes firstApprovedById + firstApprovedAt + firstApproverEmail
// so the UI can:
//   - Show a "First approved by X at Y" badge in the second bucket.
//   - Show a "Withdraw" button ONLY to the first approver.
//   - Show a "Cannot second your own approval" message to the first approver.
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
      firstApprovedById: true,
      firstApprovedAt: true,
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

  // Resolve uploader emails + first-approver emails in two batched queries
  // (DocumentVersion has uploadedById but no relation to User; Document has
  // firstApprovedById but no relation to User either — same pattern as the
  // existing uploader lookup).
  const uploaderIds = [
    ...new Set(
      docs
        .map((d) => d.versions[0]?.uploadedById)
        .filter((id): id is string => id !== null && id !== undefined),
    ),
  ];
  const firstApproverIds = [
    ...new Set(
      docs
        .map((d) => d.firstApprovedById)
        .filter((id): id is string => id !== null && id !== undefined),
    ),
  ];
  const allUserIds = [...new Set([...uploaderIds, ...firstApproverIds])];

  const users =
    allUserIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: allUserIds } },
          select: { id: true, email: true },
        })
      : [];
  const userEmailById = new Map(users.map((u) => [u.id, u.email]));

  // Split into the two buckets.
  const pending: ReviewItem[] = [];
  const awaitingSecondApproval: ReviewItem[] = [];
  for (const doc of docs) {
    const latest = doc.versions[0];
    const item: ReviewItem = {
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
      uploadedByEmail: latest.uploadedById ? userEmailById.get(latest.uploadedById) ?? null : null,
      fileSize: latest.fileSize,
      firstApprovedById: doc.firstApprovedById,
      firstApprovedAt: doc.firstApprovedAt?.toISOString() ?? null,
      firstApproverEmail: doc.firstApprovedById ? userEmailById.get(doc.firstApprovedById) ?? null : null,
    };
    if (doc.firstApprovedAt !== null) {
      awaitingSecondApproval.push(item);
    } else {
      pending.push(item);
    }
  }

  return NextResponse.json({ pending, awaitingSecondApproval });
}

interface ReviewItem {
  documentId: string;
  documentType: string;
  unionId: string;
  unionName: string;
  registrationNo: string;
  versionNumber: number;
  fileName: string;
  fileExtension: string | null;
  uploadedAt: string;
  uploadedById: string | null;
  uploadedByEmail: string | null;
  fileSize: number;
  // Wave 3 / Item 1: two-person approval workflow metadata.
  firstApprovedById: string | null;
  firstApprovedAt: string | null;
  firstApproverEmail: string | null;
}
