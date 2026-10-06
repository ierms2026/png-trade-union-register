import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "./setup";
import { buildUnionsExport } from "@/lib/compliance/unions-export";
import { getUnionScope } from "@/lib/auth/union-scope";

// =============================================================================
// T75b: Unions export access-scoping tests.
//
// Calls the REAL buildUnionsExport() (the same function the route uses) for
// the positive cases, and getUnionScope() (the helper the route uses to
// decide scoping) for the deny case.
//
// T75b (D17): the route now checks getUnionScope before calling
// buildUnionsExport. For an Officer/Representative with no assigned union,
// the scope is "none" and the route returns 403 — it never calls
// buildUnionsExport. This test verifies both the positive scoping and the
// deny behavior.
// =============================================================================

describe("T75b: unions export access scoping", () => {
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
    expect(rows.find((r) => r["Registration No"] === "T60-A")).toBeUndefined();
    expect(rows.find((r) => r["Registration No"] === "T60-C")).toBeUndefined();
  });

  it("Registrar (scope=all) → buildUnionsExport with null returns all", async () => {
    // Registrar scope is "all" — the route passes null to buildUnionsExport
    await testDb.union.create({
      data: { unionName: "Alpha Union", registrationNo: "T60-A", status: "ACTIVE" },
    });
    await testDb.union.create({
      data: { unionName: "Beta Union", registrationNo: "T60-B", status: "ACTIVE" },
    });

    const scope = getUnionScope({ role: "REGISTRAR", assignedUnionId: null });
    expect(scope).toEqual({ kind: "all" });

    const { rows } = await buildUnionsExport({ assignedUnionId: null });
    expect(rows).toHaveLength(2);
  });

  it("Officer WITHOUT assignedUnionId → scope is 'none' (route returns 403)", () => {
    // T75b: the route checks getUnionScope before calling buildUnionsExport.
    // For "none" scope, the route returns 403 and never calls buildUnionsExport.
    const scope = getUnionScope({ role: "OFFICER", assignedUnionId: null });
    expect(scope).toEqual({ kind: "none" });
  });

  it("Officer with empty assignedUnionId → scope is 'none' (route returns 403)", () => {
    const scope = getUnionScope({ role: "OFFICER", assignedUnionId: "" });
    expect(scope).toEqual({ kind: "none" });
  });

  it("Officer with whitespace assignedUnionId → scope is 'none' (route returns 403)", () => {
    const scope = getUnionScope({ role: "OFFICER", assignedUnionId: "   " });
    expect(scope).toEqual({ kind: "none" });
  });

  it("Representative WITHOUT assignedUnionId → scope is 'none' (route returns 403)", () => {
    const scope = getUnionScope({ role: "REPRESENTATIVE", assignedUnionId: null });
    expect(scope).toEqual({ kind: "none" });
  });
});
