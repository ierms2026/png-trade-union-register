#!/usr/bin/env tsx
// =============================================================================
// OP-01: Thin wrapper around src/lib/security/demo-password-check.ts.
//
// Reads candidate passwords from the PASSWORD_FILE env var (one per line).
// Exits:
//   0 = no user's hash matches
//   1 = at least one match (prints email, never the password)
//   2 = PASSWORD_FILE unset or file unreadable
//
// USAGE:
//   PASSWORD_FILE=/tmp/passwords.txt npx tsx scripts/check-demo-password.ts
// =============================================================================

import { runPasswordLeakCheck, readCandidatePasswordsFromFile } from "../src/lib/security/demo-password-check";
import { db } from "../src/lib/prisma";

async function main() {
  const candidates = readCandidatePasswordsFromFile();

  if (candidates.length === 0) {
    console.error("ERROR: PASSWORD_FILE env var is unset or file is unreadable.");
    console.error("Set it: PASSWORD_FILE=/path/to/passwords.txt npx tsx scripts/check-demo-password.ts");
    process.exit(2);
  }

  const { code, matches } = await runPasswordLeakCheck(candidates, async () => {
    return db.user.findMany({
      select: { email: true, role: true, passwordHash: true },
    });
  });

  if (code === 1) {
    console.error(`FAIL: ${matches.length} user(s) have a hash that matches a candidate password.`);
    for (const m of matches) {
      console.error(`  - ${m.email} (${m.role})`);
    }
    process.exit(1);
  }

  console.log("PASS: no user's hash matches any candidate password.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
