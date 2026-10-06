import { describe, it, expect } from "vitest";
import { getUnionScope } from "@/lib/auth/union-scope";

// =============================================================================
// T75b: Unit tests for the shared getUnionScope helper.
//
// Covers every role + null/empty/whitespace assignedUnionId combinations.
// =============================================================================

describe("T75b: getUnionScope", () => {
  it("Registrar → all (unscoped)", () => {
    expect(getUnionScope({ role: "REGISTRAR", assignedUnionId: null })).toEqual({ kind: "all" });
    // Registrar with an assignedUnionId is still "all" (the field is ignored)
    expect(getUnionScope({ role: "REGISTRAR", assignedUnionId: "union-1" })).toEqual({ kind: "all" });
  });

  it("Inspector → all (unscoped)", () => {
    expect(getUnionScope({ role: "INSPECTOR", assignedUnionId: null })).toEqual({ kind: "all" });
    expect(getUnionScope({ role: "INSPECTOR", assignedUnionId: "union-1" })).toEqual({ kind: "all" });
  });

  it("Officer with a non-empty assignedUnionId → that union", () => {
    expect(getUnionScope({ role: "OFFICER", assignedUnionId: "union-123" })).toEqual({
      kind: "union",
      unionId: "union-123",
    });
  });

  it("Officer with null assignedUnionId → none (fail closed)", () => {
    expect(getUnionScope({ role: "OFFICER", assignedUnionId: null })).toEqual({ kind: "none" });
  });

  it("Officer with empty assignedUnionId → none (fail closed)", () => {
    expect(getUnionScope({ role: "OFFICER", assignedUnionId: "" })).toEqual({ kind: "none" });
  });

  it("Officer with whitespace assignedUnionId → none (fail closed)", () => {
    expect(getUnionScope({ role: "OFFICER", assignedUnionId: "   " })).toEqual({ kind: "none" });
  });

  it("Unknown role → none (fail closed)", () => {
    expect(getUnionScope({ role: "ADMIN", assignedUnionId: "union-1" })).toEqual({ kind: "none" });
    expect(getUnionScope({ role: "UNKNOWN", assignedUnionId: null })).toEqual({ kind: "none" });
  });

  it("trims whitespace from a valid assignedUnionId", () => {
    expect(getUnionScope({ role: "OFFICER", assignedUnionId: "  union-789  " })).toEqual({
      kind: "union",
      unionId: "union-789",
    });
  });
});
