import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  createSessionCookieValue,
  verifySessionCookieValue,
  signChallengeToken,
  parseChallengeToken,
  generateJTI,
} from "@/lib/auth/session";

// =============================================================================
// Session cookie + challenge token tests.
//
// Both use the same HMAC-SHA256 signing primitive:
//   cookie/token = base64url(JSON.stringify(payload)) + "." + base64url(signature)
//
// The session cookie carries { jti, exp } and is verified by
// verifySessionCookieValue. The challenge token carries { userId, iat } and
// is verified by parseChallengeToken with a 30s TTL.
//
// Fake timers are used throughout so expiry boundaries are deterministic.
// =============================================================================

// -----------------------------------------------------------------------------
// Helpers — replicate the module's internal encoding so we can construct
// tampered/malformed cookies for the negative-path tests.
// -----------------------------------------------------------------------------

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function signWithSecret(payloadJson: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadJson).digest("base64url");
}

const SECRET = process.env.SESSION_SECRET!;
const BASE_TIME = new Date("2024-06-01T12:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// Session cookie tests (createSessionCookieValue + verifySessionCookieValue)
// =============================================================================

describe("createSessionCookieValue + verifySessionCookieValue", () => {
  describe("round-trip", () => {
    it("round-trips a freshly created cookie through verify", () => {
      const jti = generateJTI();
      const expiresAt = new Date(BASE_TIME + 60_000);
      const cookie = createSessionCookieValue(jti, expiresAt);
      const verified = verifySessionCookieValue(cookie);
      expect(verified).not.toBeNull();
      expect(verified!.jti).toBe(jti);
      expect(verified!.expiresAt.getTime()).toBe(expiresAt.getTime());
    });

    it("preserves the JTI exactly across round-trip", () => {
      // JTIs are UUIDs, but the format should preserve any string identically.
      const jti = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
      const cookie = createSessionCookieValue(jti, new Date(BASE_TIME + 60_000));
      expect(verifySessionCookieValue(cookie)?.jti).toBe(jti);
    });
  });

  describe("expiry", () => {
    it("rejects an expired cookie (exp < now)", () => {
      const cookie = createSessionCookieValue("jti", new Date(BASE_TIME - 1000));
      expect(verifySessionCookieValue(cookie)).toBeNull();
    });

    it("accepts a cookie with a future expiry (exp > now)", () => {
      const cookie = createSessionCookieValue("jti", new Date(BASE_TIME + 60_000));
      expect(verifySessionCookieValue(cookie)).not.toBeNull();
    });

    it("at the exact boundary (exp === now), rejects the cookie", () => {
      // The check is `Date.now() >= payload.exp` — at equality, rejected.
      const cookie = createSessionCookieValue("jti", new Date(BASE_TIME));
      expect(verifySessionCookieValue(cookie)).toBeNull();
    });
  });

  describe("tampering", () => {
    it("rejects a cookie whose payload has been modified (signature no longer matches)", () => {
      const cookie = createSessionCookieValue("jti-1", new Date(BASE_TIME + 60_000));
      const [payloadB64, signature] = cookie.split(".");
      const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
      const modified = JSON.parse(payloadJson);
      modified.jti = "tampered-jti";
      const tampered = `${b64url(JSON.stringify(modified))}.${signature}`;
      expect(verifySessionCookieValue(tampered)).toBeNull();
    });

    it("rejects a cookie whose signature has been modified", () => {
      const cookie = createSessionCookieValue("jti-1", new Date(BASE_TIME + 60_000));
      const [payloadB64, signature] = cookie.split(".");
      // Flip the last character to a different valid base64url char so the
      // decoded length matches but the bytes differ (exercises the
      // constant-time comparison, not just the length check).
      const last = signature.slice(-1);
      const flip = last === "A" ? "B" : "A";
      const tampered = `${payloadB64}.${signature.slice(0, -1) + flip}`;
      expect(verifySessionCookieValue(tampered)).toBeNull();
    });

    it("rejects a cookie signed with a different secret", () => {
      const payloadJson = JSON.stringify({
        jti: "jti-1",
        exp: BASE_TIME + 60_000,
      });
      const cookie = `${b64url(payloadJson)}.${signWithSecret(payloadJson, "wrong-secret")}`;
      expect(verifySessionCookieValue(cookie)).toBeNull();
    });
  });

  describe("malformed input", () => {
    it("rejects an empty string", () => {
      expect(verifySessionCookieValue("")).toBeNull();
    });

    it("rejects a string with no dot separator", () => {
      expect(verifySessionCookieValue("payloadWithNoDot")).toBeNull();
    });

    it("rejects a string with more than one dot", () => {
      expect(verifySessionCookieValue("a.b.c")).toBeNull();
    });

    it("rejects an empty payload (string starts with a dot)", () => {
      // dotIndex === 0 → caught by the `dotIndex <= 0` guard.
      expect(verifySessionCookieValue(".signature")).toBeNull();
    });

    it("rejects an empty signature (string ends with a dot)", () => {
      // dotIndex === length - 1 → caught by the `dotIndex === length - 1` guard.
      expect(verifySessionCookieValue("payload.")).toBeNull();
    });

    it("rejects a payload that contains non-base64url characters", () => {
      // "!" is not in the base64url alphabet. Node's Buffer.from(..., "base64url")
      // silently ignores invalid chars, producing an empty/garbage buffer that
      // fails JSON.parse downstream.
      expect(verifySessionCookieValue("!!!.signature")).toBeNull();
    });

    it("rejects a payload that is valid base64url but not valid JSON", () => {
      const notJson = b64url("this is not json");
      expect(verifySessionCookieValue(`${notJson}.signature`)).toBeNull();
    });

    it("rejects a payload missing the jti field", () => {
      const payload = JSON.stringify({ exp: BASE_TIME + 60_000 });
      const cookie = `${b64url(payload)}.${signWithSecret(payload, SECRET)}`;
      expect(verifySessionCookieValue(cookie)).toBeNull();
    });

    it("rejects a payload missing the exp field", () => {
      const payload = JSON.stringify({ jti: "jti-1" });
      const cookie = `${b64url(payload)}.${signWithSecret(payload, SECRET)}`;
      expect(verifySessionCookieValue(cookie)).toBeNull();
    });

    it("rejects a payload where jti is not a string", () => {
      const payload = JSON.stringify({ jti: 123, exp: BASE_TIME + 60_000 });
      const cookie = `${b64url(payload)}.${signWithSecret(payload, SECRET)}`;
      expect(verifySessionCookieValue(cookie)).toBeNull();
    });

    it("rejects a payload where exp is not a number", () => {
      const payload = JSON.stringify({ jti: "jti-1", exp: "not-a-number" });
      const cookie = `${b64url(payload)}.${signWithSecret(payload, SECRET)}`;
      expect(verifySessionCookieValue(cookie)).toBeNull();
    });

    it("rejects a payload where jti is an empty string", () => {
      const payload = JSON.stringify({ jti: "", exp: BASE_TIME + 60_000 });
      const cookie = `${b64url(payload)}.${signWithSecret(payload, SECRET)}`;
      expect(verifySessionCookieValue(cookie)).toBeNull();
    });

    it("rejects a payload where exp is non-finite (NaN)", () => {
      const payload = JSON.stringify({ jti: "jti-1", exp: NaN });
      const cookie = `${b64url(payload)}.${signWithSecret(payload, SECRET)}`;
      expect(verifySessionCookieValue(cookie)).toBeNull();
    });

    it("rejects a payload where exp is non-finite (Infinity serializes to null)", () => {
      // JSON.stringify(Infinity) === "null" → typeof null !== "number" → rejected.
      const payload = JSON.stringify({ jti: "jti-1", exp: Infinity });
      const cookie = `${b64url(payload)}.${signWithSecret(payload, SECRET)}`;
      expect(verifySessionCookieValue(cookie)).toBeNull();
    });
  });
});

// =============================================================================
// Challenge token tests (signChallengeToken + parseChallengeToken)
// TTL = 30 seconds (CHALLENGE_TOKEN_TTL_MS)
// =============================================================================

describe("signChallengeToken + parseChallengeToken", () => {
  describe("round-trip", () => {
    it("round-trips a freshly signed challenge token", () => {
      const token = signChallengeToken("user-123");
      expect(parseChallengeToken(token)).toBe("user-123");
    });

    it("preserves the userId exactly across round-trip", () => {
      const userId = "clxyz123abc_user-id-with-dashes";
      const token = signChallengeToken(userId);
      expect(parseChallengeToken(token)).toBe(userId);
    });
  });

  describe("expiry (TTL = 30s)", () => {
    it("accepts a token at 10s elapsed (well within TTL)", () => {
      const token = signChallengeToken("user-1");
      vi.setSystemTime(BASE_TIME + 10_000);
      expect(parseChallengeToken(token)).toBe("user-1");
    });

    it("rejects a token at 31s elapsed (past TTL)", () => {
      const token = signChallengeToken("user-1");
      vi.setSystemTime(BASE_TIME + 31_000);
      expect(parseChallengeToken(token)).toBeNull();
    });

    it("accepts a token at exactly 30s (boundary: now - iat === TTL is NOT > TTL)", () => {
      const token = signChallengeToken("user-1");
      vi.setSystemTime(BASE_TIME + 30_000);
      expect(parseChallengeToken(token)).toBe("user-1");
    });

    it("rejects a token at 30s + 1ms (just past TTL)", () => {
      const token = signChallengeToken("user-1");
      vi.setSystemTime(BASE_TIME + 30_001);
      expect(parseChallengeToken(token)).toBeNull();
    });
  });

  describe("tampering", () => {
    it("rejects a token whose payload has been modified", () => {
      const token = signChallengeToken("user-1");
      const [payloadB64, signature] = token.split(".");
      const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
      const modified = JSON.parse(payloadJson);
      modified.userId = "tampered-user";
      const tampered = `${b64url(JSON.stringify(modified))}.${signature}`;
      expect(parseChallengeToken(tampered)).toBeNull();
    });

    it("rejects a token whose signature has been modified", () => {
      const token = signChallengeToken("user-1");
      const [payloadB64, signature] = token.split(".");
      // Replace the entire signature with a different valid-base64url string.
      // This guarantees the signature won't match.
      const fakeSig = b64url("completely-different-signature");
      const tampered = `${payloadB64}.${fakeSig}`;
      expect(parseChallengeToken(tampered)).toBeNull();
    });

    it("rejects a token where the userId has been substituted (signature breaks)", () => {
      // Sign for user-A, then swap userId to user-B without re-signing.
      const token = signChallengeToken("user-A");
      const [payloadB64, signature] = token.split(".");
      const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
      const modified = JSON.parse(payloadJson);
      modified.userId = "user-B";
      const tampered = `${b64url(JSON.stringify(modified))}.${signature}`;
      expect(parseChallengeToken(tampered)).toBeNull();
    });
  });

  describe("malformed input", () => {
    it("rejects an empty string", () => {
      expect(parseChallengeToken("")).toBeNull();
    });

    it("rejects a string with no dot separator", () => {
      expect(parseChallengeToken("tokenWithNoDot")).toBeNull();
    });

    it("rejects a string with more than one dot", () => {
      expect(parseChallengeToken("a.b.c")).toBeNull();
    });

    it("rejects a payload missing the userId field", () => {
      const payload = JSON.stringify({ iat: BASE_TIME });
      const token = `${b64url(payload)}.${signWithSecret(payload, SECRET)}`;
      expect(parseChallengeToken(token)).toBeNull();
    });
  });
});

// =============================================================================
// generateJTI
// =============================================================================

describe("generateJTI", () => {
  it("returns a UUID v4-formatted string (8-4-4-4-12 hex with version + variant bits)", () => {
    const jti = generateJTI();
    // RFC 4122 v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx where y ∈ {8,9,a,b}
    expect(jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("produces 100 unique values in a row (no collisions at this scale)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(generateJTI());
    }
    expect(seen.size).toBe(100);
  });
});
