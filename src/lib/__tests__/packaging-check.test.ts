import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

// =============================================================================
// Packaging check test — verifies every UI-referenced API route has a
// corresponding route.ts file in src/app/api/.
//
// This is the test version of scripts/packaging-check.ts. It prevents the
// "route folder dropped from the archive" bug: if a developer adds a
// fetch("/api/new-thing") call but forgets to create the route file, this
// test fails.
//
// The test excludes __tests__ directories + strips comments so it only
// checks actual code references, not documentation or test examples.
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..", "src");
const APP_API_ROOT = resolve(SRC_ROOT, "app", "api");

function walkDir(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git" || entry === "__tests__") continue;
      walkDir(full, files);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

function stripComments(source: string): string {
  let result = source.replace(/\/\*[\s\S]*?\*\//g, "");
  result = result.replace(/\/\/.*$/gm, "");
  return result;
}

function extractApiUrls(source: string): Set<string> {
  const urls = new Set<string>();
  const pattern = /\/api\/(?:[\w/-]|\$\{[\w.[\]]+\})+/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    let urlPath = match[0];
    urlPath = urlPath.split("?")[0];
    urlPath = urlPath.replace(/\/+$/, "");
    urlPath = urlPath.replace(/\$\{[^}]+\}/g, "[param]");
    if (urlPath.startsWith("/api/") && urlPath.length > 5) {
      urls.add(urlPath);
    }
  }
  return urls;
}

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

function routeFileExists(urlPattern: string): boolean {
  const relativePath = urlPattern.replace(/^\/api\//, "");
  const segments = relativePath.split("/").filter(Boolean);
  let currentDir = APP_API_ROOT;

  for (const segment of segments) {
    if (segment === "[param]") {
      try {
        const entries = readdirSync(currentDir);
        const dynamicDir = entries.find((e) => e.startsWith("[") && e.endsWith("]"));
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
        try {
          const entries = readdirSync(currentDir);
          const dynamicDir = entries.find((e) => e.startsWith("[") && e.endsWith("]"));
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

  if (existsSync(join(currentDir, "route.ts"))) return true;

  try {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const entryPath = join(currentDir, entry);
      if (statSync(entryPath).isDirectory()) {
        if (hasRouteInSubtree(entryPath)) return true;
      }
    }
  } catch {}

  return false;
}

describe("packaging check — every UI-referenced API route has a route.ts file", () => {
  it("all /api/ URLs in source code (excluding tests + comments) resolve to route files", () => {
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

    const missing: string[] = [];
    for (const url of [...allUrls].sort()) {
      if (!routeFileExists(url)) {
        missing.push(url);
      }
    }

    expect(missing, `Missing route.ts files for these API URLs:\n${missing.map((u) => `  ${u}`).join("\n")}`).toEqual([]);
  });
});
