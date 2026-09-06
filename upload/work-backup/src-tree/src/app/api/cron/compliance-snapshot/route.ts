import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ensureSnapshotForToday } from "@/lib/dashboard/snapshot";

// =============================================================================
// POST /api/cron/compliance-snapshot
// -----------------------------------------------------------------------------
// Chunk 4.2a: daily compliance-snapshot trigger. Captures the canonical
// compliance counts as an append-only daily history row.
//
// AUTH:
//   Bearer token via the `authorization` header. The token must match
//   CRON_SECRET (set in .env) using a CONSTANT-TIME comparison
//   (timingSafeEqual) — same pattern as /api/cron/compliance-sweep. This is
//   a programmatic endpoint: no browser session, no cookie.
//
// IDEMPOTENCY:
//   Re-invoking on the same UTC day overwrites today's row (PROVISIONAL).
//   Past-day rows are IMMUTABLE — the writer function (ensureSnapshotForToday)
//   never accepts a `date` parameter and always derives today from `new Date()`,
//   so there's no API surface for backfilling. Two triggers on the same day
//   → still ONE row (UNIQUE constraint on `date`).
//
// SCHEDULING:
//   Add to crontab via scripts/cron.sh:
//     0 8 * * *  /path/to/scripts/cron.sh snapshot
//   Recommended to fire BEFORE the compliance-sweep (which generates
//   notifications based on current statuses) so the snapshot captures the
//   pre-notification state. If they fire in the opposite order, the
//   snapshot still captures the same canonical counts — the sweep only
//   writes notifications, it doesn't mutate compliance statuses.
//
// DAY BOUNDARY: UTC. See src/lib/dashboard/snapshot.ts header for the
//   documented convention (matches src/lib/auth/constants.ts line 76).
// =============================================================================

export async function POST(req: NextRequest) {
  // --- 1. Bearer token auth (constant-time) --------------------------------
  // Same pattern as /api/cron/compliance-sweep/route.ts. timingSafeEqual
  // prevents timing side-channels; we return the same 401 for any failure
  // (length mismatch vs. wrong bytes) so an attacker can't distinguish.
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header." },
      { status: 401 },
    );
  }
  const token = authHeader.slice(7);
  const secret =
    process.env.CRON_SECRET ||
    (process.env.NODE_ENV !== "production"
      ? "dev-cron-secret-preview-only"
      : undefined);
  if (
    !secret ||
    token.length !== secret.length ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  ) {
    return NextResponse.json(
      { error: "Invalid cron secret." },
      { status: 401 },
    );
  }

  // --- 2. Capture the snapshot ---------------------------------------------
  // ensureSnapshotForToday() handles:
  //   - fetchMatrixData() → buildComplianceMatrix() (SHARED canonical derivation)
  //   - tallyMatrix() → counts (matching /api/dashboard/stats tally logic)
  //   - buildCapturedWith() → live config stamp (definition provenance)
  //   - create/update via Prisma → one row per UTC date
  try {
    const result = await ensureSnapshotForToday();
    return NextResponse.json({
      captured: true,
      date: result.date,
      action: result.action,
      counts: result.counts,
    });
  } catch (err) {
    // PastDayImmutabilityError should be unreachable here (the writer
    // always uses new Date() — there's no caller-supplied date to be past).
    // Any error here is unexpected — log loudly and surface to the caller.
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { captured: false, error: message },
      { status: 500 },
    );
  }
}
