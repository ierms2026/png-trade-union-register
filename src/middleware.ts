import { NextRequest, NextResponse } from "next/server";

// =============================================================================
// OP-01: DEMO_READ_ONLY middleware.
//
// When DEMO_READ_ONLY=true is set, every non-GET request to /api/* is blocked
// with 403, EXCEPT:
//   - POST /api/auth/login (needed to sign in)
//   - POST /api/auth/logout (needed to sign out)
//   - POST /api/auth/forgot-password (needed for password reset flow)
//   - POST /api/auth/set-password (needed for password reset flow)
//
// This lets stakeholders click around + read everything in demo mode without
// accidentally mutating data. The check runs at the middleware level (before
// the route handler), so it's enforced even if a route handler forgets to
// check.
//
// The middleware is a no-op when DEMO_READ_ONLY is not set or not "true".
// =============================================================================

// Paths that are always allowed even in read-only mode.
const ALLOWED_POST_PATHS = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/forgot-password",
  "/api/auth/set-password",
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
