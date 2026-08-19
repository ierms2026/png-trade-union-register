import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";

// =============================================================================
// GET /api/public/unions
// -----------------------------------------------------------------------------
// PUBLIC endpoint — no auth required. Searches the union registry by
// unionName or registrationNo. Returns only a 4-key whitelist per union:
//   { id, unionName, registrationNo, status }
//
// RATE LIMITING:
//   60 requests per minute per IP. We use an in-memory counter (a Map
//   from IP → { count, resetAt }). In a multi-instance deployment this
//   would need to be Redis-backed; for the single-process dev/demo,
//   in-memory is sufficient.
//
// WHY NO `disabled` / `remarks` / `contact`:
//   The public portal is for researchers and union members looking up
//   registration status. They don't need internal contact info or
//   admin remarks — those are available to authenticated staff via
//   /api/unions/[id]. Exposing the minimum necessary is the principle
//   of least privilege applied to public data.
// =============================================================================

// In-memory rate limit store. Keyed by IP.
// Each entry: { count: number, resetAt: number (epoch ms) }
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 req/min

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  entry.count++;
  return true;
}

export async function GET(req: NextRequest) {
  // --- 1. Rate limit -----------------------------------------------------
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      {
        status: 429,
        headers: { "Retry-After": "60" },
      },
    );
  }

  // --- 2. Parse search query ---------------------------------------------
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || "";

  // --- 3. Query the DB with the 4-key whitelist --------------------------
  // SQLite doesn't support Prisma's `mode: "insensitive"` — use plain
  // `contains` (which is case-insensitive by default in SQLite for ASCII).
   
  const where: any = {};
  if (q) {
    where.OR = [
      { unionName: { contains: q } },
      { registrationNo: { contains: q } },
    ];
  }

  const unions = await db.union.findMany({
    where,
    select: {
      id: true,
      unionName: true,
      registrationNo: true,
      status: true,
    },
    orderBy: { unionName: "asc" },
    take: 100, // cap at 100 results — the public search shouldn't dump the whole DB
  });

  return NextResponse.json({ unions });
}
