import { describe, it, expect, beforeEach } from "vitest";
import { Role } from "@prisma/client";
import { testDb, resetDb } from "./setup";
import { checkLastRegistrar } from "@/lib/last-registrar";

// =============================================================================
// Last-registrar guard tests.
//
// checkLastRegistrar(targetUserId) prevents an admin from disabling the
// system's only active Registrar (which would lock everyone out of
// registrar-gated operations).
//
// Logic:
//   - If the target doesn't exist, isn't a Registrar, or is already
//     disabled → safe (no-op).
//   - Otherwise, count OTHER active Registrars (role=REGISTRAR,
//     disabled=false, id != target).
//   - If that count is 0 → NOT safe (block the action).
//   - If >= 1 → safe.
// =============================================================================

async function seedUser(role: Role, disabled = false, email?: string) {
  return testDb.user.create({
    data: {
      email:
        email ?? `u-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: "!pending",
      role,
      disabled,
    },
  });
}

describe("checkLastRegistrar", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("blocks disabling the last active Registrar (0 others)", async () => {
    const sole = await seedUser(Role.REGISTRAR);
    const result = await checkLastRegistrar(sole.id);
    expect(result.safe).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("allows disabling when other active Registrars exist (>=1 others)", async () => {
    const target = await seedUser(Role.REGISTRAR);
    await seedUser(Role.REGISTRAR, false, "other@example.com");
    const result = await checkLastRegistrar(target.id);
    expect(result.safe).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("boundary: 1 total active Registrar (0 others) → blocked; 2 total (1 other) → allowed", async () => {
    const sole = await seedUser(Role.REGISTRAR);
    // 1 total → 0 others → blocked.
    expect((await checkLastRegistrar(sole.id)).safe).toBe(false);
    // Add a second active Registrar → 1 other → allowed.
    await seedUser(Role.REGISTRAR, false, "second@example.com");
    expect((await checkLastRegistrar(sole.id)).safe).toBe(true);
  });

  it("allows disabling an Officer (non-Registrar role)", async () => {
    const officer = await seedUser(Role.OFFICER);
    const result = await checkLastRegistrar(officer.id);
    expect(result.safe).toBe(true);
  });

  it("allows disabling an Inspector (non-Registrar role)", async () => {
    const inspector = await seedUser(Role.INSPECTOR);
    const result = await checkLastRegistrar(inspector.id);
    expect(result.safe).toBe(true);
  });

  it("allows for a Registrar who is already disabled (no-op)", async () => {
    const alreadyDisabled = await seedUser(Role.REGISTRAR, true);
    const result = await checkLastRegistrar(alreadyDisabled.id);
    expect(result.safe).toBe(true);
  });

  it("allows for a non-existent user id (treats as no-op)", async () => {
    const result = await checkLastRegistrar("nonexistent-user-id");
    expect(result.safe).toBe(true);
  });

  it("counts Registrars system-wide (not scoped to any union or tenant)", async () => {
    // Two Registrars exist — the check is global, so disabling one is safe.
    const target = await seedUser(Role.REGISTRAR);
    await seedUser(Role.REGISTRAR, false, "global-other@example.com");
    // An Officer also exists — doesn't affect the Registrar count.
    await seedUser(Role.OFFICER, false, "officer@example.com");
    const result = await checkLastRegistrar(target.id);
    expect(result.safe).toBe(true);
  });

  it("counts only ACTIVE Registrars — disabled Registrars don't count toward the safety total", async () => {
    // Target is the only ACTIVE Registrar; the other Registrar is disabled.
    // The disabled one doesn't count, so disabling the target is blocked.
    const target = await seedUser(Role.REGISTRAR, false);
    await seedUser(Role.REGISTRAR, true, "disabled-registrar@example.com");
    const result = await checkLastRegistrar(target.id);
    expect(result.safe).toBe(false);
  });
});
