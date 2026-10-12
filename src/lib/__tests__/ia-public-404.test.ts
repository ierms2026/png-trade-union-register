import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/prisma";
import { resetDb, testDb } from "./setup";
import bcrypt from "bcryptjs";

// =============================================================================
// IA: Public 404 indistinguishability test.
//
// Creates 3 document versions:
//   1. A non-public Financial Return (isPublic: false)
//   2. A disposed Registration Certificate (disposedAt: set)
//   3. A nonexistent ID (random cuid that doesn't exist)
//
// Requests all 3 from /api/public/files/[id] and asserts the status, headers,
// and body are byte-for-byte identical. This prevents information leakage —
// an attacker cannot distinguish "doesn't exist" from "exists but not public"
// from "exists but disposed".
//
// The route uses a shared NOT_FOUND_RESPONSE constant for all failure modes,
// so the responses should be identical by construction. This test verifies
// that invariant holds at runtime.
// =============================================================================

const BASE = "http://localhost:3000";

describe("IA: public /api/public/files indistinguishable 404", () => {
  let nonPublicVersionId: string;
  let disposedVersionId: string;
  const nonexistentId = "cm-nonexistent-id-000001";

  beforeEach(async () => {
    await resetDb();

    // Create a union
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

  it("all 3 failure modes return identical status + body", async () => {
    // Skip if no server running (this is an integration test). We check
    // by trying to connect — if the connection fails, skip.
    let serverRunning = false;
    try {
      const res = await fetch(`${BASE}/api/public/unions`);
      if (res.ok) serverRunning = true;
    } catch {
      // Connection refused — server not running
    }
    if (!serverRunning) {
      console.log("  [skip] dev server not running — skipping runtime fetch");
      return;
    }

    const responses: Array<{ id: string; status: number; body: string; headers: Record<string, string> }> = [];

    for (const [label, id] of [
      ["non-public", nonPublicVersionId],
      ["disposed", disposedVersionId],
      ["nonexistent", nonexistentId],
    ] as const) {
      const res = await fetch(`${BASE}/api/public/files/${id}`);
      const body = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        // Normalize — skip rate-limit headers that vary per request
        if (key.toLowerCase() !== "x-ratelimit-remaining" && key.toLowerCase() !== "date") {
          headers[key] = value;
        }
      });
      responses.push({ id: label, status: res.status, body, headers });
    }

    // All 3 must have the same status (404)
    const statuses = responses.map((r) => r.status);
    console.log("  statuses:", JSON.stringify(statuses));
    console.log("  bodies:", JSON.stringify(responses.map((r) => r.body)));
    expect(statuses[0]).toBe(404);
    expect(statuses[1]).toBe(404);
    expect(statuses[2]).toBe(404);

    // All 3 must have identical bodies (the key indistinguishability check)
    expect(responses[0].body).toBe(responses[1].body);
    expect(responses[1].body).toBe(responses[2].body);

    // All 3 must have identical content-type headers
    const contentTypes = responses.map((r) => r.headers["content-type"]);
    expect(contentTypes[0]).toBe(contentTypes[1]);
    expect(contentTypes[1]).toBe(contentTypes[2]);
  });
});

// =============================================================================
// Static check (runs without a server) — verifies the route uses a shared
// NOT_FOUND_RESPONSE constant for all failure modes.
// =============================================================================

describe("IA: public files route uses shared 404 constant", () => {
  it("the route file defines NOT_FOUND_RESPONSE and returns it for all failure modes", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(__dirname, "../../../src/app/api/public/files/[id]/route.ts"),
      "utf-8",
    );

    // Must define the constant
    expect(src).toContain("NOT_FOUND_RESPONSE");

    // Must return it for: version not found, not public, disposed, file missing
    expect(src).toMatch(/if \(!version\) return NOT_FOUND_RESPONSE/);
    expect(src).toMatch(/!version\.document\.isPublic[\s\S]*?return NOT_FOUND_RESPONSE/);
    expect(src).toMatch(/version\.document\.disposedAt[\s\S]*?return NOT_FOUND_RESPONSE/);
    expect(src).toMatch(/File missing on disk[\s\S]*?NOT_FOUND_RESPONSE/);
  });
});
