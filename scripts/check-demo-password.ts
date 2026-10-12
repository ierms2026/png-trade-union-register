// =============================================================================
// OP-01.7: Check if any user's passwordHash verifies against the demo password.
//
// This script reads DEMO_PASSWORD from the env var (never a literal), hashes
// it with bcrypt, and compares it against every user's passwordHash in the DB.
// If any match, the script exits with code 1 (fail) — a demo account with the
// known password exists in the DB.
//
// USAGE:
//   DEMO_PASSWORD=<value> npx tsx scripts/check-demo-password.ts
//
// EXIT CODES:
//   0 = no user's hash matches the demo password (safe)
//   1 = at least one user's hash matches (demo account exists — remove it)
//   2 = DEMO_PASSWORD env var not set
//
// The script NEVER prints the password value — only the email of the matching
// user (if any) + a PASS/FAIL summary.
// =============================================================================

import bcrypt from "bcryptjs";
import { db } from "../src/lib/prisma";

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "";

if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 12) {
  console.error("ERROR: DEMO_PASSWORD env var is unset, empty, or under 12 characters.");
  console.error("Set it before running: DEMO_PASSWORD=<value> npx tsx scripts/check-demo-password.ts");
  process.exit(2);
}

/**
 * Check if any user's passwordHash verifies against the given password.
 * Exported for testing — tests pass a test-only password + use the test DB.
 *
 * @param password The password to check (never printed).
 * @param userFetcher A function that returns all users with their passwordHashes.
 * @returns An array of matching users (email + role). Empty if no match.
 */
export async function checkDemoPasswordLeak(
  password: string,
  userFetcher: () => Promise<Array<{ email: string; role: string; passwordHash: string }>>,
): Promise<Array<{ email: string; role: string }>> {
  const users = await userFetcher();
  const matches: Array<{ email: string; role: string }> = [];

  for (const user of users) {
    try {
      const ok = await bcrypt.compare(password, user.passwordHash);
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
 * Exit codes:
 *   0 = no match (safe)
 *   1 = at least one match (demo account exists)
 *   2 = DEMO_PASSWORD unset/empty/too short
 */
export async function runCheck(): Promise<number> {
  if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 12) {
    return 2;
  }

  const matches = await checkDemoPasswordLeak(DEMO_PASSWORD, async () => {
    return db.user.findMany({
      select: { email: true, role: true, passwordHash: true },
    });
  });

  if (matches.length > 0) {
    console.error(`FAIL: ${matches.length} user(s) have a hash that matches the demo password.`);
    for (const m of matches) {
      console.error(`  - ${m.email} (${m.role})`);
    }
    return 1;
  } else {
    console.log("PASS: no user's hash matches the demo password.");
    return 0;
  }
}

async function main() {
  const code = await runCheck();
  process.exit(code);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
