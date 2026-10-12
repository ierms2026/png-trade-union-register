// Reset demo passwords inline — bypasses the seed entirely.
// Run: npx tsx scripts/reset-demo-passwords.ts
// PRODUCTION GATE: refuses to run in production.

import bcrypt from "bcryptjs";
import { db } from "../src/lib/prisma";

if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
  console.error("\nERROR: reset-demo-passwords.ts refuses to run in production.");
  process.exit(1);
}

// OP-01: read from env so no literal credential appears in source.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "";

if (!DEMO_PASSWORD) {
  console.error("\nERROR: DEMO_PASSWORD env var is not set.");
  console.error("Set it before running this script: DEMO_PASSWORD=<value> npx tsx scripts/reset-demo-passwords.ts");
  process.exit(1);
}

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
