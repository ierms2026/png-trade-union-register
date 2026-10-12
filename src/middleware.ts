import { NextRequest, NextResponse } from "next/server";

// =============================================================================
// OP-01: DEMO_READ_ONLY middleware.
//
// When DEMO_READ_ONLY=true is set, every non-GET request to /api/* is blocked
// with 403, EXCEPT:
//   - POST /api/auth/login (needed to sign in)
//   - POST /api/auth/logout (needed to sign out)
//
// Password reset (forgot-password, set-password) is BLOCKED in read-only mode
// — stakeholders testing the demo don't need to reset passwords, and allowing
// it could be used to take over an account.
//
// Cron routes: the middleware blocks cron POST requests when DEMO_READ_ONLY
// is true. Cron jobs should NOT run in demo mode — they're scheduled
// background tasks that mutate data (snapshots, sweeps, digests). If cron
// needs to run during a demo, set DEMO_READ_ONLY=false temporarily, or
// exclude cron routes from the matcher (see config below — currently cron
// IS blocked, which is the safe default).
//
// The middleware is a no-op when DEMO_READ_ONLY is not set or not "true".
// =============================================================================

// Paths that are always allowed even in read-only mode.
const ALLOWED_POST_PATHS = [
  "/api/auth/login",
  "/api/auth/logout",
];

export function middleware(req: NextRequest) {
  // Only active when DEMO_READ_ONLY=true
  if (process.env.DEMO_READ_ONLY !== "true") {
    return NextResponse.next();
  }

  // Only block non-GET methods
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return NextResponse.next();
  }

  // Allow login + logout + password reset
  const pathname = req.nextUrl.pathname;
  if (ALLOWED_POST_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // Block everything else
  return NextResponse.json(
    {
      error:
        "This is a read-only demo. Mutations (POST/PUT/PATCH/DELETE) are disabled. " +
        "Set DEMO_READ_ONLY=false to enable writes.",
    },
    { status: 403 },
  );
}

export const config = {
  // Run on all API routes + server actions
  matcher: ["/api/:path*"],
};
