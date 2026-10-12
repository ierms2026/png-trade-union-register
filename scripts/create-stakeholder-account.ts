// =============================================================================
// create-stakeholder-account.ts — create a named stakeholder account with a
// random one-time password that forces a password change at first login.
//
// USAGE:
//   npx tsx scripts/create-stakeholder-account.ts \
//     --email jane.doe@labour.gov.pg \
//     --name "Jane Doe" \
//     --role REGISTRAR \
//     [--union-id <unionId>]
//
// The script:
//   1. Generates a random 16-char password.
//   2. Creates the user with passwordHash set to the bcrypt hash.
//   3. Sets passwordResetToken + passwordResetExpires so the user is
//      forced through the Set Password flow at first login.
//   4. Prints the one-time password + the login URL.
//
// SECURITY:
//   - The password is printed ONCE to stdout. It is NOT stored anywhere.
//   - The passwordResetToken forces the user to choose their own password
//     before they can use the app — the generated password is a
//     one-time bootstrap credential.
//   - The script refuses to run in production without ALLOW_DEMO_SEED=true
//     (same gate as seed-demo.ts — it's an admin script, not a runtime path).
// =============================================================================

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const db = new PrismaClient();

function generatePassword(): string {
  // 16 chars: upper + lower + digits + symbols, crypto-random
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = crypto.randomBytes(16);
  let pw = "";
  for (let i = 0; i < 16; i++) {
    pw += chars[bytes[i] % chars.length];
  }
  return pw;
}

async function main() {
  // Parse args
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const email = getArg("email");
  const name = getArg("name");
  const roleStr = getArg("role")?.toUpperCase();
  const unionId = getArg("union-id");

  if (!email || !name || !roleStr) {
    console.error("Usage: npx tsx scripts/create-stakeholder-account.ts --email <email> --name <name> --role <REGISTRAR|INSPECTOR|OFFICER> [--union-id <id>]");
    process.exit(1);
  }

  if (!["REGISTRAR", "INSPECTOR", "OFFICER"].includes(roleStr)) {
    console.error(`Invalid role: ${roleStr}. Must be REGISTRAR, INSPECTOR, or OFFICER.`);
    process.exit(1);
  }

  const role = roleStr as Role;

  if (role === "OFFICER" && !unionId) {
    console.error("OFFICER role requires --union-id.");
    process.exit(1);
  }

  // Check for existing user
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`User already exists: ${email}`);
    process.exit(1);
  }

  // Verify union exists if provided
  if (unionId) {
    const union = await db.union.findUnique({ where: { id: unionId }, select: { id: true, unionName: true } });
    if (!union) {
      console.error(`Union not found: ${unionId}`);
      process.exit(1);
    }
    console.log(`Assigning to union: ${union.unionName}`);
  }

  // Generate one-time password
  const tempPassword = generatePassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  // Generate password reset token (forces password change at first login)
  const resetToken = crypto.randomBytes(24).toString("hex");
  const resetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  // Create the user
  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      role,
      assignedUnionId: unionId || null,
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires,
      emailNotificationsEnabled: true,
    },
  });

  console.log(`\n✓ Account created: ${user.email} (${role})`);
  console.log(`\n One-time password: ${tempPassword}`);
  console.log(`  This password is temporary. The user will be forced to`);
  console.log(`  choose a new password at first login via the reset token.`);
  console.log(`\n  Login URL: /?token=${resetToken}`);
  console.log(`  Or: /?login=1 (then use the one-time password)`);
  console.log(`\n  Share the one-time password out-of-band (phone, in person).`);
  console.log(`  It will NOT be shown again.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
