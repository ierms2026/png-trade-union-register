import { describe, it, expect, beforeEach, vi } from "vitest";
import { Role } from "@prisma/client";
import { testDb, resetDb } from "./setup";
import { createScopedActors, toAuthUser, makeRequest } from "./helpers/scope-route-test";

// Mock auth-guard — different routes use different functions
vi.mock("@/lib/auth/auth-guard", () => ({
  getAuthUser: vi.fn(),
  getAuthUserOrApiKey: vi.fn(),
  hasScope: vi.fn((user: { scopes: string[] | null }, _scope: string) => {
    if (user.scopes === null) return true;
    return user.scopes.includes(_scope);
  }),
}));

import { getAuthUser, getAuthUserOrApiKey } from "@/lib/auth/auth-guard";
import { GET as unionsGET } from "@/app/api/unions/route";
import { GET as complianceGET } from "@/app/api/compliance/route";
import { GET as documentsGET } from "@/app/api/documents/route";
import { GET as tasksGET } from "@/app/api/tasks/route";
import { GET as exportStatsGET } from "@/app/api/export/stats/route";
import { GET as tasksAssigneesGET } from "@/app/api/tasks/assignees/route";

const mockedGetAuthUser = vi.mocked(getAuthUser);
const mockedGetAuthUserOrApiKey = vi.mocked(getAuthUserOrApiKey);

async function seed() {
  const rule = await testDb.complianceRule.create({ data: { documentType: "Constitution", required: true, renewalYears: 1, retentionYrs: 5 } });
  const alpha = await testDb.union.create({ data: { unionName: "Alpha", registrationNo: "A", status: "ACTIVE" } });
  const beta = await testDb.union.create({ data: { unionName: "Beta", registrationNo: "B", status: "ACTIVE" } });
  const docA = await testDb.document.create({ data: { unionId: alpha.id, documentType: "Constitution", reviewStatus: "APPROVED", reviewedAt: new Date() } });
  await testDb.documentVersion.create({ data: { documentId: docA.id, versionNumber: 1, fileName: "c.pdf", filePath: "/tmp/c.pdf", fileSize: 100, checksum: "x", uploadedById: null } });
  return { rule, alpha, beta, docA };
}

describe("Step 1 behavioral: unassigned officer gets nothing", () => {
  beforeEach(async () => {
    await resetDb();
    const { alpha } = await seed();
    const actors = await createScopedActors(alpha.id);
    mockedGetAuthUserOrApiKey.mockResolvedValue(toAuthUser(actors.officerUnassigned));
    mockedGetAuthUser.mockResolvedValue(toAuthUser(actors.officerUnassigned));
  });

  it("/api/unions → 403", async () => {
    const res = await unionsGET(makeRequest("GET", "/api/unions"));
    expect(res.status).toBe(403);
  });

  it("/api/compliance → 403", async () => {
    const res = await complianceGET(makeRequest("GET", "/api/compliance"));
    expect(res.status).toBe(403);
  });

  it("/api/documents → 403", async () => {
    const res = await documentsGET(makeRequest("GET", "/api/documents"));
    expect(res.status).toBe(403);
  });

  it("/api/export/stats → 403", async () => {
    const res = await exportStatsGET(makeRequest("GET", "/api/export/stats"));
    expect(res.status).toBe(403);
  });
});

describe("Step 1 behavioral: assigned officer sees only own union", () => {
  beforeEach(async () => {
    await resetDb();
    const { alpha, beta } = await seed();
    const actors = await createScopedActors(alpha.id);
    mockedGetAuthUserOrApiKey.mockResolvedValue(toAuthUser(actors.officerAssigned));
    mockedGetAuthUser.mockResolvedValue(toAuthUser(actors.officerAssigned));
  });

  it("/api/unions → only Alpha (not Beta)", async () => {
    const res = await unionsGET(makeRequest("GET", "/api/unions"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unions).toHaveLength(1);
    expect(body.unions[0].unionName).toBe("Alpha");
  });

  it("/api/compliance → only Alpha row", async () => {
    const res = await complianceGET(makeRequest("GET", "/api/compliance"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unions).toHaveLength(1);
    expect(body.unions[0].unionName).toBe("Alpha");
  });
});

describe("Step 1 behavioral: tasks allowlist (cross-union task stays visible)", () => {
  beforeEach(async () => {
    await resetDb();
    const { alpha, beta } = await seed();
    const actors = await createScopedActors(alpha.id);
    // Create a task in Beta (other union) but assign it to the Alpha officer
    await testDb.task.create({
      data: {
        title: "Cross-union task",
        unionId: beta.id,
        assigneeId: actors.officerAssigned.id,
        createdById: actors.registrar.id,
        status: "PENDING",
      },
    });
    // Create a task in Alpha (own union)
    await testDb.task.create({
      data: {
        title: "Own union task",
        unionId: alpha.id,
        assigneeId: actors.officerAssigned.id,
        createdById: actors.registrar.id,
        status: "PENDING",
      },
    });
    mockedGetAuthUser.mockResolvedValue(toAuthUser(actors.officerAssigned));
  });

  it("officer sees tasks from own union + tasks assigned to them (cross-union)", async () => {
    const res = await tasksGET(makeRequest("GET", "/api/tasks"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const titles = body.tasks?.map((t: { title: string }) => t.title) ?? [];
    expect(titles).toContain("Cross-union task");
    expect(titles).toContain("Own union task");
  });
});

describe("Step 1 behavioral: tasks/assignees returns 403 for officers", () => {
  beforeEach(async () => {
    await resetDb();
    const { alpha } = await seed();
    const actors = await createScopedActors(alpha.id);
    mockedGetAuthUser.mockResolvedValue(toAuthUser(actors.officerAssigned));
  });

  it("officer → 403", async () => {
    const res = await tasksAssigneesGET(makeRequest("GET", "/api/tasks/assignees"));
    expect(res.status).toBe(403);
  });
});
