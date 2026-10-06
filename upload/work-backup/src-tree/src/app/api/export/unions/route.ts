import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { toCsv, CSV_HEADERS } from "@/lib/csv";

// =============================================================================
// GET /api/export/unions — CSV export of all unions + compliance summary
// REGISTRAR: all unions. OFFICER: their union only. INSPECTOR: all (read-only).
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUserOrApiKey(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasScope(user, "unions:read")) return NextResponse.json({ error: "Your API key does not have the 'unions:read' scope." }, { status: 403 });

  const where = user.role === "OFFICER" && user.assignedUnionId
    ? { id: user.assignedUnionId }
    : {};

  // T40: "Documents" column = count of ACTIVE (non-disposed) documents,
  // matching the convention used by /api/dashboard/stats and
  // /api/public/stats (both filter `disposedAt: null`). The old query used
  // `documents: { select: { _count: true } }`, which returns an ARRAY of
  // { _count: N } objects; reading `u.documents._count` on that array was
  // undefined for every union — the column was blank for every row.
  //
  // Prisma 6 supports filtered relation counts via _count + where, so we
  // count documents where disposedAt is null directly in the query.
  const unions = await db.union.findMany({
    where,
    orderBy: { unionName: "asc" },
    select: {
      id: true, unionName: true, registrationNo: true, fileNumber: true,
      status: true, address: true, contactPerson: true, contactEmail: true,
      contactPhone: true, remarks: true, createdAt: true,
      _count: { select: { documents: { where: { disposedAt: null } } } },
    },
  });

  const rows = unions.map((u) => ({
    "Union Name": u.unionName,
    "Registration No": u.registrationNo,
    "File Number": u.fileNumber || "",
    "Status": u.status,
    "Documents": u._count.documents,
    "Address": u.address || "",
    "Contact Person": u.contactPerson || "",
    "Contact Email": u.contactEmail || "",
    "Contact Phone": u.contactPhone || "",
    "Remarks": u.remarks || "",
    "Registered Date": u.createdAt.toISOString().split("T")[0],
  }));

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      ...CSV_HEADERS,
      "Content-Disposition": `attachment; filename="unions-export-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
