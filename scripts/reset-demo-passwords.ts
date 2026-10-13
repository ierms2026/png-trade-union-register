// Reset demo passwords inline — bypasses the seed entirely.
// Run: npx tsx scripts/reset-demo-passwords.ts
// PRODUCTION GATE: refuses to run in production.

import bcrypt from "bcryptjs";
import { db } from "../src/lib/prisma";

if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
  console.error("\nERROR: reset-demo-passwords.ts refuses to run in production.");
  process.exit(1);
}

// OP-01: shared validation via requireDemoPassword().
import { requireDemoPassword } from "../src/lib/security/require-demo-password";
const DEMO_PASSWORD = requireDemoPassword();

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  console.log("Hashing demo password (bcrypt rounds=12)...");

  const targets = [
    "registrar@example.com",
    "inspector@example.com",
    "officer@example.com",
  ];

  for (const email of targets) {
    const existing = await db.user.findUnique({ where: { email } });
    if (!existing) {
      console.log(`  ✗ ${email} — NOT FOUND in DB (run the seed first)`);
      continue;
    }
    await db.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        disabled: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    console.log(
      `  ✓ ${email} — password reset, disabled=false, failures=0, lockout=cleared`,
    );
  }

  // Sanity-check: verify the hash matches the password.
  const inspector = await db.user.findUnique({
    where: { email: "inspector@example.com" },
  });
  if (inspector) {
    const ok = await bcrypt.compare(DEMO_PASSWORD, inspector.passwordHash);
    console.log(
      `\nVerification: bcrypt.compare(DEMO_PASSWORD, hash) → ${ok ? "PASS" : "FAIL"}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
