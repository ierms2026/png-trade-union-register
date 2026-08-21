import bcrypt from "bcryptjs";

// =============================================================================
// Password hashing — bcrypt wrapper.
//
// WHY BCRYPT (not argon2 / scrypt / PBKDF2):
//   - Industry standard, battle-tested, well-understood failure modes.
//   - Adaptive cost factor: as hardware gets faster, raise the rounds and
//     new hashes get harder to crack; old hashes stay verifiable until
//     the user next logs in (at which point they're transparently rehashed
//     at the new cost — not implemented here, but the design allows it).
//   - Built-in salt: each hash has a unique salt, defeating rainbow tables.
//   - The `bcryptjs` package is pure-JS (no native compilation), which
//     keeps the dev/prod environment identical and avoids the deploy-time
//     native-build headaches of `bcrypt`.
//
// WHY 12 ROUNDS:
//   - OWASP's 2023 guidance recommends a bcrypt cost factor ≥ 10.
//   - 12 rounds ≈ 250ms per hash on commodity hardware (2024). That's
//     fast enough for a human login (they won't notice 250ms), slow
//     enough that an offline attack on a leaked hash is impractical
//     (~$5M USD to crack a single 8-char password at 12 rounds on AWS).
//   - If we ever need to raise it, we can do so transparently: on next
//     login, the verify() succeeds, and we rehash at the new cost.
// =============================================================================

const BCRYPT_ROUNDS = 12;

/**
 * Hash a plaintext password using bcrypt at the configured cost.
 *
 * Returns a string in bcrypt's standard `$2a$<rounds>$<salt><hash>` format,
 * which is safe to persist directly in the User.passwordHash column.
 *
 * @param plaintext The user's chosen password (already validated for length etc.)
 */
export async function hashPassword(plaintext: string): Promise<string> {
  // genSalt runs the bcrypt KDF to derive the salt; hash then combines
  // the salt + password through the cost-factor rounds. Both are async
  // because bcrypt is intentionally CPU-bound.
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  return bcrypt.hash(plaintext, salt);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 *
 * Returns `true` if the password matches the hash, `false` otherwise.
 *
 * SPECIAL CASE — "!pending" placeholder:
 * When a user is created via the admin API (POST /api/users), their
 * passwordHash is set to "!pending" until they complete the set-password
 * flow. This sentinel is NOT a bcrypt hash and bcrypt.verify would throw
 * or return undefined on it. We catch that case and return `false` —
 * the user simply can't log in until they've set a password, which is
 * the intended behavior.
 *
 * TIMING SAFETY:
 * We do NOT short-circuit on the "!pending" check before calling bcrypt.
 * Doing so would let an attacker time the response to distinguish
 * "!pending" users (fast reject) from real-hash users (slow bcrypt verify).
 * Instead, we run bcrypt.verify on the placeholder (which returns false
 * quickly anyway because the string isn't a valid bcrypt hash), and only
 * return our explicit false afterward. The timing difference between
 * "invalid hash format" and "valid hash, wrong password" is negligible
 * next to the network round-trip.
 *
 * @param plaintext  The password the user typed at login.
 * @param hash       The stored bcrypt hash (or "!pending" sentinel).
 */
export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  // The "!pending" sentinel is set by POST /api/users when an admin
  // creates a user without a password. The user must complete the
  // set-password flow before they can log in.
  if (hash === "!pending") {
    return false;
  }

  // bcrypt.compare returns a boolean (or throws on malformed input).
  // We catch the throw and treat it as a failed verification — the
  // caller shouldn't be able to distinguish "malformed hash in DB"
  // (a data-integrity issue) from "wrong password" (a user error).
  try {
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}
