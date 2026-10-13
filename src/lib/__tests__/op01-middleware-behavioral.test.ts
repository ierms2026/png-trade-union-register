import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// =============================================================================
// OP-01: DEMO_READ_ONLY middleware behavioral tests.
//
// Builds real NextRequest objects + calls the middleware function directly.
// Asserts blocked (403) vs allowed (next) per method + path.
// =============================================================================

// We need to import the middleware function. Because it reads process.env at
// call time (not at import time), we can toggle DEMO_READ_ONLY between tests.
// Import at top level — the middleware reads process.env at call time, so
// toggling DEMO_READ_ONLY between test groups works.
import { middleware } from "@/middleware";

async function callMiddleware(method: string, pathname: string) {
  const req = new NextRequest(
    new URL(`http://localhost:3000${pathname}`),
    { method },
  );
  return middleware(req);
}

const ORIG_DEMO_READ_ONLY = process.env.DEMO_READ_ONLY;

describe("OP-01: DEMO_READ_ONLY middleware — behavioral tests", () => {
  afterAll(() => {
    // Restore
    if (ORIG_DEMO_READ_ONLY !== undefined) {
      process.env.DEMO_READ_ONLY = ORIG_DEMO_READ_ONLY;
    } else {
      delete process.env.DEMO_READ_ONLY;
    }
  });

  describe("when DEMO_READ_ONLY is not set (no-op)", () => {
    beforeAll(() => {
      delete process.env.DEMO_READ_ONLY;
    });

    it("allows GET to any /api/ route", async () => {
      const res = await callMiddleware("GET", "/api/unions");
      expect(res.status).toBe(200); // NextResponse.next() returns 200
    });

    it("allows POST to any /api/ route (no-op mode)", async () => {
      const res = await callMiddleware("POST", "/api/unions");
      expect(res.status).toBe(200);
    });

    it("allows DELETE to any /api/ route (no-op mode)", async () => {
      const res = await callMiddleware("DELETE", "/api/unions/123");
      expect(res.status).toBe(200);
    });
  });

  describe("when DEMO_READ_ONLY=true (read-only mode)", () => {
    beforeAll(() => {
      process.env.DEMO_READ_ONLY = "true";
    });

    // --- Allowed methods ---
    it("allows GET to /api/unions", async () => {
      const res = await callMiddleware("GET", "/api/unions");
      expect(res.status).toBe(200);
    });

    it("allows GET to /api/public/files/nonexistent", async () => {
      const res = await callMiddleware("GET", "/api/public/files/nonexistent");
      expect(res.status).toBe(200);
    });

    it("allows HEAD to /api/unions", async () => {
      const res = await callMiddleware("HEAD", "/api/unions");
      expect(res.status).toBe(200);
    });

    it("allows OPTIONS to /api/unions", async () => {
      const res = await callMiddleware("OPTIONS", "/api/unions");
      expect(res.status).toBe(200);
    });

    // --- Allowed POST paths ---
    it("allows POST to /api/auth/login", async () => {
      const res = await callMiddleware("POST", "/api/auth/login");
      expect(res.status).toBe(200);
    });

    it("allows POST to /api/auth/logout", async () => {
      const res = await callMiddleware("POST", "/api/auth/logout");
      expect(res.status).toBe(200);
    });

    it("allows POST to /api/auth/login/2fa (2FA verification step)", async () => {
      const res = await callMiddleware("POST", "/api/auth/login/2fa");
      expect(res.status).toBe(200);
    });

    // --- Blocked POST paths ---
    it("blocks POST to /api/unions with 403", async () => {
      const res = await callMiddleware("POST", "/api/unions");
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("read-only demo");
    });

    it("blocks POST to /api/auth/forgot-password with 403", async () => {
      const res = await callMiddleware("POST", "/api/auth/forgot-password");
      expect(res.status).toBe(403);
    });

    it("blocks POST to /api/auth/set-password with 403", async () => {
      const res = await callMiddleware("POST", "/api/auth/set-password");
      expect(res.status).toBe(403);
    });

    it("blocks POST to /api/tasks with 403", async () => {
      const res = await callMiddleware("POST", "/api/tasks");
      expect(res.status).toBe(403);
    });

    it("blocks POST to /api/cron/compliance-sweep (cron is blocked)", async () => {
      const res = await callMiddleware("POST", "/api/cron/compliance-sweep");
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("read-only demo");
    });

    it("blocks PUT to /api/unions/123 with 403", async () => {
      const res = await callMiddleware("PUT", "/api/unions/123");
      expect(res.status).toBe(403);
    });

    it("blocks PATCH to /api/users/123 with 403", async () => {
      const res = await callMiddleware("PATCH", "/api/users/123");
      expect(res.status).toBe(403);
    });

    it("blocks DELETE to /api/webhooks/123 with 403", async () => {
      const res = await callMiddleware("DELETE", "/api/webhooks/123");
      expect(res.status).toBe(403);
    });

    // --- Response body shape ---
    it("the 403 response has a JSON body with an error message", async () => {
      const res = await callMiddleware("POST", "/api/unions");
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await res.json();
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(10);
    });
  });
});
