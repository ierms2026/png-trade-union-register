import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// =============================================================================
// GET /api/legislation
// -----------------------------------------------------------------------------
// Returns the static legislation library JSON. The data lives in
// public/legislation/legislation.json (a static file, version-controlled,
// editable by the department without a code deploy).
//
// WHY STATIC JSON (not a DB table):
//   The legislation library is a curated reference list — it changes
//   rarely (when a new act is passed or an old one is repealed) and
//   is the same for every user. A DB table would add write-path
//   complexity (admin UI for CRUD) for zero benefit. A static JSON
//   file lets the department update the library by editing one file.
//
// WHY NOT just serve the file directly from /public/:
//   Next.js serves files in /public/ as static assets at the root URL.
//   Putting the JSON at /public/legislation/legislation.json would
//   expose it at /legislation/legislation.json — but we want it at
//   /api/legislation (consistent with the other API endpoints, and
//   lets us add auth/rate-limiting later if needed). This route reads
//   the file from disk and returns it as JSON.
//
// CACHING:
//   The file is small and rarely changes. We cache it in memory after
//   the first read to avoid disk I/O on every request. A server restart
//   clears the cache (which is fine — the file is read once on next
//   request).
// =============================================================================

let cachedLegislation: unknown = null;

export async function GET() {
  if (cachedLegislation) {
    return NextResponse.json(cachedLegislation);
  }

  const filePath = path.join(
    process.cwd(),
    "public",
    "legislation",
    "legislation.json",
  );

  try {
    const fileContent = await fs.readFile(filePath, "utf8");
    cachedLegislation = JSON.parse(fileContent);
    return NextResponse.json(cachedLegislation);
  } catch (err) {
    console.error("[legislation] Failed to read legislation.json:", err);
    return NextResponse.json(
      { error: "Legislation library not available." },
      { status: 500 },
    );
  }
}
