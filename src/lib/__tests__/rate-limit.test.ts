import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  rateLimitHeaders,
  rateLimitedResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

// =============================================================================
// Rate limiter tests.
//
// The rate limiter uses a module-level Map that survives across tests within
// the same file. To avoid cross-test state leakage, every test uses a unique
// identifier drawn from a monotonically-increasing counter (`freshId`).
//
// Time is controlled with vi.useFakeTimers() + vi.setSystemTime() so window
// boundaries are deterministic.
// =============================================================================

let freshId = 0;
const BASE_TIME = new Date("2024-01-15T12:00:00Z").getTime();

beforeEach(() => {
  freshId++;
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows the first request in a fresh window", () => {
    const r = checkRateLimit("bucket", `id-${freshId}`, 5, 60_000);
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(5);
    expect(r.remaining).toBe(4);
  });

  it("decrements the remaining counter on each subsequent allowed request", () => {
    const id = `id-${freshId}`;
    expect(checkRateLimit("b", id, 5, 60_000).remaining).toBe(4);
    expect(checkRateLimit("b", id, 5, 60_000).remaining).toBe(3);
    expect(checkRateLimit("b", id, 5, 60_000).remaining).toBe(2);
    expect(checkRateLimit("b", id, 5, 60_000).remaining).toBe(1);
  });

  it("blocks the request once the limit is exhausted", () => {
    const id = `id-${freshId}`;
    for (let i = 0; i < 5; i++) checkRateLimit("b", id, 5, 60_000);
    const r = checkRateLimit("b", id, 5, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.limit).toBe(5);
  });

  it("resets the counter after the window elapses", () => {
    const id = `id-${freshId}`;
    for (let i = 0; i < 5; i++) checkRateLimit("b", id, 5, 60_000);
    expect(checkRateLimit("b", id, 5, 60_000).allowed).toBe(false);

    // Advance past the 60s window.
    vi.setSystemTime(BASE_TIME + 60_001);
    const r = checkRateLimit("b", id, 5, 60_000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4); // fresh window, first hit
  });

  it("treats the exact window boundary correctly (now === resetAt is still in-window; now > resetAt starts a new window)", () => {
    const id = `id-${freshId}`;
    const first = checkRateLimit("b", id, 5, 60_000);
    // resetAt === now + windowMs. Advance to exactly resetAt.
    // The guard is `now > entry.resetAt` — at equality the window is still active.
    vi.setSystemTime(first.resetAt);
    const stillInWindow = checkRateLimit("b", id, 5, 60_000);
    expect(stillInWindow.allowed).toBe(true);
    expect(stillInWindow.remaining).toBe(3); // count went 1 → 2; remaining = 5-2

    // Advance 1ms past resetAt — new window.
    vi.setSystemTime(first.resetAt + 1);
    const newWindow = checkRateLimit("b", id, 5, 60_000);
    expect(newWindow.allowed).toBe(true);
    expect(newWindow.remaining).toBe(4); // fresh window
  });

  it("keeps per-identifier counters independent", () => {
    const idA = `id-${freshId}-a`;
    const idB = `id-${freshId}-b`;
    // Exhaust idA.
    for (let i = 0; i < 5; i++) checkRateLimit("b", idA, 5, 60_000);
    expect(checkRateLimit("b", idA, 5, 60_000).allowed).toBe(false);
    // idB has its own budget — first hit is allowed with full remaining.
    const r = checkRateLimit("b", idB, 5, 60_000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  it("keeps per-bucket counters independent for the same identifier", () => {
    const id = `id-${freshId}`;
    // Exhaust the "upload" bucket.
    for (let i = 0; i < 5; i++) checkRateLimit("upload", id, 5, 60_000);
    expect(checkRateLimit("upload", id, 5, 60_000).allowed).toBe(false);
    // The "download" bucket for the same identifier is independent.
    const r = checkRateLimit("download", id, 5, 60_000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  it("exposes a resetAt timestamp equal to now + windowMs on the first hit", () => {
    const r = checkRateLimit("b", `id-${freshId}`, 5, 60_000);
    expect(r.resetAt).toBe(BASE_TIME + 60_000);
  });
});

describe("rateLimitHeaders", () => {
  it("emits X-RateLimit-* headers on a 200 (allowed) result", () => {
    const r = checkRateLimit("b", `id-${freshId}`, 10, 60_000);
    const h = rateLimitHeaders(r);
    expect(h["X-RateLimit-Limit"]).toBe("10");
    expect(h["X-RateLimit-Remaining"]).toBe("9");
    // Reset is emitted as epoch SECONDS (not ms).
    expect(h["X-RateLimit-Reset"]).toBe(String(Math.ceil(r.resetAt / 1000)));
  });

  it("emits X-RateLimit-* headers on a 429 (denied) result with remaining=0", () => {
    const id = `id-${freshId}`;
    for (let i = 0; i < 3; i++) checkRateLimit("b", id, 3, 60_000);
    const denied = checkRateLimit("b", id, 3, 60_000);
    expect(denied.allowed).toBe(false);
    const h = rateLimitHeaders(denied);
    expect(h["X-RateLimit-Limit"]).toBe("3");
    expect(h["X-RateLimit-Remaining"]).toBe("0");
    expect(h["X-RateLimit-Reset"]).toBe(String(Math.ceil(denied.resetAt / 1000)));
  });
});

describe("rateLimitedResponse", () => {
  it("includes a Retry-After header (>= 1 second) on 429 responses", () => {
    const id = `id-${freshId}`;
    for (let i = 0; i < 3; i++) checkRateLimit("b", id, 3, 60_000);
    const denied = checkRateLimit("b", id, 3, 60_000);
    const res = rateLimitedResponse(denied);
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
  });

  it("returns a generic error body that does not leak the limit or reset time", async () => {
    const id = `id-${freshId}`;
    for (let i = 0; i < 3; i++) checkRateLimit("b", id, 3, 60_000);
    const denied = checkRateLimit("b", id, 3, 60_000);
    const res = rateLimitedResponse(denied);
    const body = await res.json();
    expect(body).toEqual({ error: "Too many requests. Please slow down." });
    // The body must not echo the configured limit, remaining count, or reset
    // time — those travel in the headers for polite clients only.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(String(denied.limit));
    expect(serialized).not.toContain("reset");
    expect(serialized).not.toContain("remaining");
  });
});

describe("RATE_LIMITS config", () => {
  it("configures the known buckets (upload, download, restore, publicSearch)", () => {
    expect(RATE_LIMITS.documentUpload).toBeDefined();
    expect(RATE_LIMITS.documentDownload).toBeDefined();
    expect(RATE_LIMITS.documentRestore).toBeDefined();
    expect(RATE_LIMITS.publicSearch).toBeDefined();
  });

  it("applies tighter limits to write ops (upload/restore) than to read ops (download)", () => {
    expect(RATE_LIMITS.documentUpload.max).toBeLessThan(
      RATE_LIMITS.documentDownload.max,
    );
    expect(RATE_LIMITS.documentRestore.max).toBeLessThan(
      RATE_LIMITS.documentDownload.max,
    );
  });

  it("uses 1-minute windows across all configured buckets", () => {
    const buckets = Object.values(RATE_LIMITS) as Array<{
      max: number;
      windowMs: number;
    }>;
    for (const bucket of buckets) {
      expect(bucket.windowMs).toBe(60_000);
    }
  });
});
