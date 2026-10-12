import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { getUnionScope } from "@/lib/auth/union-scope";
import {
  checkRateLimit,
  rateLimitedResponse,
  rateLimitHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";

// =============================================================================
// GET /api/v1/unions/export
// -----------------------------------------------------------------------------
// Chunk 9: Bulk union data export for data warehouse integration.
//
// Returns all unions (or a single union if scoped) in a clean JSON shape
// optimized for data warehouse sync. PII fields (contactEmail, contactPhone,
// contactPerson, address) are gated behind the `unions:read:pii` scope —
// without it, only public fields are returned.
//
// AUTH: API key (preferred) or session cookie. Requires `unions:read` scope.
// Officer/Representative scoping applies (only their own union).
//
// PII GATING:
//   - `unions:read` scope: returns public fields only (id, unionName,
//     registrationNo, fileNumber, status, remarks, createdAt, updatedAt)
//   - `unions:read:pii` scope: adds contactEmail, contactPhone,
//     contactPerson, address
//
// RESPONSE SHAPE:
//   {
//     exportedAt: ISO timestamp,
//     count: number,
//     unions: [{
//       id, unionName, registrationNo, fileNumber, status, remarks,
//       createdAt, updatedAt,
//       // PII fields (only if unions:read:pii scope):
//       contactPerson, contactEmail, contactPhone, address
//     }]
//   }
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUserOrApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasScope(user, "unions:read")) {
    return NextResponse.json(
      { error: "Your API key does not have the 'unions:read' scope." },
      { status: 403 },
    );
  }

  // Rate limit: apiV1 bucket
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

  // Check for PII scope
  const hasPiiScope = hasScope(user, "unions:read:pii");

  // Build the where clause with Officer/Representative scoping
  const scope = getUnionScope({ role: user.role, assignedUnionId: user.assignedUnionId });
  if (scope.kind === "none") {
    return NextResponse.json({ error: "Forbidden: your account is not assigned to a union." }, { status: 403 });
  }
  const where = scope.kind === "union" ? { id: scope.unionId } : {};

  // Select fields based on PII scope
  const select = hasPiiScope
    ? {
        id: true,
        unionName: true,
        registrationNo: true,
        fileNumber: true,
        status: true,
        address: true,
        contactPerson: true,
        contactEmail: true,
        contactPhone: true,
        remarks: true,
        createdAt: true,
        updatedAt: true,
      }
    : {
        id: true,
        unionName: true,
        registrationNo: true,
        fileNumber: true,
        status: true,
        remarks: true,
        createdAt: true,
        updatedAt: true,
      };

  const unions = await db.union.findMany({
    where,
    select,
    orderBy: { unionName: "asc" },
  });

  // Serialize dates to ISO strings
  const serializedUnions = unions.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }));

  return NextResponse.json(
    {
      exportedAt: new Date().toISOString(),
      count: serializedUnions.length,
      unions: serializedUnions,
      // Include a note about PII gating so the caller knows what to expect
      piiIncluded: hasPiiScope,
    },
    { headers: rlHeaders },
  );
}
