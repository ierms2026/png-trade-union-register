// =============================================================================
// OP-01: Shared DEMO_PASSWORD validation.
//
// One function used by the seed script and every script that needs the demo
// password. Exits non-zero if DEMO_PASSWORD is:
//   - unset
//   - empty
//   - under 12 characters
// Also exits non-zero if NODE_ENV=production (unless ALLOW_DEMO_SEED=true).
//
// The password is NEVER printed — only the validation error message.
// =============================================================================

/**
 * Read + validate DEMO_PASSWORD from the environment.
 * Exits the process with code 1 if the password is invalid.
 *
 * @returns The validated DEMO_PASSWORD string.
 */
export function requireDemoPassword(): string {
  const password = process.env.DEMO_PASSWORD ?? "";

  // Production gate: refuse to use demo password in production.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    console.error("\nERROR: Demo operations refuse to run in production.");
    console.error("Set ALLOW_DEMO_SEED=true to override (NOT recommended).");
    process.exit(1);
  }

  // Validation: must be set, non-empty, and at least 12 characters.
  if (!password) {
    console.error("\nERROR: DEMO_PASSWORD env var is unset.");
    console.error("Set it before running: DEMO_PASSWORD=<value> npx tsx <script>");
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("\nERROR: DEMO_PASSWORD is under 12 characters.");
    console.error("Use a stronger password: DEMO_PASSWORD=<value> npx tsx <script>");
    process.exit(1);
  }

  return password;
}
