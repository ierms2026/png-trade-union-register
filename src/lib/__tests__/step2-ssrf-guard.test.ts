import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  assertPublicDestination,
  isBlockedIp,
  type DnsResolver,
} from "@/lib/webhooks/destination-guard";
import { testDb, resetDb } from "./setup";
import { attemptDelivery } from "@/lib/webhooks/dispatcher";

function mockResolver(...addresses: string[]): DnsResolver {
  return async () => addresses;
}
function failingResolver(): DnsResolver {
  return async () => { throw new Error("DNS failed"); };
}

const originalEnv = process.env.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS;
beforeEach(() => { delete process.env.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS; });
afterEach(() => {
  if (originalEnv !== undefined) process.env.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS = originalEnv;
  else delete process.env.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS;
});

describe("isBlockedIp", () => {
  it("blocks 0.0.0.0", () => { expect(isBlockedIp("0.0.0.0")).toBe(true); });
  it("blocks 10.0.0.1 (private A)", () => { expect(isBlockedIp("10.0.0.1")).toBe(true); });
  it("blocks 100.64.0.1 (CGN)", () => { expect(isBlockedIp("100.64.0.1")).toBe(true); });
  it("blocks 100.127.255.255 (CGN upper)", () => { expect(isBlockedIp("100.127.255.255")).toBe(true); });
  it("does NOT block 100.63.255.255 (below CGN)", () => { expect(isBlockedIp("100.63.255.255")).toBe(false); });
  it("does NOT block 100.128.0.0 (above CGN)", () => { expect(isBlockedIp("100.128.0.0")).toBe(false); });
  it("blocks 127.0.0.1 (loopback)", () => { expect(isBlockedIp("127.0.0.1")).toBe(true); });
  it("blocks 169.254.169.254 (cloud metadata)", () => { expect(isBlockedIp("169.254.169.254")).toBe(true); });
  it("blocks 172.16.0.1 (private B lower)", () => { expect(isBlockedIp("172.16.0.1")).toBe(true); });
  it("blocks 172.31.255.255 (private B upper)", () => { expect(isBlockedIp("172.31.255.255")).toBe(true); });
  it("does NOT block 172.32.0.0 (above private B)", () => { expect(isBlockedIp("172.32.0.0")).toBe(false); });
  it("blocks 192.168.1.1 (private C)", () => { expect(isBlockedIp("192.168.1.1")).toBe(true); });
  it("blocks ::1 (IPv6 loopback)", () => { expect(isBlockedIp("::1")).toBe(true); });
  it("blocks :: (IPv6 unspecified)", () => { expect(isBlockedIp("::")).toBe(true); });
  it("blocks fc00::1 (IPv6 ULA)", () => { expect(isBlockedIp("fc00::1")).toBe(true); });
  it("blocks fd12::1 (IPv6 ULA)", () => { expect(isBlockedIp("fd12::1")).toBe(true); });
  it("blocks fe80::1 (IPv6 link-local)", () => { expect(isBlockedIp("fe80::1")).toBe(true); });
  it("blocks ::ffff:127.0.0.1 (IPv4-mapped dotted)", () => { expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true); });
  it("does NOT block 203.0.113.1 (public)", () => { expect(isBlockedIp("203.0.113.1")).toBe(false); });
  it("does NOT block 2606:4700::1 (public IPv6)", () => { expect(isBlockedIp("2606:4700::1")).toBe(false); });
});

describe("assertPublicDestination — protocol + URL", () => {
  it("rejects ftp://", async () => { expect((await assertPublicDestination("ftp://example.com/x")).ok).toBe(false); });
  it("rejects file://", async () => { expect((await assertPublicDestination("file:///etc/passwd")).ok).toBe(false); });
  it("rejects invalid URL", async () => { expect((await assertPublicDestination("not-a-url")).ok).toBe(false); });
  it("rejects localhost", async () => { expect((await assertPublicDestination("https://localhost/x")).ok).toBe(false); });
  it("rejects localhost. (trailing dot)", async () => { expect((await assertPublicDestination("https://localhost./x")).ok).toBe(false); });
  it("rejects userinfo URL", async () => { expect((await assertPublicDestination("http://user:pass@203.0.113.1/x")).ok).toBe(false); });
  it("accepts http:// public IP", async () => { expect((await assertPublicDestination("http://203.0.113.1/x")).ok).toBe(true); });
  it("accepts https:// public IP", async () => { expect((await assertPublicDestination("https://203.0.113.1/x")).ok).toBe(true); });
});

describe("assertPublicDestination — literal IP blocking", () => {
  it("rejects 0.0.0.0", async () => { expect((await assertPublicDestination("https://0.0.0.0/x")).ok).toBe(false); });
  it("rejects 127.0.0.1", async () => { expect((await assertPublicDestination("https://127.0.0.1/x")).ok).toBe(false); });
  it("rejects 10.0.0.1", async () => { expect((await assertPublicDestination("https://10.0.0.1/x")).ok).toBe(false); });
  it("rejects 100.64.0.1 (CGN)", async () => { expect((await assertPublicDestination("https://100.64.0.1/x")).ok).toBe(false); });
  it("rejects 169.254.169.254 (metadata)", async () => { expect((await assertPublicDestination("https://169.254.169.254/x")).ok).toBe(false); });
  it("rejects 172.16.0.1", async () => { expect((await assertPublicDestination("https://172.16.0.1/x")).ok).toBe(false); });
  it("rejects 192.168.1.1", async () => { expect((await assertPublicDestination("https://192.168.1.1/x")).ok).toBe(false); });
  it("rejects [::1] (IPv6 loopback)", async () => { expect((await assertPublicDestination("https://[::1]/x")).ok).toBe(false); });
  it("rejects [::ffff:127.0.0.1] (mapped)", async () => { expect((await assertPublicDestination("https://[::ffff:127.0.0.1]/x")).ok).toBe(false); });
});

describe("assertPublicDestination — hostname resolution", () => {
  it("rejects hostname resolving to private IP", async () => {
    expect((await assertPublicDestination("https://internal.example.com/x", mockResolver("10.0.0.5"))).ok).toBe(false);
  });
  it("rejects hostname with one public + one private IP", async () => {
    expect((await assertPublicDestination("https://mixed.example.com/x", mockResolver("203.0.113.1", "192.168.1.1"))).ok).toBe(false);
  });
  it("accepts hostname resolving to only public IPs", async () => {
    expect((await assertPublicDestination("https://public.example.com/x", mockResolver("203.0.113.1", "198.51.100.2"))).ok).toBe(true);
  });
  it("rejects hostname with no DNS records", async () => {
    expect((await assertPublicDestination("https://norecord.example.com/x", mockResolver())).ok).toBe(false);
  });
  it("rejects hostname when DNS throws", async () => {
    expect((await assertPublicDestination("https://fail.example.com/x", failingResolver())).ok).toBe(false);
  });
});

describe("assertPublicDestination — escape hatch", () => {
  it("allows private when WEBHOOK_ALLOW_PRIVATE_DESTINATIONS=true", async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS = "true";
    expect((await assertPublicDestination("https://192.168.1.1/x")).ok).toBe(true);
    expect((await assertPublicDestination("https://localhost/x")).ok).toBe(true);
  });
  it("still rejects non-http(s) even with escape hatch", async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS = "true";
    expect((await assertPublicDestination("ftp://example.com/x")).ok).toBe(false);
  });
});

// Send-time guard + redirect tests
const originalFetch = global.fetch;
beforeEach(() => { global.fetch = vi.fn(); });
afterEach(() => { global.fetch = originalFetch; });
const mockedFetch = () => global.fetch as unknown as ReturnType<typeof vi.fn>;

describe("send-time guard + redirect:manual", () => {
  beforeEach(async () => { await resetDb(); mockedFetch().mockReset(); });

  async function createDelivery(url: string) {
    const ep = await testDb.webhookEndpoint.create({ data: { url, name: "T", secret: "s", events: "", active: true, createdById: null } });
    const d = await testDb.webhookDelivery.create({ data: { endpointId: ep.id, eventId: "e1", eventType: "COMPLIANCE_STATUS_CHANGE", payload: "{}", status: "PENDING", attempts: 0, maxAttempts: 5 } });
    return { ep, d };
  }

  it("rejects loopback before fetch (no HTTP call)", async () => {
    const { ep, d } = await createDelivery("http://127.0.0.1/x");
    const r = await attemptDelivery(d.id, ep, "{}");
    expect(r.delivered).toBe(false);
    expect(r.error).toMatch(/Destination blocked/i);
    expect(mockedFetch()).not.toHaveBeenCalled();
  });

  it("rejects cloud metadata before fetch", async () => {
    const { ep, d } = await createDelivery("http://169.254.169.254/x");
    const r = await attemptDelivery(d.id, ep, "{}");
    expect(r.delivered).toBe(false);
    expect(mockedFetch()).not.toHaveBeenCalled();
  });

  it("proceeds with fetch for public IP", async () => {
    const { ep, d } = await createDelivery("http://203.0.113.1/x");
    mockedFetch().mockResolvedValueOnce(new Response("OK", { status: 200 }));
    const r = await attemptDelivery(d.id, ep, "{}");
    expect(mockedFetch()).toHaveBeenCalledTimes(1);
    expect(r.delivered).toBe(true);
  });

  it("treats 3xx as failure with redirect message", async () => {
    const { ep, d } = await createDelivery("http://203.0.113.1/x");
    mockedFetch().mockResolvedValueOnce(new Response("", { status: 301, headers: { Location: "http://10.0.0.1" } }));
    const r = await attemptDelivery(d.id, ep, "{}");
    expect(r.delivered).toBe(false);
    expect(r.error).toMatch(/redirects not supported/i);
  });

  it("fetch called with redirect: 'manual'", async () => {
    const { ep, d } = await createDelivery("http://203.0.113.1/x");
    mockedFetch().mockResolvedValueOnce(new Response("OK", { status: 200 }));
    await attemptDelivery(d.id, ep, "{}");
    const opts = mockedFetch().mock.calls[0]?.[1] as RequestInit | undefined;
    expect(opts?.redirect).toBe("manual");
  });

  it("blocked destination schedules retry (not permanent failure)", async () => {
    const { ep, d } = await createDelivery("http://10.0.0.1/x");
    await attemptDelivery(d.id, ep, "{}");
    const updated = await testDb.webhookDelivery.findUnique({ where: { id: d.id }, select: { attempts: true, lastError: true, status: true } });
    expect(updated?.attempts).toBe(1);
    expect(updated?.lastError).toMatch(/Destination blocked/i);
    expect(updated?.status).toBe("PENDING");
  });
});
