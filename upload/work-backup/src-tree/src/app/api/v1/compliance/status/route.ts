import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import {
  checkRateLimit,
  rateLimitedResponse,
  rateLimitHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";

// =============================================================================
// GET /api/v1/compliance/status?unionId=...
// -----------------------------------------------------------------------------
// Chunk 9: Machine-readable compliance status for external systems.
//
// Returns a single union's compliance status (all required document types +
// their current status) in a clean JSON shape optimized for programmatic
// consumption. Used by external HR/finance/legal systems to check a union's
// compliance posture without screen-scraping.
//
// AUTH: API key (preferred) or session cookie. Requires `compliance:read`
// scope. Officer/Representative scoping applies (can only query their own
// union).
//
// QUERY PARAMS:
//   unionId  — required, the union to query
//
// RESPONSE SHAPE:
//   {
//     union: { id, unionName, registrationNo, status },
//     generatedAt: ISO timestamp,
//     overallScore: number | null,
//     summary: { compliant, expiring, overdue, missing, notApplicable },
//     requirements: [{
//       documentType, status, documentId, expiresAt, daysUntilExpiry
//     }]
//   }
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUserOrApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasScope(user, "compliance:read")) {
    return NextResponse.json(
      { error: "Your API key does not have the 'compliance:read' scope." },
      { status: 403 },
    );
  }

  // Rate limit: apiV1 bucket, 120/min per API key (or user.id for sessions)
  const rateLimitKey = user.scopes ? `apikey:${user.id}` : `user:${user.id}`;
  const rl = checkRateLimit(
    "apiV1",
    rateLimitKey,
    RATE_LIMITS.apiV1.max,
    RATE_LIMITS.apiV1.windowMs,
  );
  if (!rl.allowed) {
    return rateLimitedResponse(rl);
  }
  const rlHeaders = rateLimitHeaders(rl);

  const url = new URL(req.url);
  const unionId = url.searchParams.get("unionId");

  if (!unionId) {
    return NextResponse.json(
      { error: "The 'unionId' query parameter is required." },
      { status: 400, headers: rlHeaders },
    );
  }

  // Officer/Representative scoping — can only query their own union
  const isUnionScopedRole = user.role === Role.OFFICER || user.role === Role.REPRESENTATIVE;
  if (isUnionScopedRole && user.assignedUnionId !== unionId) {
    return NextResponse.json(
      { error: "You can only query compliance status for your own union." },
      { status: 403, headers: rlHeaders },
    );
  }

  // Verify the union exists
  const union = await db.union.findUnique({
    where: { id: unionId },
    select: { id: true, unionName: true, registrationNo: true, status: true },
  });
  if (!union) {
    return NextResponse.json(
      { error: "Union not found." },
      { status: 404, headers: rlHeaders },
    );
  }

  // Build the compliance matrix scoped to this union
  const data = await fetchMatrixData();
  data.unions = data.unions.filter((u) => u.id === unionId);
  const matrix = buildComplianceMatrix(data);

  if (matrix.unions.length === 0) {
    return NextResponse.json(
      { error: "Union has no compliance data." },
      { status: 404, headers: rlHeaders },
    );
  }

  const row = matrix.unions[0];
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;

  // Build the requirements array with daysUntilExpiry
  const requirements = row.scores.map((cell) => {
    let daysUntilExpiry: number | null = null;
    if (cell.expiresAt) {
      daysUntilExpiry = Math.floor(
        (new Date(cell.expiresAt).getTime() - now.getTime()) / msPerDay,
      );
    }
    return {
      documentType: cell.documentType,
      status: cell.status,
      documentId: cell.documentId,
      expiresAt: cell.expiresAt,
      daysUntilExpiry,
    };
  });

  // Build the summary counts
  const summary = {
    compliant: requirements.filter((r) => r.status === "COMPLIANT").length,
    expiring: requirements.filter((r) => r.status === "EXPIRING").length,
    overdue: requirements.filter((r) => r.status === "OVERDUE").length,
    missing: requirements.filter((r) => r.status === "MISSING").length,
    notApplicable: requirements.filter((r) => r.status === "NOT_APPLICABLE").length,
  };

  return NextResponse.json(
    {
      union,
      generatedAt: matrix.generatedAt,
      overallScore: row.overallScore,
      summary,
      requirements,
    },
    { headers: rlHeaders },
  );
}
