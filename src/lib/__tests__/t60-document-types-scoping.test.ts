import { describe, it, expect } from "vitest";
import { buildDocumentTypesWhere } from "@/lib/dashboard/document-types-where";

// =============================================================================
// T60: document-types where-builder access-scoping tests.
//
// Calls the REAL buildDocumentTypesWhere() (the same function the route
// uses). Verifies:
//   - Officer WITH assignedUnionId: scoped to that union
//   - Registrar: unscoped (sees all)
//   - Inspector: unscoped (sees all)
//
// SECURITY NOTE (reported in the task, not fixed here):
//   An Officer WITH no assigned union falls through to the unscoped branch
//   (returns all — known issue). The test below documents this behavior.
// =============================================================================

describe("T60: buildDocumentTypesWhere access scoping", () => {
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

  it("Officer WITHOUT assignedUnionId is UNSCOPED (known issue — documented, not fixed)", () => {
    // This test documents the known security issue: an Officer with no
    // assigned union falls through to the unscoped branch and sees ALL
    // unions' documents. Reported in the T60 task; behavior unchanged.
    const { docWhere, unionWhere } = buildDocumentTypesWhere({
      role: "OFFICER",
      assignedUnionId: null,
    });
    // BUG: docWhere has no unionId, so the query returns all documents
    expect(docWhere).not.toHaveProperty("unionId");
    expect(unionWhere).toEqual({});
  });
});
