import bcrypt from "bcryptjs";

// =============================================================================
// OP-01: Demo password leak checker.
//
// Checks if any user's passwordHash verifies against a candidate password.
// The candidate password is NEVER hardcoded — it must be passed in by the
// caller (the script reads it from an env var or file path env var).
//
// This module does NOT apply the 12-char rule — it just checks. The caller
// is responsible for validation.
// =============================================================================

export interface PasswordLeakMatch {
  email: string;
  role: string;
}

export interface UserWithHash {
  email: string;
  role: string;
  passwordHash: string;
}

/**
 * Check if any user's passwordHash verifies against the given password.
 * Uses bcrypt.compare — never prints the password.
 *
 * @param candidatePassword The password to check.
 * @param userFetcher A function returning all users with their passwordHashes.
 * @returns Array of matching users (email + role only). Empty if no match.
 */
export async function checkDemoPasswordLeak(
  candidatePassword: string,
  userFetcher: () => Promise<UserWithHash[]>,
): Promise<PasswordLeakMatch[]> {
  const users = await userFetcher();
  const matches: PasswordLeakMatch[] = [];

  for (const user of users) {
    try {
      const ok = await bcrypt.compare(candidatePassword, user.passwordHash);
      if (ok) {
        matches.push({ email: user.email, role: user.role });
      }
    } catch {
      // passwordHash may be malformed — skip
    }
  }

  return matches;
}

/**
 * Run the full check + return an exit code.
 *
 * Exit codes:
 *   0 = no match (safe)
 *   1 = at least one match (demo account exists — caller prints emails)
 *   2 = candidate password is unset or empty
 *
 * @param candidatePassword The password to check (from env/file, never literal).
 * @param userFetcher A function returning all users with their passwordHashes.
 * @returns Exit code (0, 1, or 2).
 */
export async function runPasswordLeakCheck(
  candidatePassword: string,
  userFetcher: () => Promise<UserWithHash[]>,
): Promise<{ code: number; matches: PasswordLeakMatch[] }> {
  if (!candidatePassword) {
    return { code: 2, matches: [] };
  }

  const matches = await checkDemoPasswordLeak(candidatePassword, userFetcher);

  if (matches.length > 0) {
    return { code: 1, matches };
  }

  return { code: 0, matches: [] };
}
