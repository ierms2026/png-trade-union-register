import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { resetDb, testDb } from "./setup";

// =============================================================================
// OP-01: Public 404 indistinguishability test — direct route handler call.
//
// Calls the /api/public/files/[id] route handler DIRECTLY (no dev server,
// no HTTP fetch). Seeds 3 documents in the TEST db:
//   1. A non-public Financial Return (isPublic: false)
//   2. A disposed Registration Certificate (disposedAt: set)
//   3. A nonexistent ID (random string)
//
// Asserts identical status, headers, and body byte-for-byte for all 3.
// =============================================================================

// We need to import the route handler. The dynamic import avoids path issues.
async function callRouteHandler(id: string) {
  const mod = await import("../../app/api/public/files/[id]/route");
  const req = new NextRequest(
    new URL(`http://localhost:3000/api/public/files/${id}`),
    { method: "GET" },
  );
  const res = await mod.GET(req, { params: Promise.resolve({ id }) });
  const body = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { status: res.status, body, headers };
}

describe("OP-01: public /api/public/files indistinguishable 404 (direct handler call)", () => {
  let nonPublicVersionId: string;
  let disposedVersionId: string;
  const nonexistentId = "cm-nonexistent-id-000001";

  beforeEach(async () => {
    await resetDb();

    const union = await testDb.union.create({
      data: {
        unionName: "Test Union for 404",
        registrationNo: "IO-TEST-404",
        fileNumber: "DLIR-2026-404",
      },
    });

    // 1. Non-public Financial Return
    const nonPublicDoc = await testDb.document.create({
      data: {
        unionId: union.id,
        documentType: "Financial Return",
        isPublic: false,
        reviewStatus: "APPROVED",
      },
    });
    const nonPublicVersion = await testDb.documentVersion.create({
      data: {
        documentId: nonPublicDoc.id,
        versionNumber: 1,
        fileName: "non-public-return.pdf",
        filePath: "fake/non-public.pdf",
        fileSize: 100,
        checksum: "fake-checksum-non-public",
      },
    });
    nonPublicVersionId = nonPublicVersion.id;

    // 2. Disposed Registration Certificate (isPublic: true but disposedAt: set)
    const disposedDoc = await testDb.document.create({
      data: {
        unionId: union.id,
        documentType: "Registration Certificate",
        isPublic: true,
        disposedAt: new Date(),
        reviewStatus: "APPROVED",
      },
    });
    const disposedVersion = await testDb.documentVersion.create({
      data: {
        documentId: disposedDoc.id,
        versionNumber: 1,
        fileName: "disposed-cert.pdf",
        filePath: "fake/disposed.pdf",
        fileSize: 100,
        checksum: "fake-checksum-disposed",
      },
    });
    disposedVersionId = disposedVersion.id;
  });

  afterEach(async () => {
    await resetDb();
  });

  it("all 3 failure modes return identical status (404)", async () => {
    const [r1, r2, r3] = await Promise.all([
      callRouteHandler(nonPublicVersionId),
      callRouteHandler(disposedVersionId),
      callRouteHandler(nonexistentId),
    ]);

    console.log("  non-public:  status=" + r1.status + ' body="' + r1.body + '"');
    console.log("  disposed:    status=" + r2.status + ' body="' + r2.body + '"');
    console.log("  nonexistent: status=" + r3.status + ' body="' + r3.body + '"');

    expect(r1.status).toBe(404);
    expect(r2.status).toBe(404);
    expect(r3.status).toBe(404);
  });

  it("all 3 failure modes return identical body (byte-for-byte)", async () => {
    const [r1, r2, r3] = await Promise.all([
      callRouteHandler(nonPublicVersionId),
      callRouteHandler(disposedVersionId),
      callRouteHandler(nonexistentId),
    ]);

    expect(r1.body).toBe(r2.body);
    expect(r2.body).toBe(r3.body);
  });

  it("all 3 failure modes return identical content-type header", async () => {
    const [r1, r2, r3] = await Promise.all([
      callRouteHandler(nonPublicVersionId),
      callRouteHandler(disposedVersionId),
      callRouteHandler(nonexistentId),
    ]);

    expect(r1.headers["content-type"]).toBe(r2.headers["content-type"]);
    expect(r2.headers["content-type"]).toBe(r3.headers["content-type"]);
  });

  it("the body is the 'File not found.' JSON error", async () => {
    const r = await callRouteHandler(nonexistentId);
    expect(r.body).toBe(JSON.stringify({ error: "File not found." }));
  });

  it("calling each case 3 times returns identical responses (no body-consumption bug)", async () => {
    // OP-01: verify the notFoundResponse() factory creates a FRESH response
    // each time. A shared module-level NextResponse would have its body
    // consumed on the first read, leaving empty bodies for subsequent reads.
    for (const id of [nonPublicVersionId, disposedVersionId, nonexistentId]) {
      const results = await Promise.all([
        callRouteHandler(id),
        callRouteHandler(id),
        callRouteHandler(id),
      ]);
      // All 3 calls must return the same status
      expect(results[0].status).toBe(404);
      expect(results[1].status).toBe(404);
      expect(results[2].status).toBe(404);
      // All 3 calls must return the same non-empty body
      expect(results[0].body).toBe(results[1].body);
      expect(results[1].body).toBe(results[2].body);
      expect(results[0].body.length).toBeGreaterThan(0);
      // Body must be the JSON error
      expect(results[0].body).toBe(JSON.stringify({ error: "File not found." }));
    }
  });
});
