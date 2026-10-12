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

if (!DEMO_PASSWORD) {
  console.error("ERROR: DEMO_PASSWORD env var is not set.");
  console.error("Set it before running: DEMO_PASSWORD=<value> npx tsx scripts/check-demo-password.ts");
  process.exit(2);
}

async function main() {
  console.log("Checking all user passwordHashes against the demo password...");
  console.log(`(comparing against ${DEMO_PASSWORD.length}-character password from env)\n`);

  const users = await db.user.findMany({
    select: { id: true, email: true, passwordHash: true, role: true },
  });

  console.log(`Found ${users.length} user(s) in the database.\n`);

  const matches: Array<{ email: string; role: string }> = [];

  for (const user of users) {
    try {
      const ok = await bcrypt.compare(DEMO_PASSWORD, user.passwordHash);
      if (ok) {
        matches.push({ email: user.email, role: user.role });
        console.log(`  FAIL: ${user.email} (${user.role}) — hash matches the demo password`);
      }
    } catch {
      // passwordHash may be malformed (not a bcrypt hash) — skip
      console.log(`  SKIP: ${user.email} — passwordHash is not a valid bcrypt hash`);
    }
  }

  console.log("");
  if (matches.length > 0) {
    console.error(`FAIL: ${matches.length} user(s) have a hash that matches the demo password.`);
    console.error("These are demo accounts. Remove them before go-live:");
    for (const m of matches) {
      console.error(`  - ${m.email} (${m.role})`);
    }
    process.exit(1);
  } else {
    console.log("PASS: no user's hash matches the demo password.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
