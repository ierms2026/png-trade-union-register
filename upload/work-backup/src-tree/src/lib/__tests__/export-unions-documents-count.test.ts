import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "./setup";
import { buildUnionsExport } from "@/lib/compliance/unions-export";

// =============================================================================
// T51: unions-export test exercises the REAL code.
//
// T40's tests copied the route's query inline, so a future regression in
// the route would not fail them. This test calls buildUnionsExport() — the
// same function the route handler calls — so a regression in the query or
// row-builder fails here too.
//
// The old T40 "OLD query shape" test (which asserted the array-style
// select returns undefined) has been removed per the task.
// =============================================================================

describe("T51: unions-export Documents column (real route code)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("a union with 2 active + 1 disposed document gives Documents = 2", async () => {
    const union = await testDb.union.create({
      data: { unionName: "T51 Test Union", registrationNo: "T51-001", status: "ACTIVE" },
    });

    // 2 active documents
    await testDb.document.create({
      data: { unionId: union.id, documentType: "Constitution", reviewStatus: "APPROVED" },
    });
    await testDb.document.create({
      data: { unionId: union.id, documentType: "Ballot Result", reviewStatus: "APPROVED" },
    });
    // 1 disposed document (must NOT be counted)
    await testDb.document.create({
      data: {
        unionId: union.id,
        documentType: "Old Constitution",
        reviewStatus: "APPROVED",
        disposedAt: new Date(),
      },
    });

    // Call the REAL export function (the same one the route uses).
    const { csv, rows } = await buildUnionsExport();

    expect(rows).toHaveLength(1);
    expect(rows[0]["Documents"]).toBe(2);
    expect(rows[0]["Documents"]).not.toBeUndefined();
    expect(rows[0]["Documents"]).not.toBeNaN();

    // The CSV must contain the number 2, not a blank field or the disposed
    // count (1).
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("Documents");
    expect(lines[1]).toContain("2");
    expect(lines[1]).not.toMatch(/,1,/);
  });

  it("the CSV column is not undefined or NaN for a union with zero documents", async () => {
    await testDb.union.create({
      data: { unionName: "T51 Empty Union", registrationNo: "T51-EMPTY", status: "ACTIVE" },
    });

    const { rows } = await buildUnionsExport();

    expect(rows).toHaveLength(1);
    expect(rows[0]["Documents"]).toBe(0);
    expect(rows[0]["Documents"]).not.toBeUndefined();
    expect(rows[0]["Documents"]).not.toBeNaN();
  });
});
