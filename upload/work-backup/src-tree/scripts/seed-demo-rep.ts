// Seed a demo REPRESENTATIVE user for testing the union self-service portal.
//
// Creates (or resets) rep@example.com with password Test!2345, assigned to
// the first union in the DB. Idempotent — safe to re-run.
//
// Run: npx tsx /home/z/my-project/scripts/seed-demo-rep.ts

import { db } from "../src/lib/prisma";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

async function main() {
  const email = "rep@example.com";
  const password = "Test!2345";

  // Pick the first union
  const union = await db.union.findFirst({ orderBy: { unionName: "asc" } });
  if (!union) {
    console.error("No unions found in DB. Run prisma/seed-demo.ts first.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await db.user.update({
      where: { email },
      data: {
        passwordHash,
        role: Role.REPRESENTATIVE,
        assignedUnionId: union.id,
        disabled: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        // Clear any pending password reset
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });
    console.log(`✓ Updated ${email} → REPRESENTATIVE, assigned to ${union.unionName}`);
  } else {
    await db.user.create({
      data: {
        email,
        passwordHash,
        role: Role.REPRESENTATIVE,
        assignedUnionId: union.id,
      },
    });
    console.log(`✓ Created ${email} → REPRESENTATIVE, assigned to ${union.unionName}`);
  }
  console.log(`\nLogin: ${email} / ${password}`);
  console.log(`Portal URL: http://localhost:3000/portal`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
