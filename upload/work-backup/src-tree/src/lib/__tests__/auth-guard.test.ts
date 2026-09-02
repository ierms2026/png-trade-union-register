import { describe, it, expect, beforeEach } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { Role } from "@prisma/client";
import { testDb, resetDb } from "./setup";
import {
  hasScope,
  getApiKeyUser,
  type AuthUser,
} from "@/lib/auth/auth-guard";

// =============================================================================
// Auth guard tests.
//
// Two test groups:
//   1. hasScope — pure function, no DB. Tests session-cookie bypass, API-key
//      scope matching, empty scopes, and no-partial-matching.
//   2. getApiKeyUser — DB-backed. Seeds a User + ApiKey, then constructs a
//      Request with an Authorization: Bearer header and asserts the return.
//
// The API key format is `urm_<hex>`. Only the SHA-256 hash is persisted; the
// raw key is shown once at creation time. We replicate that flow in the
// `seedApiKey` helper: generate a raw key, hash it, persist the hash, return
// the raw key for use in the Authorization header.
// =============================================================================

async function seedUser(
  overrides: Partial<{
    email: string;
    role: Role;
    assignedUnionId: string | null;
    disabled: boolean;
  }> = {},
) {
  return testDb.user.create({
    data: {
      email:
        overrides.email ??
        `user-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: "!pending",
      role: overrides.role ?? Role.REGISTRAR,
      assignedUnionId: overrides.assignedUnionId ?? null,
      disabled: overrides.disabled ?? false,
    },
  });
}

function makeRawKey(): string {
  // 24 bytes of randomness → 48 hex chars, prefixed with "urm_".
  return `urm_${randomBytes(24).toString("hex")}`;
}

async function seedApiKey(
  userId: string,
  overrides: Partial<{
    scopes: string;
    expiresAt: Date;
    revokedAt: Date | null;
    name: string;
  }> = {},
): Promise<string> {
  const rawKey = makeRawKey();
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  await testDb.apiKey.create({
    data: {
      name: overrides.name ?? "test-key",
      prefix: rawKey.slice(0, 12),
      keyHash,
      scopes: overrides.scopes ?? "unions:read",
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 86_400_000),
      revokedAt: overrides.revokedAt ?? null,
      createdById: userId,
    },
  });
  return rawKey;
}

function makeAuthedRequest(rawKey: string | null): Request {
  const headers = new Headers();
  if (rawKey != null) {
    headers.set(
      "authorization",
      rawKey.startsWith("Bearer ") ? rawKey : `Bearer ${rawKey}`,
    );
  }
  return new Request("https://example.com/api/test", { headers });
}

// -----------------------------------------------------------------------------
// hasScope — pure function tests
// -----------------------------------------------------------------------------

describe("hasScope", () => {
  it("always permits session-cookie users (scopes === null) for any scope", () => {
    const sessionUser: AuthUser = {
      id: "u1",
      name: "n",
      email: "e",
      role: Role.OFFICER,
      assignedUnionId: null,
      scopes: null,
    };
    // Any scope string passes — role-based RBAC is enforced separately.
    expect(hasScope(sessionUser, "unions:read")).toBe(true);
    expect(hasScope(sessionUser, "audit:read")).toBe(true);
    expect(hasScope(sessionUser, "anything:anything")).toBe(true);
  });

  it("permits an API-key user when the scope is in their scopes array", () => {
    const apiKeyUser: AuthUser = {
      id: "u1",
      name: "n",
      email: "e",
      role: Role.OFFICER,
      assignedUnionId: null,
      scopes: ["unions:read", "documents:read"],
    };
    expect(hasScope(apiKeyUser, "unions:read")).toBe(true);
    expect(hasScope(apiKeyUser, "documents:read")).toBe(true);
  });

  it("rejects an API-key user when the scope is NOT in their scopes array", () => {
    const apiKeyUser: AuthUser = {
      id: "u1",
      name: "n",
      email: "e",
      role: Role.OFFICER,
      assignedUnionId: null,
      scopes: ["unions:read"],
    };
    expect(hasScope(apiKeyUser, "audit:read")).toBe(false);
    expect(hasScope(apiKeyUser, "documents:read")).toBe(false);
  });

  it("rejects an API-key user with an empty scopes array", () => {
    const apiKeyUser: AuthUser = {
      id: "u1",
      name: "n",
      email: "e",
      role: Role.OFFICER,
      assignedUnionId: null,
      scopes: [],
    };
    expect(hasScope(apiKeyUser, "unions:read")).toBe(false);
  });

  it("does NOT match partial scope strings (no substring/prefix matching)", () => {
    const apiKeyUser: AuthUser = {
      id: "u1",
      name: "n",
      email: "e",
      role: Role.OFFICER,
      assignedUnionId: null,
      scopes: ["unions:read"],
    };
    // "unions" is a prefix of "unions:read" but not an exact match.
    expect(hasScope(apiKeyUser, "unions")).toBe(false);
    // "unions:readonly" shares a prefix but is not equal.
    expect(hasScope(apiKeyUser, "unions:readonly")).toBe(false);
    // "unions:read:extra" is not equal.
    expect(hasScope(apiKeyUser, "unions:read:extra")).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// getApiKeyUser — DB-backed tests
// -----------------------------------------------------------------------------

describe("getApiKeyUser", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns null when no Authorization header is present", async () => {
    const req = new Request("https://example.com/api/test");
    expect(await getApiKeyUser(req)).toBeNull();
  });

  it("returns null when the Authorization header is not a Bearer token", async () => {
    const req = new Request("https://example.com/api/test", {
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(await getApiKeyUser(req)).toBeNull();
  });

  it("returns null when the bearer token does not start with the 'urm_' prefix", async () => {
    // A plausible-looking but wrongly-prefixed token.
    const req = makeAuthedRequest("abc_somekeynothavingtherightprefix");
    expect(await getApiKeyUser(req)).toBeNull();
  });

  it("returns null when the Authorization header is malformed (empty token after 'Bearer ')", async () => {
    // "Bearer " with no token — passes the startsWith("Bearer ") check but
    // rawKey is "" which doesn't start with "urm_".
    const req = new Request("https://example.com/api/test", {
      headers: { authorization: "Bearer " },
    });
    expect(await getApiKeyUser(req)).toBeNull();
  });

  it("resolves a valid, non-expired, non-revoked key to its owner", async () => {
    const owner = await seedUser({
      role: Role.REGISTRAR,
      email: "owner@example.com",
    });
    const rawKey = await seedApiKey(owner.id);
    const authed = await getApiKeyUser(makeAuthedRequest(rawKey));
    expect(authed).not.toBeNull();
    expect(authed!.id).toBe(owner.id);
    expect(authed!.email).toBe(owner.email);
    // Session-cookie auth sets scopes=null; API-key auth sets scopes=array.
    expect(Array.isArray(authed!.scopes)).toBe(true);
  });

  it("attaches the API key's scopes (parsed from the comma-separated string)", async () => {
    const owner = await seedUser();
    const rawKey = await seedApiKey(owner.id, {
      scopes: "unions:read, documents:read ,audit:read",
    });
    const authed = await getApiKeyUser(makeAuthedRequest(rawKey));
    expect(authed!.scopes).toEqual(["unions:read", "documents:read", "audit:read"]);
  });

  it("rejects a revoked key (revokedAt IS NOT NULL)", async () => {
    const owner = await seedUser();
    const rawKey = await seedApiKey(owner.id, {
      revokedAt: new Date(),
    });
    expect(await getApiKeyUser(makeAuthedRequest(rawKey))).toBeNull();
  });

  it("rejects an expired key (expiresAt <= now)", async () => {
    const owner = await seedUser();
    const rawKey = await seedApiKey(owner.id, {
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await getApiKeyUser(makeAuthedRequest(rawKey))).toBeNull();
  });

  it("rejects a key whose owner has been disabled", async () => {
    const owner = await seedUser({ disabled: true });
    const rawKey = await seedApiKey(owner.id);
    expect(await getApiKeyUser(makeAuthedRequest(rawKey))).toBeNull();
  });

  it("returns null when the key's hash doesn't match any row (non-existent key)", async () => {
    // No ApiKey row exists for this hash. The lookup returns null.
    expect(
      await getApiKeyUser(makeAuthedRequest("urm_nonexistentkeyhashnomatch1234")),
    ).toBeNull();
  });

  it("preserves the owner's role AND assignedUnionId on the returned AuthUser", async () => {
    const union = await testDb.union.create({
      data: { unionName: "Test Union", registrationNo: "REG-001" },
    });
    const owner = await seedUser({
      role: Role.OFFICER,
      assignedUnionId: union.id,
    });
    const rawKey = await seedApiKey(owner.id);
    const authed = await getApiKeyUser(makeAuthedRequest(rawKey));
    expect(authed!.role).toBe(Role.OFFICER);
    expect(authed!.assignedUnionId).toBe(union.id);
  });
});
