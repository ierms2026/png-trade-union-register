#!/usr/bin/env tsx
// =============================================================================
// OP-01: Thin wrapper around src/lib/security/demo-password-check.ts.
//
// Reads the candidate password from the DEMO_PASSWORD env var. Exits:
//   0 = no user's hash matches
//   1 = at least one match (prints email, never the password)
//   2 = DEMO_PASSWORD unset or empty
//
// USAGE:
//   DEMO_PASSWORD=<value> npx tsx scripts/check-demo-password.ts
// =============================================================================

import { runPasswordLeakCheck } from "../src/lib/security/demo-password-check";
import { db } from "../src/lib/prisma";

async function main() {
  const candidatePassword = process.env.DEMO_PASSWORD ?? "";

  const { code, matches } = await runPasswordLeakCheck(candidatePassword, async () => {
    return db.user.findMany({
      select: { email: true, role: true, passwordHash: true },
    });
  });

  if (code === 2) {
    console.error("ERROR: DEMO_PASSWORD env var is unset or empty.");
    process.exit(2);
  }

  if (code === 1) {
    console.error(`FAIL: ${matches.length} user(s) have a hash that matches the candidate password.`);
    for (const m of matches) {
      console.error(`  - ${m.email} (${m.role})`);
    }
    process.exit(1);
  }

  console.log("PASS: no user's hash matches the candidate password.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
