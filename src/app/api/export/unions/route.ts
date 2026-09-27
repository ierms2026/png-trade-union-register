import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { toCsv, CSV_HEADERS } from "@/lib/csv";

// =============================================================================
// GET /api/export/unions — CSV export of all unions + compliance summary
// REGISTRAR: all unions. OFFICER: their union only. INSPECTOR: all (read-only).
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const where = user.role === "OFFICER" && user.assignedUnionId
    ? { id: user.assignedUnionId }
    : {};

  const unions = await db.union.findMany({
    where,
    orderBy: { unionName: "asc" },
    select: {
      id: true, unionName: true, registrationNo: true, fileNumber: true,
      status: true, address: true, contactPerson: true, contactEmail: true,
      contactPhone: true, remarks: true, createdAt: true,
      documents: { select: { _count: true } },
    },
  });

  const rows = unions.map((u) => ({
    "Union Name": u.unionName,
    "Registration No": u.registrationNo,
    "File Number": u.fileNumber || "",
    "Status": u.status,
    "Documents": u.documents._count,
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
