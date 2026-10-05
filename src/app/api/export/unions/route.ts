import { NextRequest, NextResponse } from "next/server";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { CSV_HEADERS } from "@/lib/csv";
import { buildUnionsExport } from "@/lib/compliance/unions-export";

// =============================================================================
// GET /api/export/unions — CSV export of all unions + compliance summary
// REGISTRAR: all unions. OFFICER: their union only. INSPECTOR: all (read-only).
//
// The query + row-building live in buildUnionsExport() (src/lib/compliance/
// unions-export.ts) so tests can exercise the REAL code without spinning up
// a Next server or faking auth. This handler does auth + scoping, then
// wraps the CSV in a download response.
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUserOrApiKey(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasScope(user, "unions:read")) return NextResponse.json({ error: "Your API key does not have the 'unions:read' scope." }, { status: 403 });

  const assignedUnionId = user.role === "OFFICER" && user.assignedUnionId
    ? user.assignedUnionId
    : null;

  const { csv } = await buildUnionsExport({ assignedUnionId });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      ...CSV_HEADERS,
      "Content-Disposition": `attachment; filename="unions-export-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
