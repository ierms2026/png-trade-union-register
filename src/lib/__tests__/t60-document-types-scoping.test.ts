import { describe, it, expect } from "vitest";
import { buildDocumentTypesWhere, getDocumentTypesScope } from "@/lib/dashboard/document-types-where";

// =============================================================================
// T75b: document-types where-builder access-scoping tests.
//
// Replaces the T60 test that documented the INSECURE behavior ("Officer
// WITHOUT assignedUnionId is UNSCOPED"). Now the route uses getUnionScope
// and returns 403 for "none" scope. These tests verify:
//   - Officer WITH assignedUnionId: scoped to that union
//   - Registrar: unscoped (sees all)
//   - Inspector: unscoped (sees all)
//   - Officer/Representative WITHOUT assignedUnionId: scope is "none" (the
//     route returns 403 — tested via getDocumentTypesScope)
// =============================================================================

describe("T75b: document-types where-builder + scope", () => {
  it("Officer WITH assignedUnionId is scoped to that union", () => {
    const { docWhere, unionWhere } = buildDocumentTypesWhere({
      role: "OFFICER",
      assignedUnionId: "union-123",
    });
    expect(docWhere).toEqual({ disposedAt: null, unionId: "union-123" });
    expect(unionWhere).toEqual({ id: "union-123" });
  });

  it("Registrar is unscoped (sees all)", () => {
    const { docWhere, unionWhere } = buildDocumentTypesWhere({
      role: "REGISTRAR",
      assignedUnionId: null,
    });
    expect(docWhere).toEqual({ disposedAt: null });
    expect(unionWhere).toEqual({});
  });

  it("Inspector is unscoped (sees all)", () => {
    const { docWhere, unionWhere } = buildDocumentTypesWhere({
      role: "INSPECTOR",
      assignedUnionId: null,
    });
    expect(docWhere).toEqual({ disposedAt: null });
    expect(unionWhere).toEqual({});
  });

  it("Officer WITHOUT assignedUnionId → scope is 'none' (route returns 403)", () => {
    // T75b: the route now checks getDocumentTypesScope BEFORE calling
    // buildDocumentTypesWhere. For "none" scope, the route returns 403 and
    // never calls buildDocumentTypesWhere. This test verifies the scope
    // itself is "none".
    const scope = getDocumentTypesScope({ role: "OFFICER", assignedUnionId: null });
    expect(scope).toEqual({ kind: "none" });
  });

  it("Officer with empty assignedUnionId → scope is 'none' (route returns 403)", () => {
    const scope = getDocumentTypesScope({ role: "OFFICER", assignedUnionId: "" });
    expect(scope).toEqual({ kind: "none" });
  });

  it("Officer with whitespace assignedUnionId → scope is 'none' (route returns 403)", () => {
    const scope = getDocumentTypesScope({ role: "OFFICER", assignedUnionId: "   " });
    expect(scope).toEqual({ kind: "none" });
  });

  it("Representative WITHOUT assignedUnionId → scope is 'none' (route returns 403)", () => {
    const scope = getDocumentTypesScope({ role: "REPRESENTATIVE", assignedUnionId: null });
    expect(scope).toEqual({ kind: "none" });
  });
});
