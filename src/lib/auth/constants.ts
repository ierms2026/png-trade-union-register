// =============================================================================
// Auth constants — the single source of truth for tunable security parameters.
//
// Why these live here (and not as magic numbers inline):
//   - Tunable in one place — change LOCKOUT_THRESHOLD from 3 to 5 here, the
//     entire app picks it up on next reload. No grep-and-replace.
//   - Documented *why*, not just *what* — every constant has a comment
//     explaining the business reason for its value.
//   - Future phases add their own constants to this same file:
//       EXPIRING_WINDOW_DAYS = 90    (Session 3 — Compliance Engine)
//       PUBLIC_RATE_LIMIT_PER_MIN = 60 (Session 7 — Public Portal)
//       API_KEY_PREFIX = "urm_"      (Session 4 — Administration)
//     Co-locating them keeps the security profile of the whole app
//     auditable in a single read.
// =============================================================================

/**
 * Number of failed authentication attempts (password OR 2FA — they share
 * a single counter) before an account is locked.
 *
 * Why 3: low enough to defeat casual brute-force (3 guesses per 15-min
 * window = ~288 guesses/day, well below the ~10k needed for a 6-char
 * password space), high enough that a typo-prone legitimate user doesn't
 * get locked out on a Monday morning. Industry standard for
 * security-sensitive apps (banking, gov) is 3–5; we land on the strict end
 * because this is a regulatory system.
 */
export const LOCKOUT_THRESHOLD = 3;

/**
 * How long a locked account stays locked before the user can retry.
 *
 * Why 15 minutes: long enough that an attacker can't just wait it out
 * (15-min × 3-attempt cycles = 288 attempts/day — hopeless against any
 * modern password policy), short enough that a legitimate user who got
 * locked out isn't locked out all day. Aligns with OWASP guidance for
 * account lockout duration.
 *
 * At expiry, `failedLoginAttempts` resets to 0 and the user gets a fresh
 * 3-attempt window. See `auth-guard.ts` (Step 5) for the reset logic.
 */
export const LOCKOUT_DURATION_MINS = 15;

/**
 * Preview/test bypass for the lockout policy.
 *
 * When `DISABLE_LOGIN_LOCKOUT=true` is set in the environment, the login
 * and 2FA routes SKIP the lockout check and never set `lockedUntil`. This
 * lets testers iterate freely without being blocked after 3 failed attempts.
 *
 * - Preview / dev / staging: set DISABLE_LOGIN_LOCKOUT=true
 * - Production: leave DISABLE_LOGIN_LOCKOUT unset (or =false)
 *
 * The failed-attempt counter and LoginAttempt audit rows are still recorded
 * either way, so the Security Dashboard continues to show real data.
 */
export const LOCKOUT_DISABLED =
  process.env.DISABLE_LOGIN_LOCKOUT === "true";

// -----------------------------------------------------------------------------
// Reserved for later sessions — declared here so importers can plan ahead,
// but the values are intentionally NOT used yet (Phase A only needs the two
// above). Each is uncommented when its owning session ships.
//
// UPDATE (Session 3): EXPIRING_WINDOW_DAYS was reserved here but has shipped
// in src/lib/compliance/calculator.ts instead — collocated with the pure
// function that consumes it. See calculator.ts for rationale.
// -----------------------------------------------------------------------------

// Session 4 (Administration): API key prefix. Persisted alongside the
// SHA-256 hash so the UI can render "urm_a1b2c3d4..." without leaking the
// full key.
// export const API_KEY_PREFIX = "urm_";

// Session 6 (Productivity): BJS-01 daily sweep runs at this hour (UTC)
// every day. Generated notifications are deduped by a status-inclusive key.
// export const BJS_SWEEP_HOUR_UTC = 1;

// Session 7 (Public Portal): rate limit on /api/public/* endpoints.
// 60 req/min/IP is enough for a human researcher, tight enough to blunt
// a naive scraper.
// export const PUBLIC_RATE_LIMIT_PER_MIN = 60;
