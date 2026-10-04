import { describe, it, expect } from "vitest";
import { signPayload, verifySignature, generateWebhookSecret } from "../webhooks/dispatcher";

// =============================================================================
// Chunk 9 — webhook dispatcher tests.
//
// Covers the pure helpers (signing + verification + secret generation).
// The delivery/retry logic is integration-tested via the smoke test (curl
// against a real webhook receiver).
// =============================================================================

describe("webhook dispatcher — signing", () => {
  const secret = "test-secret-12345";
  const payload = JSON.stringify({
    id: "evt_abc123",
    type: "COMPLIANCE_STATUS_CHANGE",
    createdAt: "2026-09-28T12:00:00.000Z",
    data: { unionId: "u1", unionName: "Test Union" },
  });
  const timestamp = "2026-09-28T12:00:00.000Z";

  it("signPayload returns a sha256=<hex> string", () => {
    const signature = signPayload(payload, secret, timestamp);
    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it("verifySignature returns true for a valid signature", () => {
    const signature = signPayload(payload, secret, timestamp);
    expect(verifySignature(payload, secret, timestamp, signature)).toBe(true);
  });

  it("verifySignature returns false for a tampered payload", () => {
    const signature = signPayload(payload, secret, timestamp);
    const tamperedPayload = payload.replace("Test Union", "Tampered Union");
    expect(verifySignature(tamperedPayload, secret, timestamp, signature)).toBe(false);
  });

  it("verifySignature returns false for a wrong secret", () => {
    const signature = signPayload(payload, secret, timestamp);
    expect(verifySignature(payload, "wrong-secret", timestamp, signature)).toBe(false);
  });

  it("verifySignature returns false for a wrong timestamp (replay protection)", () => {
    const signature = signPayload(payload, secret, timestamp);
    const wrongTimestamp = "2026-09-28T13:00:00.000Z";
    expect(verifySignature(payload, secret, wrongTimestamp, signature)).toBe(false);
  });

  it("verifySignature returns false for a malformed signature header", () => {
    expect(verifySignature(payload, secret, timestamp, "invalid")).toBe(false);
    expect(verifySignature(payload, secret, timestamp, "")).toBe(false);
    expect(verifySignature(payload, secret, timestamp, "sha256=short")).toBe(false);
  });

  it("signatures are deterministic (same inputs → same signature)", () => {
    const sig1 = signPayload(payload, secret, timestamp);
    const sig2 = signPayload(payload, secret, timestamp);
    expect(sig1).toBe(sig2);
  });

  it("different secrets produce different signatures", () => {
    const sig1 = signPayload(payload, "secret1", timestamp);
    const sig2 = signPayload(payload, "secret2", timestamp);
    expect(sig1).not.toBe(sig2);
  });
});

describe("webhook dispatcher — secret generation", () => {
  it("generateWebhookSecret returns a 64-char hex string", () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
    expect(secret.length).toBe(64);
  });

  it("generateWebhookSecret returns unique secrets", () => {
    const secrets = new Set<string>();
    for (let i = 0; i < 100; i++) {
      secrets.add(generateWebhookSecret());
    }
    expect(secrets.size).toBe(100);
  });
});
