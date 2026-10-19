import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";
import {
  calculateStatus,
  computeExpiryDateFromApproval,
} from "@/lib/compliance/calculator";

// =============================================================================
// GET /api/documents/[id]
// -----------------------------------------------------------------------------
// Chunk 11: Document detail — full metadata + version history + union info.
//
// AUTH: Session OR API key with `documents:read` scope. Role scoping:
//   - REGISTRAR + INSPECTOR → any document
//   - OFFICER → only their own union's documents
//
// RESPONSE SHAPE:
//   {
//     document: {
//       id, documentType, reviewStatus, reviewedAt, rejectionReason,
//       disposedAt, snoozedUntil, createdAt, updatedAt,
//       union: { id, unionName, registrationNo, status, address, ... },
//       versions: [{
//         id, versionNumber, fileName, filePath, fileSize, fileExtension,
//         checksum, uploadedAt, uploadedByEmail, effectiveDate
//       }]
//     }
//   }
// =============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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

  const doc = await db.document.findUnique({
    where: { id },
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
        select: {
          id: true,
          unionName: true,
          registrationNo: true,
          status: true,
          address: true,
          contactPerson: true,
          contactEmail: true,
          contactPhone: true,
        },
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        select: {
          id: true,
          versionNumber: true,
          fileName: true,
          filePath: true,
          fileSize: true,
          fileExtension: true,
          checksum: true,
          uploadedAt: true,
          uploadedById: true,
          effectiveDate: true,
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

  // Role scoping: Officers/Reps can only see their own union's documents
  const isUnionScopedRole = user.role === Role.OFFICER;
  if (isUnionScopedRole && user.assignedUnionId !== doc.union.id) {
    return NextResponse.json(
      { error: "You can only view documents for your own union." },
      { status: 403 },
    );
  }

  // Fetch uploader emails for all versions
  const uploaderIds = Array.from(
    new Set(doc.versions.map((v) => v.uploadedById).filter((id): id is string => Boolean(id))),
  );
  const uploaders = await db.user.findMany({
    where: { id: { in: uploaderIds } },
    select: { id: true, email: true },
  });
  const uploaderMap = new Map(uploaders.map((u) => [u.id, u.email]));

  // --- Wave 2 / Item 1: Compliance info for this document ----------------
  // Compute the live compliance status + expiry date for THIS document, using
  // the same pure calculator the compliance matrix uses. This powers the
  // compliance card on the document-detail page (top, above versions).
  //
  // We look up the ComplianceRule for this documentType, then call
  // calculateStatus(rule, doc, latestVersion). For the latestVersion, we
  // need the uploadedAt field — already fetched in `doc.versions[0]` (the
  // API orders versions by versionNumber desc, so versions[0] is the latest).
  //
  // NOTE: this is the same logic as buildComplianceMatrix in
  // src/lib/compliance/matrix.ts, but called for a single document. We
  // don't reuse fetchMatrixData() because that loads ALL unions + ALL
  // documents (heavyweight — designed for the matrix view). For a single
  // document-detail page, two targeted queries (rule + already-loaded
  // versions) are far cheaper.
  const rule = await db.complianceRule.findUnique({
    where: { documentType: doc.documentType },
  });
  const latestVersionRow = doc.versions[0] ?? null;
  const latestVersionForCalc = latestVersionRow
    ? { uploadedAt: latestVersionRow.uploadedAt }
    : null;
  const complianceStatus = calculateStatus(rule, doc, latestVersionForCalc);
  // Expiry is only meaningful for ACTIVE filings (COMPLIANT/EXPIRING/OVERDUE).
  // Matches the matrix's exclusion logic in matrix.ts.
  const complianceExpiresAt =
    latestVersionForCalc &&
    complianceStatus !== "NOT_APPLICABLE" &&
    complianceStatus !== "MISSING" &&
    complianceStatus !== "AWAITING_REVIEW"
      ? computeExpiryDateFromApproval(
          doc,
          latestVersionForCalc,
          rule?.renewalYears ?? 0,
        ).toISOString()
      : null;

  // Serialize dates
  const document = {
    ...doc,
    reviewedAt: doc.reviewedAt?.toISOString() ?? null,
    rejectionReason: doc.rejectionReason,
    disposedAt: doc.disposedAt?.toISOString() ?? null,
    snoozedUntil: doc.snoozedUntil?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    versions: doc.versions.map((v) => ({
      ...v,
      uploadedAt: v.uploadedAt.toISOString(),
      uploadedByEmail: v.uploadedById ? (uploaderMap.get(v.uploadedById) ?? "Unknown") : "Unknown",
      effectiveDate: v.effectiveDate?.toISOString() ?? null,
    })),
    // Wave 2 / Item 1: compliance snapshot — drives the compliance card on
    // the document-detail page. Single source of truth: the calculator
    // module (no second copy of the status logic).
    compliance: {
      status: complianceStatus,
      expiresAt: complianceExpiresAt,
      renewalYears: rule?.renewalYears ?? null,
    },
  };

  return NextResponse.json({ document });
}
