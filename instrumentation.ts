// =============================================================================
// instrumentation.ts — Next.js startup hook.
//
// Runs ONCE when the server boots (in the Node.js runtime, not the edge).
// We use it to validate that the legislation library JSON file exists and
// is parseable — if it's missing or broken, the /api/legislation endpoint
// would 500 on every request, and we'd rather catch this at boot than
// discover it from a user's bug report.
//
// GUARD: process.env.NEXT_RUNTIME === "nodejs"
//   Next.js calls register() in BOTH the nodejs and edge runtimes. The
//   edge runtime can't use `node:fs` / `node:path`, so we guard the
//   file-system access to run only in the nodejs runtime. In the edge
//   runtime, register() is a no-op for us.
//
// DYNAMIC IMPORTS:
//   `node:fs` and `node:path` are imported dynamically inside register()
//   (not at the top of the file) so that bundlers don't try to include
//   them in the edge bundle. A top-level `import fs from "node:fs"` would
//   be a hard error in the edge runtime even if never called.
// =============================================================================

export async function register() {
  // Only run in the Node.js runtime (not edge).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Dynamic imports — see comment in file header.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const legislationPath = path.join(
    process.cwd(),
    "public",
    "legislation",
    "legislation.json",
  );

  try {
    const content = await fs.readFile(legislationPath, "utf8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      console.warn(
        "[instrumentation] legislation.json is not an array — the /api/legislation endpoint may return unexpected shapes.",
      );
    } else {
      console.log(
        `[instrumentation] Legislation library loaded: ${parsed.length} entries.`,
      );
    }
  } catch (err) {
    // Don't throw — a missing legislation file shouldn't brick the server.
    // Log a warning so the operator knows to fix it.
    console.warn(
      "[instrumentation] Failed to load legislation.json:",
      err instanceof Error ? err.message : err,
    );
  }

  // --- pdftotext health check ---
  // Text extraction depends on the system `pdftotext` binary (poppler-utils).
  // If it's not installed, PDF uploads will silently fail text extraction
  // (textContent stays null). Log a warning so the operator knows.
  try {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    await execAsync("which pdftotext");
    console.log("[instrumentation] pdftotext available — text extraction enabled.");
  } catch {
    console.warn(
      "[instrumentation] pdftotext NOT found — PDF text extraction will be disabled. " +
        "Install poppler-utils to enable full-text search.",
    );
  }
}
