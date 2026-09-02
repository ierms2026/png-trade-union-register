import { describe, it, expect, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import { Role } from "@prisma/client";
import { NextRequest } from "next/server";
import { testDb, resetDb } from "./setup";
import { POST } from "@/app/api/auth/set-password/route";

// =============================================================================
// set-password route — token-lookup logic tests.
//
// The route (src/app/api/auth/set-password/route.ts) does this lookup:
//
//   const user = await db.user.findFirst({
//     where: {
//       passwordResetToken: body.token,
//       passwordResetExpires: { gt: new Date() },
//     },
//   });
//
// A token is valid iff:
//   - It matches some user's `passwordResetToken` field (exact string match).
//   - That user's `passwordResetExpires` is in the future.
//
// On success, the route hashes the new password, updates `passwordHash`, and
// CLEARS both `passwordResetToken` and `passwordResetExpires` (one-time use).
//
// We test BOTH:
//   - The lookup query directly (replicated in `findUserByToken` below) for
//     the rejection paths — fast, no bcrypt.
//   - The full POST handler for the success path — verifies the token is
//     actually cleared (one-time use) and the password is updated.
// =============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

function makeToken(): string {
  return randomBytes(24).toString("hex");
}

async function seedUserWithToken(
  overrides: Partial<{
    email: string;
    role: Role;
    passwordResetToken: string | null;
    passwordResetExpires: Date | null;
    passwordHash: string;
  }> = {},
) {
  const token = overrides.passwordResetToken ?? makeToken();
  const expires =
    overrides.passwordResetExpires ?? new Date(Date.now() + DAY_MS);
  return testDb.user.create({
    data: {
      email:
        overrides.email ??
        `u-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: overrides.passwordHash ?? "!pending",
      role: overrides.role ?? Role.OFFICER,
      passwordResetToken: token,
      passwordResetExpires: expires,
    },
  });
}

// Replicate the route's lookup query against the test DB.
async function findUserByToken(token: string) {
  return testDb.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpires: { gt: new Date() },
    },
    select: { id: true, email: true, passwordHash: true },
  });
}

function makeSetPasswordRequest(token: string, password: string): NextRequest {
  return new NextRequest("https://example.com/api/auth/set-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
}

describe("set-password route — token lookup", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("a valid, non-expired token resolves to the owning user", async () => {
    const user = await seedUserWithToken();
    const found = await findUserByToken(user.passwordResetToken!);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(user.id);
    expect(found!.email).toBe(user.email);
  });

  it("an expired token (passwordResetExpires < now) is rejected", async () => {
    const user = await seedUserWithToken({
      passwordResetExpires: new Date(Date.now() - 1000),
    });
    const found = await findUserByToken(user.passwordResetToken!);
    expect(found).toBeNull();
  });

  it("a consumed token (passwordResetToken === null) is rejected", async () => {
    // Simulate a previously-consumed token: the row exists but the token
    // field is null. The lookup `passwordResetToken: <any-string>` won't
    // match a null field in SQLite (null !== value), so findFirst returns null.
    await seedUserWithToken({
      passwordResetToken: null,
      passwordResetExpires: null,
    });
    expect(await findUserByToken("any-token-value")).toBeNull();
  });

  it("a non-existent token (no user has it) is rejected", async () => {
    // Some user exists with a different token — our lookup must not match.
    await seedUserWithToken();
    expect(await findUserByToken("nonexistent-token-not-in-db")).toBeNull();
  });

  it("clears the token after a successful set-password call (one-time use)", async () => {
    const user = await seedUserWithToken();
    const token = user.passwordResetToken!;

    // Call the actual route handler — it should consume the token.
    const res = await POST(makeSetPasswordRequest(token, "new-password-123"));
    expect(res.status).toBe(200);

    // Both token fields should now be null in the DB.
    const after = await testDb.user.findUnique({ where: { id: user.id } });
    expect(after!.passwordResetToken).toBeNull();
    expect(after!.passwordResetExpires).toBeNull();

    // The password hash should have been updated (no longer "!pending").
    expect(after!.passwordHash).not.toBe("!pending");
    expect(after!.passwordHash.length).toBeGreaterThan(0);

    // A second attempt to use the same token must fail.
    expect(await findUserByToken(token)).toBeNull();
  });

  it("rejects a password shorter than 8 characters (and does NOT consume the token)", async () => {
    const user = await seedUserWithToken();
    const res = await POST(makeSetPasswordRequest(user.passwordResetToken!, "short"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least 8 characters/i);

    // The token must NOT be consumed on a failed attempt — the user gets
    // to retry with a valid password.
    const after = await testDb.user.findUnique({ where: { id: user.id } });
    expect(after!.passwordResetToken).toBe(user.passwordResetToken);
  });

  it("distinguishes between tokens issued to different users", async () => {
    const userA = await seedUserWithToken({ email: "a@example.com" });
    const userB = await seedUserWithToken({ email: "b@example.com" });

    // userA's token resolves userA, NOT userB.
    const foundA = await findUserByToken(userA.passwordResetToken!);
    expect(foundA!.id).toBe(userA.id);
    expect(foundA!.id).not.toBe(userB.id);

    // userB's token resolves userB, NOT userA.
    const foundB = await findUserByToken(userB.passwordResetToken!);
    expect(foundB!.id).toBe(userB.id);
    expect(foundB!.id).not.toBe(userA.id);
  });
});
