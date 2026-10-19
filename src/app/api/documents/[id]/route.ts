import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";
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
      // Wave 3 / Item 1: two-person approval workflow metadata.
      firstApprovedById: true,
      firstApprovedAt: true,
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
    // Wave 3 / Item 1: serialize the two-person approval fields. Stays null
    // for documents that haven't received first approval yet.
    firstApprovedAt: doc.firstApprovedAt?.toISOString() ?? null,
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

  // --- Wave 3 / Item 2: Document view audit log ---------------------------
  // Log every detail-page view. The audit entry is best-effort — failures
  // don't fail the API request (the user still gets their document). The
  // entry captures:
  //   - actorId + actorName: who viewed (user ID + email, OR null for API key)
  //   - entityType=Document + entityId: which document
  //   - action="document_view": standard action name (formatAuditAction in
  //     document-detail.tsx maps this to "Document viewed")
  //   - afterJson: { viewMethod: "UI" | "API" } so the audit trail can
  //     distinguish human views from API key access.
  //
  // NO PII BEYOND ACTOR IDENTITY: per the user's defaults selection, we do
  // NOT log IP, user agent, or other request metadata. This avoids
  // collecting PII that would need separate retention/privacy handling.
  //
  // The viewMethod is "API" when the request authenticated via API key
  // (user.scopes is non-null for API-key auth, null for session-cookie auth
  // per the AuthUser interface in src/lib/auth/auth-guard.ts), "UI" for
  // session auth.
  const viewMethod = user.scopes !== null ? "API" : "UI";
  try {
    await db.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.email,
        action: "document_view",
        entityType: "Document",
        entityId: id,
        afterJson: JSON.stringify({
          documentType: doc.documentType,
          unionId: doc.union.id,
          unionName: doc.union.unionName,
          viewMethod,
        }),
        severity: Severity.INFO,
      },
    });
  } catch {
    // Audit log write failed — non-fatal. The user still gets their
    // document. We deliberately don't log to console here because that
    // could leak the document ID to server logs (the audit log is the
    // correct place for that info).
  }

  return NextResponse.json({ document });
}
