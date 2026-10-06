import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { buildDocumentTypesWhere } from "@/lib/dashboard/document-types-where";

// =============================================================================
// GET /api/dashboard/document-types
// -----------------------------------------------------------------------------
// Returns the count of documents grouped by documentType + the list of
// required document types and totalUnions — powers the "Required vs On-File"
// meters on the Dashboard (chunk 2.2).
//
// Returns:
//   {
//     documentTypes: [{ documentType: "Constitution", count: 4 }, ...],
//     total: 21,
//     requiredTypes: ["Constitution", "Financial Return", ...],  // from ComplianceRule
//     totalUnions: 6,
//   }
//
// The where-building logic lives in buildDocumentTypesWhere() (src/lib/
// dashboard/document-types-where.ts) so tests can exercise the REAL scoping
// code without spinning up a Next server.
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { docWhere, unionWhere } = buildDocumentTypesWhere({
    role: user.role,
    assignedUnionId: user.assignedUnionId,
  });

  // Fetch on-file doc counts + required rules + totalUnions in parallel
  const [documents, rules, totalUnions] = await Promise.all([
    db.document.findMany({ where: docWhere, select: { documentType: true } }),
    db.complianceRule.findMany({ where: { required: true }, select: { documentType: true } }),
    db.union.count({ where: unionWhere }),
  ]);

  // Aggregate on-file counts per type
  const counts = new Map<string, number>();
  for (const doc of documents) {
    counts.set(doc.documentType, (counts.get(doc.documentType) || 0) + 1);
  }

  const result = Array.from(counts.entries())
    .map(([documentType, count]) => ({ documentType, count }))
    .sort((a, b) => b.count - a.count);

  // Required types list (for the required-vs-on-file comparison)
  const requiredTypes = rules.map((r) => r.documentType);

  return NextResponse.json({
    documentTypes: result,
    total: documents.length,
    requiredTypes,
    totalUnions,
  });
}
