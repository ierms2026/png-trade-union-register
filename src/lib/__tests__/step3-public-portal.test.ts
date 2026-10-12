import { describe, it, expect, beforeEach, vi } from "vitest";
import { Role } from "@prisma/client";
import { NextRequest } from "next/server";
import { testDb, resetDb } from "./setup";
import { GET as publicUnionsGET } from "@/app/api/public/unions/route";
import { GET as publicUnionDetailGET } from "@/app/api/public/unions/[id]/route";
import { GET as publicFilesGET } from "@/app/api/public/files/[id]/route";

// No auth mock needed — these are public endpoints

async function seedUnion(name: string, regNo: string) {
  return testDb.union.create({ data: { unionName: name, registrationNo: regNo, status: "ACTIVE" } });
}

async function seedPublishedDoc(unionId: string, docType: string) {
  const doc = await testDb.document.create({
    data: { unionId, documentType: docType, reviewStatus: "APPROVED", reviewedAt: new Date(), isPublic: true },
  });
  const ver = await testDb.documentVersion.create({
    data: { documentId: doc.id, versionNumber: 1, fileName: "test", filePath: "/tmp/test.txt", fileSize: 5, checksum: "x", uploadedById: null },
  });
  return { doc, ver };
}

function makeReq(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://example.com${path}`, { headers });
}

// === 1. Public unions response keys ===
describe("1. /api/public/unions — exact key whitelist", () => {
  beforeEach(async () => { await resetDb(); await seedUnion("Alpha", "A1"); });

  it("response has exactly { id, unionName, registrationNo, status } per union", async () => {
    const res = await publicUnionsGET(makeReq("/api/public/unions"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unions).toHaveLength(1);
    const keys = Object.keys(body.unions[0]).sort();
    expect(keys).toEqual(["id", "registrationNo", "status", "unionName"]);
  });

  it("does NOT include fileNumber, address, contactPerson, contactEmail, contactPhone, remarks, updatedAt, createdAt", async () => {
    const res = await publicUnionsGET(makeReq("/api/public/unions"));
    const body = await res.json();
    const u = body.unions[0];
    expect(u).not.toHaveProperty("fileNumber");
    expect(u).not.toHaveProperty("address");
    expect(u).not.toHaveProperty("contactPerson");
    expect(u).not.toHaveProperty("contactEmail");
    expect(u).not.toHaveProperty("contactPhone");
    expect(u).not.toHaveProperty("remarks");
    expect(u).not.toHaveProperty("updatedAt");
    expect(u).not.toHaveProperty("createdAt");
  });
});

// === 2. Indistinguishable 404s for public/files/[id] ===
describe("2. /api/public/files/[id] — indistinguishable 404s", () => {
  beforeEach(async () => {
    await resetDb();
    const union = await seedUnion("Alpha", "A1");
    // Published doc with a file that doesn't exist on disk
    await seedPublishedDoc(union.id, "Constitution");
    // Non-published doc
    const privateDoc = await testDb.document.create({
      data: { unionId: union.id, documentType: "Bylaws", reviewStatus: "APPROVED", reviewedAt: new Date(), isPublic: false },
    });
    await testDb.documentVersion.create({
      data: { documentId: privateDoc.id, versionNumber: 1, fileName: "priv", filePath: "/tmp/priv.txt", fileSize: 5, checksum: "x", uploadedById: null },
    });
    // Disposed doc (was public)
    const disposedDoc = await testDb.document.create({
      data: { unionId: union.id, documentType: "Rules", reviewStatus: "APPROVED", reviewedAt: new Date(), isPublic: true, disposedAt: new Date() },
    });
    await testDb.documentVersion.create({
      data: { documentId: disposedDoc.id, versionNumber: 1, fileName: "disp", filePath: "/tmp/disp.txt", fileSize: 5, checksum: "x", uploadedById: null },
    });
  });

  it("nonexistent ID → 404", async () => {
    const res = await publicFilesGET(makeReq("/api/public/files/nonexistent-id"), { params: Promise.resolve({ id: "nonexistent-id" }) });
    expect(res.status).toBe(404);
    const body = await res.clone().text();
    expect(body).toBe(JSON.stringify({ error: "File not found." }));
  });

  it("non-published document → same 404 body", async () => {
    const privateVer = await testDb.documentVersion.findFirst({
      where: { document: { documentType: "Bylaws" } },
    });
    const res = await publicFilesGET(makeReq(`/api/public/files/${privateVer!.id}`), { params: Promise.resolve({ id: privateVer!.id }) });
    expect(res.status).toBe(404);
    const body = await res.clone().text();
    expect(body).toBe(JSON.stringify({ error: "File not found." }));
  });

  it("disposed document → same 404 body", async () => {
    const disposedVer = await testDb.documentVersion.findFirst({
      where: { document: { documentType: "Rules" } },
    });
    const res = await publicFilesGET(makeReq(`/api/public/files/${disposedVer!.id}`), { params: Promise.resolve({ id: disposedVer!.id }) });
    expect(res.status).toBe(404);
    const body = await res.clone().text();
    expect(body).toBe(JSON.stringify({ error: "File not found." }));
  });

  it("published but file missing on disk → same 404 body", async () => {
    const pubVer = await testDb.documentVersion.findFirst({
      where: { document: { documentType: "Constitution" } },
    });
    const res = await publicFilesGET(makeReq(`/api/public/files/${pubVer!.id}`), { params: Promise.resolve({ id: pubVer!.id }) });
    expect(res.status).toBe(404);
    const body = await res.clone().text();
    expect(body).toBe(JSON.stringify({ error: "File not found." }));
  });

  it("all four 404 responses are byte-identical", async () => {
    const r1 = await publicFilesGET(makeReq("/api/public/files/nonexistent"), { params: Promise.resolve({ id: "nonexistent" }) });
    const b1 = await r1.clone().text();

    const privateVer = await testDb.documentVersion.findFirst({ where: { document: { documentType: "Bylaws" } } });
    const r2 = await publicFilesGET(makeReq(`/api/public/files/${privateVer!.id}`), { params: Promise.resolve({ id: privateVer!.id }) });
    const b2 = await r2.clone().text();

    const disposedVer = await testDb.documentVersion.findFirst({ where: { document: { documentType: "Rules" } } });
    const r3 = await publicFilesGET(makeReq(`/api/public/files/${disposedVer!.id}`), { params: Promise.resolve({ id: disposedVer!.id }) });
    const b3 = await r3.clone().text();

    const pubVer = await testDb.documentVersion.findFirst({ where: { document: { documentType: "Constitution" } } });
    const r4 = await publicFilesGET(makeReq(`/api/public/files/${pubVer!.id}`), { params: Promise.resolve({ id: pubVer!.id }) });
    const b4 = await r4.clone().text();

    expect(b1).toBe(b2);
    expect(b2).toBe(b3);
    expect(b3).toBe(b4);
    expect(r1.status).toBe(r2.status);
    expect(r2.status).toBe(r3.status);
    expect(r3.status).toBe(r4.status);
  });
});

// === 3. Type + disposal check on every request ===
describe("3. /api/public/files/[id] — checks run on every request", () => {
  beforeEach(async () => {
    await resetDb();
    const union = await seedUnion("Alpha", "A1");
    await seedPublishedDoc(union.id, "Constitution");
  });

  it("isPublic=false → 404 (visibility check runs)", async () => {
    const ver = await testDb.documentVersion.findFirst({});
    await testDb.document.update({ where: { id: ver!.documentId }, data: { isPublic: false } });
    const res = await publicFilesGET(makeReq(`/api/public/files/${ver!.id}`), { params: Promise.resolve({ id: ver!.id }) });
    expect(res.status).toBe(404);
  });

  it("disposedAt set → 404 (disposal check runs)", async () => {
    const ver = await testDb.documentVersion.findFirst({});
    await testDb.document.update({ where: { id: ver!.documentId }, data: { disposedAt: new Date() } });
    const res = await publicFilesGET(makeReq(`/api/public/files/${ver!.id}`), { params: Promise.resolve({ id: ver!.id }) });
    expect(res.status).toBe(404);
  });
});

// === 4. Rate limiting ===
describe("4. /api/public/unions — rate limiting", () => {
  beforeEach(async () => { await resetDb(); await seedUnion("Alpha", "A1"); });

  it("61st request in a minute → 429 with Retry-After + X-RateLimit-* headers", async () => {
    // The route uses the shared checkRateLimit with publicSearch: { max: 60, windowMs: 60000 }
    // We need to fire 60 requests, then the 61st should get 429.
    // Use a unique IP to avoid interference from other tests.
    const ip = `10.99.99.1`;
    const headers = { "x-forwarded-for": ip };

    // Fire 60 requests (should all succeed)
    for (let i = 0; i < 60; i++) {
      const res = await publicUnionsGET(makeReq("/api/public/unions", headers));
      expect(res.status).toBe(200);
    }

    // 61st request → 429
    const res = await publicUnionsGET(makeReq("/api/public/unions", headers));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Limit")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });

  it("rate limit keys on X-Forwarded-For — different IPs get separate budgets", async () => {
    // Fire 60 from IP A
    for (let i = 0; i < 60; i++) {
      await publicUnionsGET(makeReq("/api/public/unions", { "x-forwarded-for": "10.99.1.1" }));
    }
    // IP A is now rate-limited
    const resA = await publicUnionsGET(makeReq("/api/public/unions", { "x-forwarded-for": "10.99.1.1" }));
    expect(resA.status).toBe(429);
    // IP B should still work
    const resB = await publicUnionsGET(makeReq("/api/public/unions", { "x-forwarded-for": "10.99.2.2" }));
    expect(resB.status).toBe(200);
  });
});

// === 5. Legislation library startup check ===
describe("5. instrumentation — legislation library check", () => {
  it("instrumentation.ts exists and has a register() function", async () => {
    const mod = await import("../../../instrumentation");
    expect(mod.register).toBeDefined();
    expect(typeof mod.register).toBe("function");
  });

  it("register() does not throw when legislation.json exists", async () => {
    const mod = await import("../../../instrumentation");
    // The file exists in public/legislation/legislation.json — should not throw
    await expect(mod.register()).resolves.not.toThrow();
  });
});

// === 6. No authenticated chrome on public pages ===
describe("6. public routes — no auth chrome in responses", () => {
  beforeEach(async () => { await resetDb(); await seedUnion("Alpha", "A1"); });

  it("/api/public/unions response has no user/session/token/role fields", async () => {
    const res = await publicUnionsGET(makeReq("/api/public/unions"));
    const body = await res.json();
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/"user"/i);
    expect(json).not.toMatch(/"session"/i);
    expect(json).not.toMatch(/"token"/i);
    expect(json).not.toMatch(/"role"/i);
    expect(json).not.toMatch(/"email"/i);
    expect(json).not.toMatch(/"passwordHash"/i);
  });

  it("/api/public/unions/[id] response has no auth fields", async () => {
    const union = await testDb.union.findFirstOrThrow();
    const res = await publicUnionDetailGET(makeReq(`/api/public/unions/${union.id}`), { params: Promise.resolve({ id: union.id }) });
    const body = await res.json();
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/"user"/i);
    expect(json).not.toMatch(/"session"/i);
    expect(json).not.toMatch(/"token"/i);
    expect(json).not.toMatch(/"passwordHash"/i);
  });
});
