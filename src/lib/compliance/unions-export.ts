import { db } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";

// =============================================================================
// Unions export — query + row-building, extracted so tests can exercise the
// REAL code (not a copy of the query).
//
// The route handler (src/app/api/export/unions/route.ts) calls
// `buildUnionsExport({ assignedUnionId })` and wraps the returned CSV in a
// NextResponse. Tests call `buildUnionsExport` directly with a test-DB
// connection (the `db` import resolves to the test DB via DATABASE_URL set
// in setup.ts).
//
// T40: "Documents" column = count of ACTIVE (non-disposed) documents,
// matching /api/dashboard/stats and /api/public/stats (disposedAt: null).
// =============================================================================

export interface UnionsExportRow {
  "Union Name": string;
  "Registration No": string;
  "File Number": string;
  "Status": string;
  "Documents": number;
  "Address": string;
  "Contact Person": string;
  "Contact Email": string;
  "Contact Phone": string;
  "Remarks": string;
  "Registered Date": string;
}

/**
 * Build the unions CSV export. When `assignedUnionId` is provided, the
 * export is scoped to that union (Officer view); otherwise all unions are
 * included (Registrar / Inspector view).
 *
 * @returns An object with the CSV string + the parsed rows (for assertions).
 */
export async function buildUnionsExport(opts: { assignedUnionId?: string | null } = {}): Promise<{
  csv: string;
  rows: UnionsExportRow[];
}> {
  const where = opts.assignedUnionId ? { id: opts.assignedUnionId } : {};

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

  const rows: UnionsExportRow[] = unions.map((u) => ({
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

  const csv = toCsv(rows as unknown as Record<string, unknown>[]);
  return { csv, rows };
}
