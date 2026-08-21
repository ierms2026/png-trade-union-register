import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { db } from "@/lib/prisma";
import { Role } from "@prisma/client";
import {
  SESSION_COOKIE_NAME,
  verifySessionCookieValue,
} from "@/lib/auth/session";

// =============================================================================
// AuthUser interface — defined here (was previously in context.ts, which
// has been deleted). All routes import AuthUser from auth-guard.
// =============================================================================

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  assignedUnionId: string | null;
  /**
   * API-key scopes (e.g. `["unions:read", "documents:read"]`).
   *
   * - `null` for session-cookie auth: browser sessions inherit the user's
   *   full role permissions (no scope narrowing).
   * - Populated for API-key auth: the key is restricted to these scopes
   *   REGARDLESS of the owner's role. A REGISTRAR-owned key with only
   *   `unions:read` cannot call `/api/audit` even though the owner could
   *   via the browser.
   *
   * Routes that accept API keys MUST check `user.scopes` if non-null.
   * The `hasScope` helper below makes this a one-liner.
   */
  scopes: string[] | null;
}

/**
 * Returns true if the authenticated user is permitted to perform an action
 * requiring the given scope.
 *
 * - Session-cookie users (scopes === null): always permitted — they
 *   inherit the user's full role permissions. Role-based access control
 *   is enforced separately by each route.
 * - API-key users (scopes is an array): permitted only if the scope is
 *   in the array.
 *
 * Usage:
 *   const user = await getAuthUserOrApiKey(req);
 *   if (!user || !hasScope(user, "audit:read")) return 401/403;
 */
export function hasScope(user: AuthUser, scope: string): boolean {
  if (user.scopes === null) return true; // session-cookie auth — role check applies
  return user.scopes.includes(scope);
}

// =============================================================================
// Real auth-guard — replaces the mock in context.ts.
//
// RESPONSIBILITIES:
//   1. Read the session cookie from the incoming request.
//   2. Verify the HMAC signature (cheap pre-DB reject for forged/expired
//      cookies — see session.ts for the crypto rationale).
//   3. Look up the Session row by JTI in the DB (the authoritative
//      revocation check — if the row was deleted, the session is revoked
//      even if the cookie's signature is still valid).
//   4. Check the Session row's expiresAt (DB-side truth — the cookie's
//      exp is just a cheap pre-DB reject; the row is authoritative).
//   5. Load the associated User row, check `disabled` (admin-toggled
//      disable should immediately invalidate all of the user's sessions,
//      even ones that haven't expired yet).
//   6. Return the AuthUser shape (id, name, email, role, assignedUnionId)
//      or `null` for any failure mode.
//
// WHY RETURN `null` FOR EVERY FAILURE (not distinct error codes):
//   - The caller (an API route) treats every null identically: return 401.
//   - Distinct error codes ("bad signature" vs "session revoked" vs
//     "user disabled") would leak information to an attacker probing
//     the system. A single 401 with no body detail is the correct
//     posture for an unauthenticated request.
//
// REUSE OF THE AuthUser TYPE FROM context.ts:
// The mock in context.ts defined the AuthUser interface. We re-import
// it here so the type is the single source of truth — every consumer
// (route handlers, the /api/auth/me endpoint, the audit-log helpers)
// imports the same shape. Swapping the mock for this real implementation
// was a one-line change at each import site.
// =============================================================================

/**
 * Read the session cookie value from the incoming request.
 *
 * Uses Next.js 14+ `cookies()` from `next/headers`, which works in both
 * App Router route handlers and Server Components. The cookie is
 * HttpOnly, so client-side JS can't read it — only the server can.
 *
 * Returns the raw cookie value string, or `null` if no cookie is present.
 */
async function readSessionCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  } catch {
    // cookies() can throw if called outside a request context (e.g.
    // during build). Treat as "no session" — the caller returns 401.
    return null;
  }
}

/**
 * Returns the current authenticated user, or `null` if unauthenticated.
 *
 * This is the REAL implementation that replaces the mock in context.ts.
 * Routes that previously imported getAuthUser from context.ts can swap
 * the import to auth-guard.ts with no other code changes — the signature
 * is identical (modulo the return type being `AuthUser | null` instead
 * of always-`AuthUser`; callers should add a `if (!user) return 401`
 * guard).
 *
 * @param _req  Optional request object — kept for signature parity with
 *              the mock (which read X-Test-* headers from it). The real
 *              implementation reads the cookie via `cookies()` from
 *              `next/headers`, so the request isn't used. We keep the
 *              param so existing call sites don't need to be rewritten.
 */
export async function getAuthUser(_req?: Request): Promise<AuthUser | null> {
  // 1. Read the cookie from the request.
  const cookieValue = await readSessionCookie();
  if (!cookieValue) return null;

  // 2. Verify the HMAC signature + cookie-level expiry. This is the
  //    cheap pre-DB reject: a forged or expired cookie returns null
  //    here without hitting the database.
  const verified = verifySessionCookieValue(cookieValue);
  if (!verified) return null;

  // 3. Look up the Session row by JTI. This is the authoritative
  //    revocation check — if the row was deleted (e.g. via logout, or
  //    via the sessions/[jti] DELETE endpoint), the session is revoked
  //    even if the cookie's signature is still valid.
  //
  //    We select only the fields we need (no need to load userAgent/ip
  //    for every request). The `user` relation is included so we can
  //    check the User row in the same query (avoids a second round-trip).
  const session = await db.session.findUnique({
    where: { jti: verified.jti },
    select: {
      id: true,
      jti: true,
      expiresAt: true,
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          assignedUnionId: true,
          disabled: true,
        },
      },
    },
  });

  // 4. Session row not found → revoked (or never existed). Treat as
  //    unauthenticated.
  if (!session) return null;

  // 5. Check the DB-side expiry. The cookie's exp is a cheap pre-DB
  //    reject, but the DB row's expiresAt is authoritative (e.g. if
  //    the session was created with a shorter TTL than the cookie, or
  //    if a future "session shortening" feature reduces expiresAt in
  //    place).
  if (session.expiresAt.getTime() <= Date.now()) return null;

  // 6. Check the user's `disabled` flag. This is the admin-toggled
  //    disable — it immediately invalidates ALL of the user's sessions,
  //    even ones that haven't expired yet. Without this check, a
  //    disabled user could keep using a valid session cookie until it
  //    expired (up to 7 days).
  if (session.user.disabled) return null;

  // 7. Build the AuthUser shape. We derive `name` from the email
  //    (the schema doesn't have a separate `name` column on User —
  //    see the Session 1 schema trim). This is fine for display
  //    purposes; if a real name is needed later, a column can be
  //    added without breaking this contract.
  //
  //    The name shown in audit logs (`actorName`) uses this derived
  //    value. It's a snapshot at action time, so even if the user's
  //    email changes later, the audit trail preserves the name as it
  //    was at the time of the action.
  const user: AuthUser = {
    id: session.user.id,
    name: session.user.email, // derived — see comment above
    email: session.user.email,
    role: session.user.role,
    assignedUnionId: session.user.assignedUnionId,
    // Session-cookie auth: no scope narrowing. Role-based access control
    // is enforced by each route.
    scopes: null,
  };

  return user;
}

// =============================================================================
// API Key Authentication
// -----------------------------------------------------------------------------
// getApiKeyUser(req) — reads the Authorization: Bearer header, hashes the
// key with SHA-256, looks up the ApiKey by keyHash, checks revocation +
// expiry + owner disabled, and returns the owner's AuthUser.
//
// Returns null if:
//   - No Authorization header
//   - Header doesn't start with "Bearer "
//   - Key not found in DB (keyHash doesn't match)
//   - Key is revoked (revokedAt IS NOT NULL)
//   - Key is expired (expiresAt <= now)
//   - Owner is disabled
// =============================================================================

export async function getApiKeyUser(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const rawKey = authHeader.slice("Bearer ".length);
  if (!rawKey.startsWith("urm_")) return null; // API keys always start with urm_

  // SHA-256 hash the presented key — we only store the hash, never the raw key
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  // Look up the ApiKey by hash, including the owner user
  const apiKey = await db.apiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      scopes: true,
      expiresAt: true,
      revokedAt: true,
      creator: {
        select: {
          id: true,
          email: true,
          role: true,
          assignedUnionId: true,
          disabled: true,
        },
      },
    },
  });

  // Key not found
  if (!apiKey) return null;

  // Key revoked
  if (apiKey.revokedAt) return null;

  // Key expired
  if (apiKey.expiresAt.getTime() <= Date.now()) return null;

  // Owner disabled — key immediately stops authenticating
  if (!apiKey.creator || apiKey.creator.disabled) return null;

  // Return the owner's identity as an AuthUser. The scopes from the
  // ApiKey row are attached — routes that accept API keys MUST check
  // `hasScope(user, "...")` to enforce scope narrowing.
  return {
    id: apiKey.creator.id,
    name: apiKey.creator.email,
    email: apiKey.creator.email,
    role: apiKey.creator.role,
    assignedUnionId: apiKey.creator.assignedUnionId,
    // Split the comma-separated scopes string into an array.
    // Empty/whitespace entries are filtered out defensively.
    scopes: apiKey.scopes
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  };
}

/**
 * Get the authenticated user — tries session cookie first, then API key.
 *
 * This is the unified entry point for all API routes. Browser requests
 * use session cookies; programmatic requests (scripts, integrations) use
 * API keys via the Authorization header.
 *
 * Usage:
 *   const user = await getAuthUserOrApiKey(req);
 *   if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 */
export async function getAuthUserOrApiKey(req: Request): Promise<AuthUser | null> {
  // Try session cookie first (browser requests)
  const sessionUser = await getAuthUser(req);
  if (sessionUser) return sessionUser;

  // Fall back to API key (programmatic requests)
  return getApiKeyUser(req);
}
