"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// =============================================================================
// global-error.tsx — last-resort error boundary for the root layout.
//
// Triggered by Next.js when the root layout itself throws (e.g. a crash
// in layout.tsx, a font-loading failure, a ThemeProvider crash). It
// REPLACES the entire <html>/<body> tree — so it must render its own
// <html>/<body>. It cannot use the layout's fonts, providers, or styles
// (those are what crashed).
//
// That's why this file uses inline styles + system fonts only: we cannot
// rely on Tailwind classes being available (the stylesheet is injected
// by the root layout, which is the thing that crashed).
//
// Friendly wording + a clear way back. Same copy as error.tsx but with a
// hard reload (rather than React reset) since there's no React tree to
// reset.
// =============================================================================

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[global-error.tsx] Unhandled error in root layout:", error);
  }, [error]);

  function handleReset() {
    // Hard reload — the root layout crashed, so a React reset is unlikely
    // to help. A full reload re-runs layout.tsx from scratch.
    if (typeof window !== "undefined") {
      window.location.reload();
    } else {
      reset();
    }
  }

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          backgroundColor: "#f5f5f4",
          color: "#1c1917",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "28rem",
            backgroundColor: "#ffffff",
            borderRadius: "0.75rem",
            border: "1px solid #e7e5e4",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "3rem",
              height: "3rem",
              margin: "0 auto 0.75rem",
              borderRadius: "9999px",
              backgroundColor: "#fee2e2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#dc2626"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#57534e", margin: "0 0 1.5rem", lineHeight: 1.5 }}>
            We hit an unexpected error while loading the registry. Try again —
            if the problem keeps happening, go back to the home page and
            start over.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={handleReset}
              style={{
                width: "100%",
                padding: "0.5rem 1rem",
                borderRadius: "0.375rem",
                backgroundColor: "#1e3a5f",
                color: "#ffffff",
                fontSize: "0.875rem",
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                width: "100%",
                padding: "0.5rem 1rem",
                borderRadius: "0.375rem",
                backgroundColor: "transparent",
                color: "#1c1917",
                fontSize: "0.875rem",
                fontWeight: 500,
                border: "1px solid #d6d3d1",
                textDecoration: "none",
                display: "inline-block",
                boxSizing: "border-box",
              }}
            >
              Go to the home page
            </a>
          </div>
          {error.digest && (
            <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: "#78716c" }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
