import { db } from "@/lib/prisma";
import {
  calculateStatusFromRows,
  computeExpiryDate,
  computeUnionScore,
  type ComplianceStatus,
} from "@/lib/compliance/calculator";
import type { ComplianceRule, Document, DocumentVersion } from "@prisma/client";

// =============================================================================
// Shared matrix-building logic.
//
// WHY THIS EXISTS:
// Step 2 built the matrix inline in the /api/compliance GET handler.
// Step 3's preview endpoint needs to compute the matrix AGAIN — but with a
// hypothetical rule substituted for the saved one. Duplicating the
// query + computation logic across two routes is a maintenance hazard
// (they'd drift). This module is the single source of truth for "given a
// set of rules, compute the compliance matrix."
//
// USAGE:
//   - Real matrix (Step 2): fetch all rules from DB, pass them in
//   - Preview matrix (Step 3): fetch all rules, substitute one with the
//     hypothetical change, pass the modified array in
//
// Both paths produce identical output shapes — the only difference is
// which rules the cells were computed against.
// =============================================================================

// Re-export the public types so callers can import from one place
export type { ComplianceStatus } from "@/lib/compliance/calculator";

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

export interface ComplianceMatrixResponse {
  unions: ComplianceMatrixRow[];
  documentTypes: string[];
  generatedAt: string;
}

/**
 * Pre-loaded rows used by buildComplianceMatrix. All four arrays are
 * fetched up front (4 queries total, no N+1) and passed in so the
 * preview endpoint can reuse the SAME loaded data — only the rules
 * array differs (one hypothetical substitution).
 */
export interface MatrixData {
  unions: Array<{ id: string; unionName: string; status: string }>;
  rules: Array<ComplianceRule>;
  documents: Array<
    Pick<Document, "id" | "unionId" | "documentType" | "currentVersionId" | "disposedAt" | "reviewStatus">
  >;
  versions: Array<Pick<DocumentVersion, "id" | "uploadedAt">>;
}

/**
 * Fetch all the data needed to compute the compliance matrix.
 *
 * 4 queries total:
 *   1. All unions (id, unionName, status)
 *   2. All compliance rules (full rows — needed for required/renewalYears)
 *   3. All documents (id, unionId, documentType, currentVersionId, disposedAt)
 *   4. All current versions (id, uploadedAt) — single IN query using the
 *      currentVersionId pointers collected from #3
 *
 * Returned as a structured object so callers can pass it to
 * buildComplianceMatrix, or substitute the rules array for preview
 * computations.
 */
export async function fetchMatrixData(): Promise<MatrixData> {
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
        reviewStatus: true,
      },
    }),
  ]);

  // Fetch all current versions in a single query using the
  // currentVersionId pointers collected above. This is the most efficient
  // way to load the latest version for every document without N+1 queries.
  const currentVersionIds = documents
    .map((d) => d.currentVersionId)
    .filter((id): id is string => id !== null);

  const versions =
    currentVersionIds.length > 0
      ? await db.documentVersion.findMany({
          where: { id: { in: currentVersionIds } },
          select: { id: true, uploadedAt: true },
        })
      : [];

  return { unions, rules, documents, versions };
}

/**
 * Compute the compliance matrix from pre-loaded data.
 *
 * Pure (given the data + a `now`): no DB access, no I/O. This makes it
 * testable AND reusable — the preview endpoint calls this twice (once
 * with real rules, once with the hypothetical rule substituted in) and
 * diffs the results.
 *
 * @param data  Pre-loaded unions, rules, documents, versions
 * @param now   Reference "now" — defaults to new Date(). Pass a fixed
 *              value in tests for deterministic output.
 */
export function buildComplianceMatrix(
  data: MatrixData,
  now: Date = new Date(),
): ComplianceMatrixResponse {
  const { unions, rules, documents, versions } = data;

  // Build lookup maps for O(1) cell computation
  const versionById = new Map(versions.map((v) => [v.id, v.uploadedAt]));
  const documentByUnionAndType = new Map<string, (typeof documents)[number]>();
  for (const doc of documents) {
    documentByUnionAndType.set(`${doc.unionId}::${doc.documentType}`, doc);
  }

  // For each union, compute one cell per rule
  const matrix: ComplianceMatrixRow[] = unions.map((union) => {
    const scores: ComplianceScoreCell[] = rules.map((rule) => {
      const doc =
        documentByUnionAndType.get(`${union.id}::${rule.documentType}`) ?? null;

      const latestVersion =
        doc?.currentVersionId && versionById.has(doc.currentVersionId)
          ? { uploadedAt: versionById.get(doc.currentVersionId)! }
          : null;

      const status = calculateStatusFromRows(rule, doc, latestVersion, now);

      // expiresAt is only meaningful for ACTIVE filings
      // (COMPLIANT / EXPIRING / OVERDUE). For AWAITING_REVIEW / MISSING /
      // NOT_APPLICABLE, it's null — see /api/compliance/route.ts for the
      // full rationale.
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

    const overallScore = computeUnionScore(scores.map((s) => s.status));

    return {
      unionId: union.id,
      unionName: union.unionName,
      status: union.status,
      scores,
      overallScore,
    };
  });

  return {
    unions: matrix,
    documentTypes: rules.map((r) => r.documentType),
    generatedAt: now.toISOString(),
  };
}
