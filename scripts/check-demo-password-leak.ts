import { db } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// =============================================================================
// OP-01: Demo password leak checker.
//
// Run this script to check if any user in the DB has a passwordHash that
// verifies against the known demo password. The demo password is read from
// prisma/seed-demo.ts (DEMO_PASSWORD constant) at runtime — it is NEVER
// printed or logged. Only the count of matching users is reported.
//
// Usage: npx tsx scripts/check-demo-password-leak.ts
//
// Exit codes:
//   0 — no users match the demo password
//   1 — one or more users match the demo password (security risk)
//   2 — script error (e.g. DB unavailable)
// =============================================================================

async function main() {
  // Read the demo password from the seed file's constant. We don't import
  // it directly (the seed file has side effects) — instead we read it via
  // a regex match on the source. The value is NEVER printed.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const seedPath = path.join(process.cwd(), "prisma", "seed-demo.ts");
  const seedSrc = fs.readFileSync(seedPath, "utf-8");

  // Extract the demo password from the DEMO_PASSWORD constant.
  // Pattern: const DEMO_PASSWORD = "...";
  const match = seedSrc.match(/const\s+DEMO_PASSWORD\s*=\s*"([^"]+)"/);
  if (!match) {
    console.error("[check-demo-password-leak] Could not find DEMO_PASSWORD in prisma/seed-demo.ts");
    process.exit(2);
  }
  const demoPassword = match[1];

  // Fetch all users' password hashes
  const users = await db.user.findMany({
    select: { id: true, email: true, passwordHash: true, role: true },
  });

  console.log(`[check-demo-password-leak] Checking ${users.length} user(s)...`);

  let matchCount = 0;
  for (const user of users) {
    try {
      const isMatch = await bcrypt.compare(demoPassword, user.passwordHash);
      if (isMatch) {
        matchCount++;
        console.error(
          `[check-demo-password-leak] MATCH: user ${user.email} (${user.role}) has a password that verifies against the known demo password. ` +
            `This account is vulnerable — reset the password immediately.`,
        );
      }
    } catch {
      // Hash is malformed or not bcrypt — skip (not a demo password match)
    }
  }

  if (matchCount > 0) {
    console.error(
      `\n[check-demo-password-leak] FAIL: ${matchCount} user(s) have the demo password. Reset all passwords before deploying to production.`,
    );
    process.exit(1);
  }

  console.log("[check-demo-password-leak] PASS: no users have the demo password.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[check-demo-password-leak] Script error:", err);
  process.exit(2);
});
