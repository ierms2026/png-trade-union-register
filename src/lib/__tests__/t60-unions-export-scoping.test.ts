import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "./setup";
import { buildUnionsExport } from "@/lib/compliance/unions-export";

// =============================================================================
// T60: Unions export access-scoping tests.
//
// Calls the REAL buildUnionsExport() (the same function the route uses).
// Verifies:
//   - With assignedUnionId: returns only that union
//   - Without assignedUnionId (null/undefined): returns all unions
//
// SECURITY NOTE (reported in the task, not fixed here):
//   The route handler (src/app/api/export/unions/route.ts:21-23) passes
//   `null` for an Officer whose `assignedUnionId` is null/missing:
//     const assignedUnionId = user.role === "OFFICER" && user.assignedUnionId
//       ? user.assignedUnionId
//       : null;
//   buildUnionsExport({ assignedUnionId: null }) returns ALL unions (no
//   scoping). So an Officer with no assigned union can export ALL unions.
//   This is reported as needs-human per the task; behavior unchanged.
// =============================================================================

describe("T60: buildUnionsExport access scoping", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("with assignedUnionId returns only that union", async () => {
    const unionA = await testDb.union.create({
      data: { unionName: "Alpha Union", registrationNo: "T60-A", status: "ACTIVE" },
    });
    const unionB = await testDb.union.create({
      data: { unionName: "Beta Union", registrationNo: "T60-B", status: "ACTIVE" },
    });
    const unionC = await testDb.union.create({
      data: { unionName: "Gamma Union", registrationNo: "T60-C", status: "ACTIVE" },
    });

    const { rows } = await buildUnionsExport({ assignedUnionId: unionB.id });

    expect(rows).toHaveLength(1);
    expect(rows[0]["Registration No"]).toBe("T60-B");
    expect(rows[0]["Union Name"]).toBe("Beta Union");
    // Confirm the other unions are NOT present
    expect(rows.find((r) => r["Registration No"] === "T60-A")).toBeUndefined();
    expect(rows.find((r) => r["Registration No"] === "T60-C")).toBeUndefined();
  });

  it("with no assignedUnionId (null) returns all unions", async () => {
    await testDb.union.create({
      data: { unionName: "Alpha Union", registrationNo: "T60-A", status: "ACTIVE" },
    });
    await testDb.union.create({
      data: { unionName: "Beta Union", registrationNo: "T60-B", status: "ACTIVE" },
    });
    await testDb.union.create({
      data: { unionName: "Gamma Union", registrationNo: "T60-C", status: "ACTIVE" },
    });

    const { rows } = await buildUnionsExport({ assignedUnionId: null });

    expect(rows).toHaveLength(3);
    // Sorted by unionName ascending
    expect(rows[0]["Union Name"]).toBe("Alpha Union");
    expect(rows[1]["Union Name"]).toBe("Beta Union");
    expect(rows[2]["Union Name"]).toBe("Gamma Union");
  });

  it("with no assignedUnionId (undefined, the default) returns all unions", async () => {
    await testDb.union.create({
      data: { unionName: "Alpha Union", registrationNo: "T60-A", status: "ACTIVE" },
    });
    await testDb.union.create({
      data: { unionName: "Beta Union", registrationNo: "T60-B", status: "ACTIVE" },
    });

    const { rows } = await buildUnionsExport();

    expect(rows).toHaveLength(2);
  });
});
