import { NextRequest, NextResponse } from "next/server";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { getUnionScope } from "@/lib/auth/union-scope";
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
//
// T75b (D17): uses getUnionScope for fail-closed behavior. An Officer or
// Representative with no assigned union gets 403, not all unions.
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUserOrApiKey(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasScope(user, "unions:read")) return NextResponse.json({ error: "Your API key does not have the 'unions:read' scope." }, { status: 403 });

  const scope = getUnionScope({ role: user.role, assignedUnionId: user.assignedUnionId });
  if (scope.kind === "none") {
    return NextResponse.json(
      { error: "You do not have an assigned union. Contact the Registrar." },
      { status: 403 },
    );
  }
  const assignedUnionId = scope.kind === "union" ? scope.unionId : null;

  const { csv } = await buildUnionsExport({ assignedUnionId });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      ...CSV_HEADERS,
      "Content-Disposition": `attachment; filename="unions-export-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
