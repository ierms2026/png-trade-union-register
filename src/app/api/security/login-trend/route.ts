import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";

// =============================================================================
// GET /api/security/login-trend
// -----------------------------------------------------------------------------
// Returns daily failed + successful login counts for the last 7 days.
// Powers the "Failed Logins (7 days)" line chart on the Security dashboard.
//
// Returns:
//   {
//     days: [
//       { date: "2026-08-13", failed: 3, successful: 5 },
//       { date: "2026-08-14", failed: 0, successful: 2 },
//       ...
//     ]
//   }
//
// The query fetches all LoginAttempt rows from the last 7 days, then
// aggregates by day in JS. SQLite doesn't have great date-trunc support,
// so we bucket by date string (YYYY-MM-DD).
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can view security trends." },
      { status: 403 },
    );
  }

  // Compute the date 7 days ago
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Fetch all login attempts from the last 7 days
  const attempts = await db.loginAttempt.findMany({
    where: { createdAt: { gte: sevenDaysAgo } },
    select: { success: true, createdAt: true },
  });

  // Build a map of date → { failed, successful }
  const dayMap = new Map<string, { failed: number; successful: number }>();

  // Initialize all 7 days with zeros (so the chart shows gaps)
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10); // YYYY-MM-DD
    dayMap.set(dateStr, { failed: 0, successful: 0 });
  }

  // Bucket each attempt into its day
  for (const attempt of attempts) {
    const dateStr = attempt.createdAt.toISOString().slice(0, 10);
    const entry = dayMap.get(dateStr);
    if (entry) {
      if (attempt.success) {
        entry.successful++;
      } else {
        entry.failed++;
      }
    }
  }

  // Convert to array (already sorted by date ascending)
  const days = Array.from(dayMap.entries()).map(([date, counts]) => ({
    date,
    failed: counts.failed,
    successful: counts.successful,
  }));

  return NextResponse.json({ days });
}
