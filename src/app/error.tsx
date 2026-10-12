"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// =============================================================================
// error.tsx — friendly error boundary for route segments.
//
// Triggered by Next.js when a React component or server function inside
// the route segment throws an unhandled error. This is the user-facing
// fallback — the actual error is logged to the server console + sent to
// the error-tracking service (if configured) by Next.js.
//
// Friendly wording + a clear way back. No stack trace, no error code, no
// jargon. Just "something went wrong" + a retry button + a way home.
//
// Note: this MUST be a client component ("use client") because error
// boundaries need to handle state (the `error` prop + the `reset` callback).
// =============================================================================

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to the server console so the operator sees it. In production
    // you'd also forward this to your error-tracking service (Sentry,
    // etc.) — left as a hook here.
    // eslint-disable-next-line no-console
    console.error("[error.tsx] Unhandled error in route segment:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl">Something went wrong</CardTitle>
          <CardDescription>
            We hit an unexpected error while loading this page. Try again —
            if the problem keeps happening, go back to the home page and
            start over.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button onClick={reset} className="w-full">
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" aria-hidden="true" />
              Go to the home page
            </Link>
          </Button>
          {error.digest && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Reference: {error.digest}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
