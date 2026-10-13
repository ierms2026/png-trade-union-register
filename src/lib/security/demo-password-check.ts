import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";

// =============================================================================
// OP-01: Demo password leak checker.
//
// Reads candidate passwords from a FILE specified by the PASSWORD_FILE env var
// (one per line). This avoids passing passwords via DEMO_PASSWORD (which could
// leak via process listings). The file is read, each line is checked against
// every user's passwordHash, and matches are reported.
//
// This module does NOT apply the 12-char rule — it just checks.
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
 * Check if any user's passwordHash verifies against any candidate password.
 * Uses bcrypt.compare — never prints the password.
 *
 * @param candidatePasswords Array of passwords to check.
 * @param userFetcher A function returning all users with their passwordHashes.
 * @returns Array of matching users (email + role only). Empty if no match.
 */
export async function checkDemoPasswordLeak(
  candidatePasswords: string[],
  userFetcher: () => Promise<UserWithHash[]>,
): Promise<PasswordLeakMatch[]> {
  const users = await userFetcher();
  const matches: PasswordLeakMatch[] = [];

  for (const user of users) {
    for (const candidate of candidatePasswords) {
      if (!candidate) continue;
      try {
        const ok = await bcrypt.compare(candidate, user.passwordHash);
        if (ok) {
          matches.push({ email: user.email, role: user.role });
          break; // one match per user is enough
        }
      } catch {
        // passwordHash may be malformed — skip
      }
    }
  }

  return matches;
}

/**
 * Run the full check + return an exit code.
 *
 * Exit codes:
 *   0 = no match (safe)
 *   1 = at least one match (demo account exists)
 *   2 = PASSWORD_FILE env var unset or file unreadable
 *
 * @param candidatePasswords Array of passwords to check.
 * @param userFetcher A function returning all users with their passwordHashes.
 */
export async function runPasswordLeakCheck(
  candidatePasswords: string[],
  userFetcher: () => Promise<UserWithHash[]>,
): Promise<{ code: number; matches: PasswordLeakMatch[] }> {
  if (candidatePasswords.length === 0) {
    return { code: 2, matches: [] };
  }

  const matches = await checkDemoPasswordLeak(candidatePasswords, userFetcher);

  if (matches.length > 0) {
    return { code: 1, matches };
  }

  return { code: 0, matches: [] };
}

/**
 * Read candidate passwords from a file (one per line).
 * Returns empty array if the file is unset or unreadable.
 */
export function readCandidatePasswordsFromFile(): string[] {
  const filePath = process.env.PASSWORD_FILE;
  if (!filePath) {
    return [];
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    return content.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  } catch {
    return [];
  }
}
