import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/context";

// =============================================================================
// GET /api/compliance/rules
// -----------------------------------------------------------------------------
// List all ComplianceRules. Read-only — any authenticated role can view
// (REGISTRAR, INSPECTOR, OFFICER). Inspectors need this for the Compliance
// Matrix's column labels; Officers need it for their own compliance view.
//
// Returns rules ordered alphabetically by documentType so the UI's column
// order is stable across page reloads (without an explicit ORDER BY, SQLite
// returns rows in rowid order — visually random).
// =============================================================================

export async function GET(req: Request) {
  // Verify the caller is authenticated. The mock getAuthUser doesn't
  // actually reject unauthenticated requests (no real session cookie
  // check yet) — it just returns a default user. The real auth-guard
  // (Session 1 Step 5) will return 401 for unauthenticated callers.
  // For now, this call establishes the pattern so the swap is seamless.
  await getAuthUser(req);

  const rules = await db.complianceRule.findMany({
    orderBy: { documentType: "asc" },
  });

  return NextResponse.json({ rules });
}
