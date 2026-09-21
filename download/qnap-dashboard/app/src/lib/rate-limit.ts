import { NextResponse } from "next/server";

// =============================================================================
// Rate limiting — in-memory, fixed-window counter.
//
// DESIGN CHOICES:
//
// 1. FIXED-WINDOW (not token bucket, not sliding window):
//    - Simplest correct implementation. Each (bucket, identifier) pair gets
//      a counter that resets at the end of its window.
//    - Downside: burst-at-boundary — a client can do ~2× the limit by
//      hitting right at the window edge (N requests at 11:59:59, then N
//      more at 12:00:00). For our use case (abuse prevention, not precise
//      throughput control), this is acceptable.
//    - If we later need smoother limiting, swap to token bucket — the
//      public API (checkRateLimit) stays the same.
//
// 2. PER-IDENTIFIER, NOT PER-IP:
//    - Authed routes pass `user.id` as the identifier — one user gets one
//      budget, regardless of how many devices they're on. Multiple users
//      behind one NAT (an office) get separate budgets.
//    - Public routes pass the IP — see /api/public/unions for the IP
//      extraction logic.
//
// 3. IN-MEMORY (not Redis):
//    - Fine for a single-process deployment. If we ever go multi-instance,
//      this MUST move to Redis (or similar) — otherwise each instance
//      gets its own budget and the effective limit is N× the configured
//      one.
//    - The Map is keyed by `${bucket}:${identifier}`. For authed routes,
//      the keyspace is bounded by user count (small). For public routes,
//      the keyspace is bounded by distinct IPs (could grow, but stale
//      entries are small and auto-overwrite on next access from that IP).
//      No explicit cleanup sweep is run — see the note at the bottom.
//
// 4. RESPONSE HEADERS:
//    - We emit the de-facto standard `X-RateLimit-*` headers (used by
//      GitHub, Stripe, AWS) on EVERY response from a rate-limited route,
//      not just on 429s. This lets polite clients self-throttle without
//      waiting for a 429.
//    - `Retry-After` is only emitted on 429s (per RFC 7231).
// =============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number; // epoch ms
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // epoch ms
}

// Global store. Module-level singleton — survives across requests in the
// same process. Keyed by `${bucket}:${identifier}`.
const store = new Map<string, RateLimitEntry>();

/**
 * Check whether a request should be allowed under the rate limit.
 *
 * @param bucket      Logical bucket name (e.g. "upload", "download"). Two
 *                    routes can share a bucket if they should share a
 *                    budget, or use separate buckets for independent
 *                    budgets.
 * @param identifier  Per-caller identifier — `user.id` for authed routes,
 *                    IP for public routes.
 * @param maxRequests Maximum requests allowed in the window.
 * @param windowMs    Window size in milliseconds.
 * @returns           A result object with `allowed`, `limit`, `remaining`,
 *                    and `resetAt`. The caller uses `allowed` to decide
 *                    whether to proceed, and the other fields to build
 *                    response headers.
 */
export function checkRateLimit(
  bucket: string,
  identifier: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  const key = `${bucket}:${identifier}`;
  const now = Date.now();

  let entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    // New window — first request in this period.
    entry = { count: 1, resetAt: now + windowMs };
    store.set(key, entry);
    return {
      allowed: true,
      limit: maxRequests,
      remaining: maxRequests - 1,
      resetAt: entry.resetAt,
    };
  }

  // Window still active — check the counter.
  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      limit: maxRequests,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count++;
  return {
    allowed: true,
    limit: maxRequests,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Build the standard rate-limit response headers for a successful request.
 *
 * Emit these on EVERY response (200/201/400/etc.), not just 429s — this
 * lets polite clients self-throttle by reading `X-RateLimit-Remaining`
 * before they hit the limit.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)), // epoch seconds
  };
}

/**
 * Build a 429 Too Many Requests response with the standard headers.
 *
 * Includes `Retry-After` (RFC 7231) so clients know how long to wait
 * before retrying. The body is a generic error message — we don't leak
 * the limit or reset time in the body (those are in the headers for
 * polite clients; an attacker probing the endpoint gets no extra info
 * from the body).
 */
export function rateLimitedResponse(result: RateLimitResult): NextResponse {
  const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
  return NextResponse.json(
    { error: "Too many requests. Please slow down." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, retryAfterSeconds)),
        ...rateLimitHeaders(result),
      },
    },
  );
}

// -----------------------------------------------------------------------------
// Pre-configured buckets for the authed routes.
//
// Limits are deliberately generous for normal use but tight enough to
// stop a script that's hammering the endpoint (e.g. a stolen session
// cookie being used to scrape or spam uploads).
//
// WRITE ops (upload, restore): 10/min per user.
//   - Normal use: an officer uploads maybe 2-3 documents per session.
//   - Abuse vector: a script trying to fill storage with junk uploads.
//
// READ ops (download): 30/min per user.
//   - Normal use: clicking through 5-10 documents in a row is fine.
//   - Abuse vector: a script scraping every document in the system.
// -----------------------------------------------------------------------------

export const RATE_LIMITS = {
  documentUpload: { max: 10, windowMs: 60_000 },
  documentDownload: { max: 30, windowMs: 60_000 },
  documentRestore: { max: 10, windowMs: 60_000 },
  publicSearch: { max: 60, windowMs: 60_000 },
} as const;

// =============================================================================
// NOTE ON CLEANUP:
// We don't run an explicit Map sweep. Justification:
//   - Authed routes: keyspace is bounded by user count (dozens to hundreds).
//     Each entry is ~50 bytes. Even 10k users = 500KB — negligible.
//   - Public routes: keyspace is bounded by distinct IPs. Could grow, but:
//       * Stale entries (IPs that never come back) are small.
//       * Entries auto-overwrite on the next request from that IP.
//       * In the worst case (100k distinct IPs), the Map is ~5MB — still
//         fine for a single-process Node app.
//   - If this ever becomes a memory concern, add a `setInterval` sweep
//     that runs every 5 minutes and deletes entries where `resetAt < now`.
//     The sweep is safe because any deleted entry will be re-created on
//     the next request from that identifier.
// =============================================================================
