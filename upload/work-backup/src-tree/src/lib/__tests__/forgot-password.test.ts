import { describe, it, expect, beforeEach } from "vitest";
import { Role, Severity } from "@prisma/client";
import { NextRequest } from "next/server";
import { testDb, resetDb } from "./setup";
import { POST as forgotPasswordPOST } from "@/app/api/auth/forgot-password/route";
import { POST as setPasswordPOST } from "@/app/api/auth/set-password/route";

// =============================================================================
// forgot-password route — security-behavior tests.
//
// We lock in the four spec requirements:
//
//   1. IDENTICAL RESPONSE for known and unknown emails (no enumeration).
//   2. RATE LIMITING — the 4th request within 10 minutes from the same IP
//      gets 429.
//   3. AUDIT LOG — a successful request for a known user creates an entry
//      with action `user_forgot_password` (WARNING severity).
//   4. END-TO-END FLOW — a token issued by /forgot-password can be consumed
//      by /set-password, and the resulting audit entry is labeled
//      `user_reset_password_self` (distinguishing self-service from
//      admin-driven resets).
// =============================================================================

function makeForgotRequest(email: string, ip = "203.0.113.1"): NextRequest {
  return new NextRequest("https://example.com/api/auth/forgot-password", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ email }),
  });
}

async function seedUser(email: string, opts: { disabled?: boolean } = {}) {
  return testDb.user.create({
    data: {
      email,
      passwordHash: "$2a$12$uQqZyfGZ6o9kl4qYj3vUO.X.NdQ4HKPRtWQ7BD8rJm5p1Nc9oR8K.", // a real bcrypt hash of a throwaway
      role: Role.OFFICER,
      disabled: opts.disabled ?? false,
    },
  });
}

describe("forgot-password route", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns the same success payload for a known AND an unknown email", async () => {
    const knownEmail = "officer@example.com";
    const unknownEmail = "stranger@example.com";
    await seedUser(knownEmail);

    const resKnown = await forgotPasswordPOST(makeForgotRequest(knownEmail, "203.0.113.10"));
    const resUnknown = await forgotPasswordPOST(makeForgotRequest(unknownEmail, "203.0.113.11"));

    expect(resKnown.status).toBe(200);
    expect(resUnknown.status).toBe(200);

    const bodyKnown = await resKnown.json();
    const bodyUnknown = await resUnknown.json();

    // The message MUST be identical — this is the spec's "strangers can't
    // use it to discover who has an account" requirement.
    expect(bodyKnown.message).toBe(bodyUnknown.message);
    expect(bodyKnown.success).toBe(true);
    expect(bodyUnknown.success).toBe(true);
  });

  it("issues a token + audit log entry for a known, enabled user", async () => {
    const email = "officer@example.com";
    const user = await seedUser(email);

    const res = await forgotPasswordPOST(makeForgotRequest(email, "203.0.113.20"));
    expect(res.status).toBe(200);

    // The user's passwordResetToken + passwordResetExpires should now be set.
    const after = await testDb.user.findUnique({ where: { id: user.id } });
    expect(after!.passwordResetToken).not.toBeNull();
    expect(after!.passwordResetExpires).not.toBeNull();
    expect(after!.passwordResetExpires!.getTime()).toBeGreaterThan(Date.now());

    // Audit log entry should exist with action `user_forgot_password` + WARNING severity.
    const audit = await testDb.auditLog.findFirst({
      where: { action: "user_forgot_password", entityId: user.id },
    });
    expect(audit).not.toBeNull();
    expect(audit!.severity).toBe(Severity.WARNING);
    expect(audit!.actorName).toBe(email);
  });

  it("does NOT issue a token or audit log entry for an unknown email", async () => {
    const res = await forgotPasswordPOST(makeForgotRequest("nobody@example.com", "203.0.113.30"));
    expect(res.status).toBe(200); // still 200 — same response as for a known email

    // No audit entries should exist at all.
    const auditCount = await testDb.auditLog.count();
    expect(auditCount).toBe(0);
  });

  it("does NOT issue a token for a disabled user (but still returns 200)", async () => {
    const email = "disabled@example.com";
    const user = await seedUser(email, { disabled: true });

    const res = await forgotPasswordPOST(makeForgotRequest(email, "203.0.113.40"));
    expect(res.status).toBe(200);

    // The disabled user's token fields should remain null.
    const after = await testDb.user.findUnique({ where: { id: user.id } });
    expect(after!.passwordResetToken).toBeNull();
    expect(after!.passwordResetExpires).toBeNull();

    // No audit entry should exist for the disabled user.
    const audit = await testDb.auditLog.findFirst({
      where: { entityId: user.id },
    });
    expect(audit).toBeNull();
  });

  it("does NOT invalidate the old password (unlike the admin-reset route)", async () => {
    // This is the key behavioral difference from POST /api/users/[id]/reset-password,
    // which sets passwordHash to "!pending". The self-service flow must NOT
    // lock the user out — they can keep using their existing password until
    // they complete the reset.
    const email = "officer@example.com";
    const user = await seedUser(email);
    const originalHash = user.passwordHash;

    await forgotPasswordPOST(makeForgotRequest(email, "203.0.113.50"));

    const after = await testDb.user.findUnique({ where: { id: user.id } });
    expect(after!.passwordHash).toBe(originalHash); // unchanged
    expect(after!.passwordHash).not.toBe("!pending");
  });

  it("rate-limits the 4th request from the same IP within 10 minutes", async () => {
    const email = "officer@example.com";
    await seedUser(email);

    // First three requests from the same IP — all should succeed (200).
    for (let i = 0; i < 3; i++) {
      const res = await forgotPasswordPOST(makeForgotRequest(`r${i}@example.com`, "203.0.113.99"));
      expect(res.status).toBe(200);
    }

    // Fourth request from the same IP — should be 429.
    const res4 = await forgotPasswordPOST(makeForgotRequest("r3@example.com", "203.0.113.99"));
    expect(res4.status).toBe(429);
    const body = await res4.json();
    expect(body.error).toMatch(/too many requests/i);

    // A request from a DIFFERENT IP should still succeed — the limit is per-IP.
    const resOther = await forgotPasswordPOST(makeForgotRequest("other@example.com", "203.0.113.200"));
    expect(resOther.status).toBe(200);
  });

  it("token issued by forgot-password can be consumed by set-password (end-to-end)", async () => {
    const email = "officer@example.com";
    const user = await seedUser(email);

    // Step 1: request a reset link.
    await forgotPasswordPOST(makeForgotRequest(email, "203.0.113.60"));

    // Grab the issued token from the DB (in production it's emailed, not
    // returned in the response — but for testing we read it from the DB).
    const userWithToken = await testDb.user.findUnique({ where: { id: user.id } });
    expect(userWithToken!.passwordResetToken).not.toBeNull();
    const token = userWithToken!.passwordResetToken!;

    // Step 2: consume the token via set-password.
    const setRes = await setPasswordPOST(
      new NextRequest("https://example.com/api/auth/set-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password: "new-password-123" }),
      }) as unknown as Parameters<typeof setPasswordPOST>[0],
    );
    expect(setRes.status).toBe(200);

    // Step 3: the password hash should be updated (no longer the original).
    const after = await testDb.user.findUnique({ where: { id: user.id } });
    expect(after!.passwordHash).not.toBe(user.passwordHash);
    expect(after!.passwordResetToken).toBeNull(); // one-time use — token cleared

    // Step 4: the audit log should have BOTH entries:
    //   - user_forgot_password (from step 1)
    //   - user_reset_password_self (from step 2 — distinguished from admin resets)
    const forgotAudit = await testDb.auditLog.findFirst({
      where: { action: "user_forgot_password", entityId: user.id },
    });
    expect(forgotAudit).not.toBeNull();

    const resetAudit = await testDb.auditLog.findFirst({
      where: { action: "user_reset_password_self", entityId: user.id },
    });
    expect(resetAudit).not.toBeNull();
    expect(resetAudit!.severity).toBe(Severity.WARNING);

    // The original `user_set_password` action should NOT be present (that's
    // the admin-issued-token label, not the self-service label).
    const adminAudit = await testDb.auditLog.findFirst({
      where: { action: "user_set_password", entityId: user.id },
    });
    expect(adminAudit).toBeNull();
  });

  it("silently no-ops if a token was issued less than 60s ago (anti-spam)", async () => {
    const email = "officer@example.com";
    const user = await seedUser(email);

    // First request — issues a token.
    await forgotPasswordPOST(makeForgotRequest(email, "203.0.113.70"));
    const userAfter1 = await testDb.user.findUnique({ where: { id: user.id } });
    const token1 = userAfter1!.passwordResetToken;

    // Second request immediately after — should NOT issue a new token.
    await forgotPasswordPOST(makeForgotRequest(email, "203.0.113.70"));
    const userAfter2 = await testDb.user.findUnique({ where: { id: user.id } });
    expect(userAfter2!.passwordResetToken).toBe(token1); // unchanged

    // Only ONE audit entry should exist (from the first request).
    const auditCount = await testDb.auditLog.count({
      where: { action: "user_forgot_password", entityId: user.id },
    });
    expect(auditCount).toBe(1);
  });
});
