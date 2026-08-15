import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import {
  calculateStatusFromRows,
  computeExpiryDate,
  computeUnionScore,
  type ComplianceStatus,
} from "@/lib/compliance/calculator";

// =============================================================================
// GET /api/compliance
// -----------------------------------------------------------------------------
// Returns the live compliance matrix: every union × every document type.
//
// CORE MANDATE OF SESSION 3: "Compute live, never store."
// No status is read from the DB — every cell's status is computed on the
// fly via calculateStatus (Step 1). If a Registrar edits a rule, the next
// call to this endpoint returns the updated matrix immediately. No cache
// invalidation, no drift, no migration.
//
// RESPONSE SHAPE — one row per union:
//   {
//     unionId: string,
//     unionName: string,
//     status: UnionStatus,
//     scores: Array<{
//       documentType: string,          // e.g. "Constitution"
//       status: ComplianceStatus,      // computed live
//       documentId: string | null,     // null when no doc filed (MISSING)
//       expiresAt: string | null,      // ISO date when next renewal due
//                                     //   null when no doc or NOT_APPLICABLE
//     }>,
//     overallScore: number | null,     // (compliant / applicable) × 100
//                                     // null when no applicable doc types
//   }
//
// QUERY STRATEGY:
// We need: all unions, all rules, all documents, all current versions.
// Approach:
//   1. Fetch all unions (1 query)
//   2. Fetch all compliance rules (1 query)
//   3. Fetch all documents (1 query)
//   4. Collect every document.currentVersionId → fetch those versions in
//      a single `where: { id: { in: [...] } }` query (1 query)
//   5. Build lookup maps: (unionId, docType) → Document, docId → Version
//
// This is 4 queries total and loads only the current version per document
// (not the full version history — the matrix only cares about "what's the
// latest filed version?"). For a system with ~100 unions × ~13 doc types,
// this is ~1300 documents + 1300 versions = manageable in a single
// response (well under 1 MB).
//
// WHY NOT `include: { versions: { take: 1, orderBy: ... } }`?
// Prisma's relation include with `take` is supported in newer versions but
// generates a correlated subquery per document — N+1-ish. The two-step
// fetch (documents, then versions by id IN) is faster and explicit.
//
// OFFICER SCOPING (TODO):
// Per the business context, Officers see ONLY their assigned union's row.
// This should be enforced server-side by filtering the unions query:
//   where: user.role === "OFFICER" ? { id: user.assignedUnionId } : {}
// For now, the mock getAuthUser doesn't enforce scoping — flagging this
// as a TODO. When the real auth-guard ships (Session 1 Step 5), wrap
// this with `requireUser()` and apply the filter.
//
// DISPOSED DOCUMENTS:
// A disposed doc returns status=MISSING (per the calculator's logic —
// disposed = gone from active views = MISSING). The union needs to file
// a NEW document to be compliant again. The matrix includes disposed
// docs in the `scores` array with status=MISSING, so the UI can show
// "Last disposed: <date>" in a tooltip if desired.
// =============================================================================

export interface ComplianceScoreCell {
  documentType: string;
  status: ComplianceStatus;
  documentId: string | null;
  expiresAt: string | null;
}

export interface ComplianceMatrixRow {
  unionId: string;
  unionName: string;
  status: string; // UnionStatus serialized as string
  scores: ComplianceScoreCell[];
  overallScore: number | null;
}

export async function GET() {
  // --- 1. Fetch all data in parallel ---------------------------------------
  // Three independent queries — no data dependency between them, so we can
  // run them concurrently with Promise.all.
  const [unions, rules, documents] = await Promise.all([
    db.union.findMany({
      select: { id: true, unionName: true, status: true },
      orderBy: { unionName: "asc" },
    }),
    db.complianceRule.findMany(),
    db.document.findMany({
      select: {
        id: true,
        unionId: true,
        documentType: true,
        currentVersionId: true,
        disposedAt: true,
      },
    }),
  ]);

  // --- 2. Fetch all current versions in a single query ---------------------
  // currentVersionId is a nullable string pointer to the latest
  // DocumentVersion. We collect every non-null pointer and fetch them in
  // one query — this is the most efficient way to load the latest version
  // for every document without N+1 queries.
  const currentVersionIds = documents
    .map((d) => d.currentVersionId)
    .filter((id): id is string => id !== null);

  const currentVersions = currentVersionIds.length > 0
    ? await db.documentVersion.findMany({
        where: { id: { in: currentVersionIds } },
        select: { id: true, uploadedAt: true },
      })
    : [];

  // Build a lookup map: versionId → uploadedAt
  // Used to find the "filedAt" date for each document's latest version.
  const versionById = new Map(
    currentVersions.map((v) => [v.id, v.uploadedAt]),
  );

  // Build a lookup map: (unionId, documentType) → Document
  // Used to find the matching document for each (union, rule) cell.
  // Key format: `${unionId}::${documentType}` — using a separator that
  // can't appear in either value (cuid + string doc type names).
  const documentByUnionAndType = new Map<string, (typeof documents)[number]>();
  for (const doc of documents) {
    documentByUnionAndType.set(`${doc.unionId}::${doc.documentType}`, doc);
  }

  // --- 3. Build the matrix -------------------------------------------------
  // For each union, iterate over every rule and compute the cell status.
  // The matrix is unions × rules — every union gets every rule, even if
  // the union has no document for that rule type (status=MISSING).
  const now = new Date();
  const matrix: ComplianceMatrixRow[] = unions.map((union) => {
    const scores: ComplianceScoreCell[] = rules.map((rule) => {
      const doc = documentByUnionAndType.get(`${union.id}::${rule.documentType}`) ?? null;

      // Find the latest version for this document (if any).
      // Uses the currentVersionId pointer (already loaded) to look up
      // the uploadedAt in the versionById map — O(1) per cell.
      const latestVersion =
        doc?.currentVersionId && versionById.has(doc.currentVersionId)
          ? { uploadedAt: versionById.get(doc.currentVersionId)! }
          : null;

      // Compute the live status via the pure function from Step 1.
      const status = calculateStatusFromRows(
        rule,
        doc,
        latestVersion,
        now,
      );

      // Compute expiresAt — only meaningful for ACTIVE filings
      // (COMPLIANT / EXPIRING / OVERDUE). For MISSING / NOT_APPLICABLE
      // cells, expiresAt is null:
      //   - NOT_APPLICABLE: rule doesn't apply, no expiry to compute
      //   - MISSING (no doc): no filedAt to compute from
      //   - MISSING (disposed): the old expiry is irrelevant — the union
      //     needs to file a NEW document. Showing the disposed doc's
      //     expiry would mislead users into thinking there's an active
      //     filing expiring on that date.
      const expiresAt =
        latestVersion && status !== "NOT_APPLICABLE" && status !== "MISSING"
          ? computeExpiryDate(latestVersion.uploadedAt, rule.renewalYears).toISOString()
          : null;

      return {
        documentType: rule.documentType,
        status,
        documentId: doc?.id ?? null,
        expiresAt,
      };
    });

    // Compute the per-union overall score using the helper from Step 1.
    // NOT_APPLICABLE cells are excluded from BOTH numerator and denominator
    // (verified by smoke test in Step 1). Returns null when the union has
    // zero applicable doc types (edge case: a brand-new union with no
    // required rules yet).
    const overallScore = computeUnionScore(scores.map((s) => s.status));

    return {
      unionId: union.id,
      unionName: union.unionName,
      status: union.status,
      scores,
      overallScore,
    };
  });

  return NextResponse.json({
    unions: matrix,
    documentTypes: rules.map((r) => r.documentType),
    generatedAt: now.toISOString(),
  });
}
