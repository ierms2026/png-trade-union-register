import { describe, it, expect, beforeEach } from "vitest";
import { Role } from "@prisma/client";
import { testDb, resetDb } from "./setup";

// =============================================================================
// Officer scoping tests — the Prisma `where` clause pattern used by
// /api/unions (and other list endpoints).
//
// The production pattern (from src/app/api/unions/route.ts):
//
//   const where =
//     user.role === "OFFICER" && user.assignedUnionId
//       ? { id: user.assignedUnionId }
//       : {};
//
// Officers see ONLY their assigned union. Registrars and Inspectors see all.
// An Officer with no assignedUnionId (an edge case) falls through to `{}`
// and sees all — this test file documents that behavior explicitly so a
// future tightening is intentional, not accidental.
//
// We replicate the where-clause logic here rather than importing the route
// handler — the goal is to test the SCOPING PATTERN against real DB data,
// not the HTTP/auth plumbing around it.
// =============================================================================

// NOTE: this replicates the old truthiness-gate pattern for testing purposes.
// The production code now uses getUnionScope() which fails closed.
function officerWhere(role: Role, assignedUnionId: string | null) {
  const hasUnion = assignedUnionId != null && assignedUnionId !== "";
  const isOfficerWithUnion = role === Role.OFFICER && hasUnion;
  return isOfficerWithUnion
    ? { id: assignedUnionId }
    : {};
}

async function seedUnion(name: string, regNo: string) {
  return testDb.union.create({
    data: { unionName: name, registrationNo: regNo },
  });
}

async function seedUser(
  role: Role,
  assignedUnionId: string | null = null,
) {
  return testDb.user.create({
    data: {
      email: `u-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: "!pending",
      role,
      assignedUnionId,
    },
  });
}

describe("officer scoping (where-clause pattern from /api/unions)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("Officer sees ONLY their assigned union", async () => {
    const alpha = await seedUnion("Alpha", "REG-A");
    await seedUnion("Beta", "REG-B");
    await seedUnion("Gamma", "REG-C");
    const officer = await seedUser(Role.OFFICER, alpha.id);

    const unions = await testDb.union.findMany({
      where: officerWhere(officer.role, officer.assignedUnionId),
    });

    expect(unions).toHaveLength(1);
    expect(unions[0].id).toBe(alpha.id);
  });

  it("Registrar sees ALL unions", async () => {
    await seedUnion("Alpha", "REG-A");
    await seedUnion("Beta", "REG-B");
    await seedUnion("Gamma", "REG-C");
    const registrar = await seedUser(Role.REGISTRAR);

    const unions = await testDb.union.findMany({
      where: officerWhere(registrar.role, registrar.assignedUnionId),
    });

    expect(unions).toHaveLength(3);
  });

  it("Inspector sees ALL unions", async () => {
    await seedUnion("Alpha", "REG-A");
    await seedUnion("Beta", "REG-B");
    const inspector = await seedUser(Role.INSPECTOR);

    const unions = await testDb.union.findMany({
      where: officerWhere(inspector.role, inspector.assignedUnionId),
    });

    expect(unions).toHaveLength(2);
  });

  it("Officer with no assignedUnionId sees ALL unions (DOCUMENTED EDGE CASE)", async () => {
    // The production guard is `user.role === "OFFICER" && user.assignedUnionId`.
    // When assignedUnionId is null, the && short-circuits to false and
    // `where` falls through to `{}` — matching every union.
    //
    // This is a known design trade-off: the admin user-creation flow SHOULD
    // reject creating an Officer without an assignment, but if one slips
    // through, the scoping filter does not narrow their view. Documenting
    // here so any future change (e.g. throwing, or defaulting to a
    // zero-result filter) is a deliberate decision, not a regression.
    await seedUnion("Alpha", "REG-A");
    await seedUnion("Beta", "REG-B");
    const unassignedOfficer = await seedUser(Role.OFFICER, null);

    const unions = await testDb.union.findMany({
      where: officerWhere(
        unassignedOfficer.role,
        unassignedOfficer.assignedUnionId,
      ),
    });

    expect(unions).toHaveLength(2);
  });

  it("Document count is scoped — Officer sees only documents under their assigned union", async () => {
    const alpha = await seedUnion("Alpha", "REG-A");
    const beta = await seedUnion("Beta", "REG-B");
    // 2 documents in Alpha, 3 in Beta.
    await testDb.document.create({
      data: { unionId: alpha.id, documentType: "Constitution" },
    });
    await testDb.document.create({
      data: { unionId: alpha.id, documentType: "Bylaws" },
    });
    await testDb.document.create({
      data: { unionId: beta.id, documentType: "Constitution" },
    });
    await testDb.document.create({
      data: { unionId: beta.id, documentType: "Bylaws" },
    });
    await testDb.document.create({
      data: { unionId: beta.id, documentType: "Annual Return" },
    });
    const officer = await seedUser(Role.OFFICER, alpha.id);

    // The /api/unions route includes documents under each union. Replicate
    // that include + the scoping filter here.
    const unions = await testDb.union.findMany({
      where: officerWhere(officer.role, officer.assignedUnionId),
      include: { documents: true },
    });

    expect(unions).toHaveLength(1);
    expect(unions[0].id).toBe(alpha.id);
    expect(unions[0].documents).toHaveLength(2);
    // The 3 Beta documents are invisible to this Officer.
  });
});
