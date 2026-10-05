#!/usr/bin/env node
// =============================================================================
// packaging-check.ts — verify every UI-referenced API route has a route file.
//
// Run this BEFORE packaging the source tree into a tarball. It:
//   1. Scans all .ts/.tsx files under src/ (excluding __tests__) for /api/
//      URL references in CODE (not comments)
//   2. For each URL, checks that a corresponding route.ts file exists
//   3. Reports any missing routes + exits non-zero if any are found
//
// This prevents the "route folder dropped from the archive" bug where a
// download button or API call works in dev but 404s after deployment
// because the route folder was accidentally excluded from the tarball.
//
// Usage:  npx tsx scripts/packaging-check.ts
// =============================================================================

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const PROJECT_ROOT = resolve(__dirname, "..");
const SRC_ROOT = join(PROJECT_ROOT, "src");
const APP_API_ROOT = join(SRC_ROOT, "app", "api");

// --- Walk the source tree + collect all .ts/.tsx files -------------------
function walkDir(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      // Skip node_modules, .next, .git, and __tests__ (test files contain
      // example URLs that aren't real routes).
      if (entry === "node_modules" || entry === ".next" || entry === ".git" || entry === "__tests__") continue;
      walkDir(full, files);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

// --- Strip comments from source code -------------------------------------
// Removes // line comments and /* */ block comments so we only scan
// actual code, not documentation that references API paths.
function stripComments(source: string): string {
  // Remove /* ... */ block comments (non-greedy, multiline)
  let result = source.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove // line comments
  result = result.replace(/\/\/.*$/gm, "");
  return result;
}

// --- Extract /api/ URL patterns from source -------------------------------
function extractApiUrls(source: string): Set<string> {
  const urls = new Set<string>();
  // Match /api/ followed by path segments, including [param] and ${var}
  const pattern = /\/api\/(?:[\w/-]|\$\{[\w.[\]]+\})+/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    let urlPath = match[0];
    // Strip query string
    urlPath = urlPath.split("?")[0];
    // Strip trailing slash
    urlPath = urlPath.replace(/\/+$/, "");
    // Normalize ${...} to [param] for folder lookup
    urlPath = urlPath.replace(/\$\{[^}]+\}/g, "[param]");
    if (urlPath.startsWith("/api/") && urlPath.length > 5) {
      urls.add(urlPath);
    }
  }
  return urls;
}

// --- Check if a route.ts file exists for a given API URL path -------------
function routeFileExists(urlPattern: string): boolean {
  // Convert /api/foo/bar/[param]/baz to src/app/api/foo/bar/[param]/baz/route.ts
  const relativePath = urlPattern.replace(/^\/api\//, "");
  const segments = relativePath.split("/").filter(Boolean);

  // Try to find the route file by walking the directory structure.
  // Dynamic segments ([param]) match any [xxx] directory.
  // Literal segments match either an exact directory name OR any [xxx]
  // directory (for cases where the code uses a literal ID like
  // /api/unions/123 but the folder is /api/unions/[unionId]).
  let currentDir = APP_API_ROOT;

  for (const segment of segments) {
    if (segment === "[param]") {
      // Match any dynamic segment directory
      try {
        const entries = readdirSync(currentDir);
        const dynamicDir = entries.find(
          (e) => e.startsWith("[") && e.endsWith("]"),
        );
        if (!dynamicDir) return false;
        currentDir = join(currentDir, dynamicDir);
      } catch {
        return false;
      }
    } else {
      const nextDir = join(currentDir, segment);
      if (existsSync(nextDir)) {
        currentDir = nextDir;
      } else {
        // Maybe it's a dynamic segment that the caller refers to by a
        // literal name (e.g. /api/unions/123 where the folder is
        // /api/unions/[unionId]). Try matching a [xxx] directory.
        try {
          const entries = readdirSync(currentDir);
          const dynamicDir = entries.find(
            (e) => e.startsWith("[") && e.endsWith("]"),
          );
          if (dynamicDir) {
            currentDir = join(currentDir, dynamicDir);
          } else {
            return false;
          }
        } catch {
          return false;
        }
      }
    }
  }

  // Check if route.ts exists in the final directory
  if (existsSync(join(currentDir, "route.ts"))) {
    return true;
  }

  // Also check if there's a sub-route (e.g. /api/legal-holds has no
  // route.ts at the root, but has /api/legal-holds/[documentId]/place/route.ts).
  // In this case, the URL is a "parent path" — it's valid as long as
  // sub-routes exist. We check if ANY subdirectory contains a route.ts.
  try {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const entryPath = join(currentDir, entry);
      if (statSync(entryPath).isDirectory()) {
        // Recursively check if any descendant has a route.ts
        if (hasRouteInSubtree(entryPath)) {
          return true;
        }
      }
    }
  } catch {}

  return false;
}

// --- Check if any file in a subtree is named route.ts --------------------
function hasRouteInSubtree(dir: string): boolean {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (hasRouteInSubtree(full)) return true;
      } else if (entry === "route.ts") {
        return true;
      }
    }
  } catch {}
  return false;
}

// --- Main ------------------------------------------------------------------
console.log("[packaging-check] Scanning source tree for /api/ URL references...");
console.log("[packaging-check] (excluding __tests__ directories + comments)");

const files = walkDir(SRC_ROOT);
const allUrls = new Set<string>();

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const codeOnly = stripComments(source);
  const urls = extractApiUrls(codeOnly);
  for (const url of urls) {
    allUrls.add(url);
  }
}

console.log(`[packaging-check] Found ${allUrls.size} unique API URL patterns across ${files.length} source files.`);

// --- Check each URL -------------------------------------------------------
const missing: string[] = [];
const present: string[] = [];

for (const url of [...allUrls].sort()) {
  if (routeFileExists(url)) {
    present.push(url);
  } else {
    missing.push(url);
  }
}

console.log(`[packaging-check] ✓ ${present.length} routes have corresponding route.ts files.`);

if (missing.length > 0) {
  console.error(`[packaging-check] ✗ ${missing.length} routes are MISSING route.ts files:`);
  for (const url of missing) {
    console.error(`  MISSING: ${url}`);
  }
  console.error(`\n[packaging-check] FAILED — fix the missing routes before packaging.`);
  process.exit(1);
} else {
  console.log(`[packaging-check] ✓ All routes verified. Safe to package.`);
  process.exit(0);
}
