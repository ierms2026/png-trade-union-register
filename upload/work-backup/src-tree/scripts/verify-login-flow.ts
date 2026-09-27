// End-to-end login simulation — mimics exactly what /api/auth/login does.
// Run: npx tsx scripts/verify-login-flow.ts

import bcrypt from "bcryptjs";
import { db } from "../src/lib/prisma";

const DUMMY_HASH =
  "$2a$12$uQqZyfGZ6o9kl4qYj3vUO.X.NdQ4HKPRtWQ7BD8rJm5p1Nc9oR8K.";

async function simulateLogin(email: string, password: string) {
  console.log(`\n=== Simulating login for ${email} ===`);
  console.log(`Password provided: "${password}" (length=${password.length})`);

  // 1. Lookup
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.log("  ✗ User not found in DB");
    return;
  }
  console.log(`  ✓ User found:`);
  console.log(`      id                  = ${user.id}`);
  console.log(`      email               = ${user.email}`);
  console.log(`      role                = ${user.role}`);
  console.log(`      disabled            = ${user.disabled}`);
  console.log(`      failedLoginAttempts = ${user.failedLoginAttempts}`);
  console.log(`      lockedUntil         = ${user.lockedUntil ?? "(none)"}`);
  console.log(`      twoFactorEnabled    = ${user.twoFactorEnabled}`);
  console.log(`      passwordHash prefix = ${user.passwordHash.slice(0, 25)}...`);
  console.log(`      passwordHash length = ${user.passwordHash.length}`);

  // 2. Disabled?
  if (user.disabled) {
    console.log("  ✗ STOP: account is disabled");
    return;
  }

  // 3. Locked?
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const min = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    console.log(`  ✗ STOP: account locked for ${min} more min`);
    return;
  }
  console.log("  ✓ Not locked");

  // 4. Password verify
  const ok = await bcrypt.compare(password, user.passwordHash);
  console.log(`  bcrypt.compare("${password}", hash) → ${ok ? "PASS" : "FAIL"}`);

  if (!ok) {
    // Compare against dummy to see timing
    const dummyOk = await bcrypt.compare(password, DUMMY_HASH);
    console.log(`  (sanity: bcrypt.compare against DUMMY → ${dummyOk})`);
    console.log("  ✗ STOP: password does not match");
    return;
  }

  console.log("  ✓ PASSWORD CORRECT — login would proceed");
  if (user.twoFactorEnabled) {
    console.log("  → Would return requiresTwoFactor=true");
  } else {
    console.log("  → Would issue session cookie and redirect to /");
  }
}

async function main() {
  const accounts = [
    { email: "registrar@example.com", password: "Test!2345" },
    { email: "inspector@example.com", password: "Test!2345" },
    { email: "officer@example.com", password: "Test!2345" },
  ];
  for (const a of accounts) {
    await simulateLogin(a.email, a.password);
  }

  // Also list ALL users in the DB to confirm there are no surprises.
  console.log("\n\n=== All users in DB ===");
  const all = await db.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      disabled: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      twoFactorEnabled: true,
    },
    orderBy: { email: "asc" },
  });
  for (const u of all) {
    console.log(
      `  ${u.email.padEnd(28)} role=${String(u.role).padEnd(12)} disabled=${u.disabled} fails=${u.failedLoginAttempts} locked=${u.lockedUntil ?? "no"} 2fa=${u.twoFactorEnabled}`,
    );
  }
  console.log(`\nTotal users: ${all.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
