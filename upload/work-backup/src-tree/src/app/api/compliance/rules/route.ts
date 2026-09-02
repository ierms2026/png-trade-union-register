import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";

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
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const rules = await db.complianceRule.findMany({
    orderBy: { documentType: "asc" },
  });

  return NextResponse.json({ rules });
}
