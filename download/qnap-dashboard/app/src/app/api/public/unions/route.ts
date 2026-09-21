import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import {
  checkRateLimit,
  rateLimitedResponse,
  rateLimitHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";

// =============================================================================
// GET /api/public/unions
// -----------------------------------------------------------------------------
// PUBLIC endpoint — no auth required. Searches the union registry by
// unionName or registrationNo. Returns only a 4-key whitelist per union:
//   { id, unionName, registrationNo, status }
//
// RATE LIMITING:
//   60 requests per minute per IP. Uses the shared rate-limit helper
//   (src/lib/rate-limit.ts) — same implementation as the authed routes,
//   just keyed on IP instead of userId.
//
//   In a multi-instance deployment this would need to be Redis-backed;
//   for the single-process dev/demo, in-memory is sufficient.
//
// WHY NO `disabled` / `remarks` / `contact`:
//   The public portal is for researchers and union members looking up
//   registration status. They don't need internal contact info or
//   admin remarks — those are available to authenticated staff via
//   /api/unions/[id]. Exposing the minimum necessary is the principle
//   of least privilege applied to public data.
// =============================================================================

export async function GET(req: NextRequest) {
  // --- 1. Rate limit (per-IP) ---------------------------------------------
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rl = checkRateLimit(
    "publicSearch",
    ip,
    RATE_LIMITS.publicSearch.max,
    RATE_LIMITS.publicSearch.windowMs,
  );
  if (!rl.allowed) {
    return rateLimitedResponse(rl);
  }
  const rlHeaders = rateLimitHeaders(rl);

  // --- 2. Parse search query ---------------------------------------------
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || "";

  // --- 3. Query the DB with the 4-key whitelist --------------------------
  // SQLite doesn't support Prisma's `mode: "insensitive"` — use plain
  // `contains` (which is case-insensitive by default in SQLite for ASCII).

  const where: { OR?: Array<Record<string, unknown>> } = {};
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

  return NextResponse.json({ unions }, { headers: rlHeaders });
}
