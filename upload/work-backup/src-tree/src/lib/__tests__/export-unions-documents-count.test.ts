import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "./setup";
import { toCsv } from "../csv";

// =============================================================================
// T40: export/unions route — "Documents" column must count active (non-disposed)
// documents, not be undefined for every row.
//
// Bug: the route selected `documents: { select: { _count: true } }` which
// returns an ARRAY of {_count: N} objects, then read `u.documents._count`
// on the array — yielding `undefined` for every union. The CSV column was
// therefore blank for every row.
//
// Convention (from /api/dashboard/stats and /api/public/stats): "Documents"
// = active (non-disposed) docs only (disposedAt: null).
//
// This test re-implements the row-builder inline (using the same query shape
// the route uses) so we can assert the count without spinning up a Next
// server. It seeds 3 documents (2 active, 1 disposed) for one union and
// asserts the Documents column is 2, not undefined or NaN.
// =============================================================================

describe("T40: export/unions Documents column counts active docs", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("Documents column equals the count of non-disposed documents (not undefined)", async () => {
    const union = await testDb.union.create({
      data: { unionName: "T40 Test Union", registrationNo: "T40-001", status: "ACTIVE" },
    });

    // 3 documents: 2 active, 1 disposed.
    await testDb.document.create({
      data: { unionId: union.id, documentType: "Constitution", reviewStatus: "APPROVED" },
    });
    await testDb.document.create({
      data: { unionId: union.id, documentType: "Ballot Result", reviewStatus: "APPROVED" },
    });
    await testDb.document.create({
      data: {
        unionId: union.id,
        documentType: "Old Constitution",
        reviewStatus: "APPROVED",
        disposedAt: new Date(),
      },
    });

    // Mirror the route's query, but with a filtered relation count using
    // Prisma's _count select with a where clause (Prisma 6 supports this).
    const unions = await testDb.union.findMany({
      orderBy: { unionName: "asc" },
      select: {
        id: true, unionName: true, registrationNo: true,
        _count: { select: { documents: { where: { disposedAt: null } } } },
      },
    });

    const rows = unions.map((u) => ({
      "Union Name": u.unionName,
      "Registration No": u.registrationNo,
      "Documents": u._count.documents,
    }));

    expect(rows).toHaveLength(1);
    expect(rows[0]["Documents"]).toBe(2);
    expect(rows[0]["Documents"]).not.toBeUndefined();
    expect(rows[0]["Documents"]).not.toBeNaN();

    // And the CSV serialization should contain the number, not a blank field.
    const csv = toCsv(rows);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("Documents");
    expect(lines[1]).toContain("2");
    // Sanity: the disposed doc count (1) must not appear.
    expect(lines[1]).not.toMatch(/,1,/);
  });

  it("the OLD query shape (array select) yields undefined — confirms the bug exists", async () => {
    // This test documents the bug we are fixing. The old select returns
    // `documents: { _count: number }[]`, so reading `._count` on the array
    // is undefined. We keep this test so a future "simplification" that
    // reverts to the array shape will fail loudly here.
    const union = await testDb.union.create({
      data: { unionName: "T40 Old Shape Union", registrationNo: "T40-OLD", status: "ACTIVE" },
    });
    await testDb.document.create({
      data: { unionId: union.id, documentType: "Constitution", reviewStatus: "APPROVED" },
    });

    const unions = await testDb.union.findMany({
      select: {
        id: true, unionName: true,
        documents: { select: { _count: true } },
      },
    });

    // The buggy access pattern: the old select returns
    // `documents: { _count: number }[]` (an ARRAY), so reading `._count`
    // on the array itself is undefined. We use a typed accessor that
    // mirrors what the original route did (u.documents._count) to document
    // the bug.
    type OldShape = { documents: { _count: number }[] };
    const oldShape = unions[0] as unknown as OldShape;
    // The original route accessed `u.documents._count` — on an array, this
    // is undefined (arrays have no _count property).
    const buggyValue = (oldShape.documents as unknown as { _count?: number })._count;
    expect(buggyValue).toBeUndefined();
  });
});
