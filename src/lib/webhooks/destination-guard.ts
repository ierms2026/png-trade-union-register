import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";

export type DnsResolver = (hostname: string) => Promise<string[]>;
export type DestinationCheckResult = { ok: true } | { ok: false; reason: string };

async function defaultResolver(hostname: string): Promise<string[]> {
  return new Promise((resolve) => {
    dnsLookup(hostname, { all: true }, (err, addresses) => {
      if (err || !addresses) { resolve([]); return; }
      resolve(addresses.map((a: LookupAddress) => a.address));
    });
  });
}

// Blocked ranges:
//   0.0.0.0/8 (unspecified)
//   10.0.0.0/8 (private class A)
//   100.64.0.0/10 (CGN, RFC 6598)
//   127.0.0.0/8 (loopback)
//   169.254.0.0/16 (link-local, incl cloud metadata 169.254.169.254)
//   172.16.0.0/12 (private class B)
//   192.168.0.0/16 (private class C)
//   :: (unspecified)
//   ::1 (loopback)
//   fc00::/7 (unique local)
//   fe80::/10 (link-local)
//   ::ffff:0:0/96 (IPv4-mapped — delegates to isBlockedIpv4)

export function isBlockedIp(ip: string): boolean {
  const ipv4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (ipv4Mapped) return isBlockedIp(ipv4Mapped[1]);
  const type = isIP(ip);
  if (type === 4) return isBlockedIpv4(ip);
  if (type === 6) return isBlockedIpv6(ip);
  return true; // not a valid IP — treat as blocked
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "0:0:0:0:0:0:0:0") return true;
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  // IPv4-mapped IPv6 in hex form (::ffff:XX:YY)
  if (lower.startsWith("::ffff:") || lower.startsWith("0:0:0:0:0:ffff:")) {
    const parts = lower.split(":");
    const hi = parts[parts.length - 2]; const lo = parts[parts.length - 1];
    const hiNum = parseInt(hi, 16); const loNum = parseInt(lo, 16);
    if (!isNaN(hiNum) && !isNaN(loNum)) {
      const a = (hiNum >> 8) & 0xff; const b = hiNum & 0xff;
      const c = (loNum >> 8) & 0xff; const d = loNum & 0xff;
      return isBlockedIpv4(`${a}.${b}.${c}.${d}`);
    }
  }
  const firstGroup = lower.split(":")[0]; const firstNum = parseInt(firstGroup, 16);
  if (!isNaN(firstNum) && (firstNum & 0xfe00) === 0xfc00) return true; // fc00::/7
  if (firstGroup.startsWith("fe8") || firstGroup.startsWith("fe9") || firstGroup.startsWith("fea") || firstGroup.startsWith("feb")) return true; // fe80::/10
  return false;
}

export async function assertPublicDestination(url: string, resolve: DnsResolver = defaultResolver): Promise<DestinationCheckResult> {
  // Dev escape hatch
  if (process.env.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS === "true") {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { ok: false, reason: `Protocol must be http: or https: (got ${parsed.protocol}).` };
      return { ok: true };
    } catch { return { ok: false, reason: "Invalid URL." }; }
  }

  let parsed: URL;
  try { parsed = new URL(url); } catch { return { ok: false, reason: "Invalid URL." }; }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { ok: false, reason: `Protocol must be http: or https: (got ${parsed.protocol}).` };

  // Reject userinfo (http://user:pass@host/)
  if (parsed.username || parsed.password) return { ok: false, reason: "URL must not contain userinfo (username:password@)." };

  const hostname = parsed.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  // Reject "localhost" (and "localhost." with trailing dot)
  if (hostname.toLowerCase().replace(/\.$/, "") === "localhost") return { ok: false, reason: "Hostname 'localhost' is not allowed." };

  // If hostname is a literal IP, check it directly
  if (isIP(hostname) > 0) {
    if (isBlockedIp(hostname)) return { ok: false, reason: `IP address ${hostname} is in a blocked range.` };
    return { ok: true };
  }

  // Resolve the hostname and check ALL resolved addresses
  let addresses: string[];
  try { addresses = await resolve(hostname); } catch { return { ok: false, reason: `Could not resolve hostname: ${hostname}.` }; }
  if (addresses.length === 0) return { ok: false, reason: `Hostname ${hostname} did not resolve to any address.` };
  for (const addr of addresses) {
    if (isBlockedIp(addr)) return { ok: false, reason: `Hostname ${hostname} resolves to ${addr}, which is in a blocked range.` };
  }
  return { ok: true };
}
