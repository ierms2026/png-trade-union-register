// =============================================================================
// Bootstrap script — create the first REGISTRAR user on a fresh deployment.
//
// This script is run ONCE by an IT administrator after deploying the app to
// a new environment. It creates the initial Registrar account with a strong
// password, so the Registrar can log in + create all other users via the UI.
//
// WHY THIS EXISTS:
//   On a fresh deployment, the database has zero users — no one can log in.
//   This script safely creates the first Registrar without:
//     - Hardcoded passwords (the admin enters a strong one interactively)
//     - Shell-history leaks (password is read via hidden input)
//     - Bypassing the password policy (the script validates strength)
//     - Missing audit trail (writes an audit log entry)
//
// SAFETY VALVES:
//   1. Refuses to run if a REGISTRAR already exists (prevents accidental
//      re-runs that would create a second admin)
//   2. Refuses to run if the target email is already in use
//   3. Validates the password against the strong-password policy (12+ chars,
//      uppercase, lowercase, number, special char)
//   4. Asks for confirmation before writing to the DB
//   5. Never prints the password (only the email + user ID)
//
// USAGE:
//   npx tsx scripts/bootstrap-registrar.ts
//
//   # Or with arguments (non-interactive mode, for CI/CD):
//   npx tsx scripts/bootstrap-registrar.ts --email registrar@labour.gov.pg
//
// ENVIRONMENT:
//   Reads DATABASE_URL from .env (same as the app). Run from the project root.
// =============================================================================

import { PrismaClient, Role, Severity } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as readline from "node:readline";

const db = new PrismaClient();

// =============================================================================
// Password policy — stronger than the UI's 8-char minimum.
// Government-grade: 12+ chars, all 4 character classes.
// =============================================================================

const MIN_PASSWORD_LENGTH = 12;

interface PasswordValidation {
  valid: boolean;
  errors: string[];
}

function validatePasswordStrength(password: string): PasswordValidation {
  const errors: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`At least ${MIN_PASSWORD_LENGTH} characters (got ${password.length})`);
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("At least one uppercase letter (A-Z)");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("At least one lowercase letter (a-z)");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("At least one number (0-9)");
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    errors.push("At least one special character (!@#$%^&*...)");
  }

  // Reject common weak passwords even if they pass the rules above
  const common = ["password", "password123", "qwerty123!", "changeme", "letmein"];
  if (common.some((c) => password.toLowerCase().includes(c))) {
    errors.push("Password contains a common weak pattern");
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// Hidden-input password reader (avoids shell history + terminal echo).
// =============================================================================

function readPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Suppress echo by muting stdout writes
    const stdin = process.stdin as unknown as { isTTY?: boolean };
    const wasRaw = stdin.isTTY ? process.stdin.isRaw : false;

    process.stdout.write(prompt);

    let password = "";

    const onData = (char: Buffer) => {
      const c = char.toString();
      switch (c) {
        case "\n":
        case "\r":
        case "\u0004": // Ctrl+D
          process.stdin.removeListener("data", onData);
          process.stdin.setRawMode(wasRaw ?? false);
          rl.close();
          process.stdout.write("\n");
          resolve(password);
          break;
        case "\u0003": // Ctrl+C
          process.stdin.removeListener("data", onData);
          process.stdin.setRawMode(wasRaw ?? false);
          rl.close();
          process.stdout.write("\n");
          process.exit(1);
          break;
        case "\u007f": // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write("\b \b");
          }
          break;
        default:
          password += c;
          process.stdout.write("*");
      }
    };

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

function readLine(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log("=== Bootstrap Registrar ===");
  console.log("Creates the first REGISTRAR user on a fresh deployment.");
  console.log("");

  // --- Safety valve 1: refuse if a Registrar already exists ---------------
  const existingRegistrarCount = await db.user.count({
    where: { role: Role.REGISTRAR },
  });
  if (existingRegistrarCount > 0) {
    console.error("✗ ABORTED: A REGISTRAR user already exists in the database.");
    console.error("  This script is for first-time setup only.");
    console.error("  To create additional Registrars, log in as the existing Registrar");
    console.error("  and use the Users view in the admin UI.");
    process.exit(1);
  }

  // --- Get the email -----------------------------------------------------
  const args = process.argv.slice(2);
  const emailArg = args.find((a) => a.startsWith("--email="))?.split("=")[1];
  const email = (emailArg || await readLine("Registrar email: ")).toLowerCase().trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("✗ ABORTED: Invalid email address.");
    process.exit(1);
  }

  // --- Safety valve 2: refuse if the email is already in use -------------
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    console.error(`✗ ABORTED: A user with email "${email}" already exists.`);
    process.exit(1);
  }

  // --- Get the password (hidden input) -----------------------------------
  console.log("");
  console.log(`Password policy (minimum: ${MIN_PASSWORD_LENGTH} chars, uppercase,`);
  console.log("lowercase, number, special character).");
  console.log("");

  const password = await readPassword("Enter password: ");
  const confirmPassword = await readPassword("Confirm password: ");

  if (password !== confirmPassword) {
    console.error("✗ ABORTED: Passwords do not match.");
    process.exit(1);
  }

  // --- Validate the password strength ------------------------------------
  const validation = validatePasswordStrength(password);
  if (!validation.valid) {
    console.error("✗ ABORTED: Password does not meet the strength requirements:");
    for (const err of validation.errors) {
      console.error(`    • ${err}`);
    }
    process.exit(1);
  }

  console.log("✓ Password meets all strength requirements.");
  console.log("");

  // --- Confirmation ------------------------------------------------------
  console.log("=== Confirmation ===");
  console.log(`  Email: ${email}`);
  console.log(`  Role:  REGISTRAR`);
  console.log(`  Password: ${"*".repeat(password.length)} (${password.length} chars)`);
  console.log("");

  const confirm = await readLine("Create this Registrar? [y/N]: ");
  if (confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
    console.log("Aborted — no changes made.");
    process.exit(0);
  }

  // --- Create the user ---------------------------------------------------
  console.log("");
  console.log("Creating Registrar...");

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      role: Role.REGISTRAR,
    },
    select: { id: true, email: true, role: true },
  });

  // --- Write an audit log entry ------------------------------------------
  // The actor is "System Bootstrap" — there's no user session yet.
  await db.auditLog.create({
    data: {
      actorId: user.id, // the new user is the actor (they "created themselves" via bootstrap)
      actorName: "System Bootstrap",
      action: "user_created_bootstrap",
      entityType: "User",
      entityId: user.id,
      afterJson: JSON.stringify({
        email: user.email,
        role: user.role,
        source: "bootstrap_registrar_script",
      }),
      severity: Severity.CRITICAL, // first-admin creation is always CRITICAL
    },
  });

  console.log("");
  console.log("✓ Registrar created successfully.");
  console.log("");
  console.log("=== Next steps ===");
  console.log(`  1. Share the password with the Registrar OUT-OF-BAND`);
  console.log(`     (in person, sealed envelope — government security protocol).`);
  console.log(`  2. The Registrar logs in at the app URL with:`);
  console.log(`     Email:    ${email}`);
  console.log(`     Password: (the one you just entered)`);
  console.log(`  3. The Registrar should immediately change the password`);
  console.log(`     in Account Security.`);
  console.log(`  4. The Registrar creates all other users via the Users view.`);
  console.log("");
  console.log(`  User ID: ${user.id}`);
  console.log("");

  process.exit(0);
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
