import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const SRC_ROOT = path.join(process.cwd(), "src");
const APP_API_ROOT = path.join(SRC_ROOT, "app", "api");

function walkDir(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkDir(full, files);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

function extractApiUrls(source: string): Set<string> {
  const urls = new Set<string>();
  const pattern = /\/api\/(?:[\w/-]|\$\{[\w.[\]]+\})+/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    let urlPath = match[0];
    urlPath = urlPath.replace(/\$\{[^}]+\}/g, "[param]");
    urlPath = urlPath.split("?")[0];
    urlPath = urlPath.replace(/\/+$/, "");
    if (urlPath.startsWith("/api/") && urlPath.length > 5) {
      urls.add(urlPath);
    }
  }
  return urls;
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
        currentDir = path.join(currentDir, dynamicDir);
      } catch { return false; }
    } else {
      const nextDir = path.join(currentDir, segment);
      if (!existsSync(nextDir)) {
        try {
          const entries = readdirSync(currentDir);
          const dynamicDir = entries.find((e) => e.startsWith("[") && e.endsWith("]"));
          if (dynamicDir) { currentDir = path.join(currentDir, dynamicDir); continue; }
        } catch {}
        return false;
      }
      currentDir = nextDir;
    }
  }
  return existsSync(path.join(currentDir, "route.ts"));
}

describe("Route coverage — every UI-referenced API URL resolves to a route file", () => {
  it("scans all source files + finds API URL references", () => {
    const sourceFiles = [
      ...walkDir(path.join(SRC_ROOT, "components")),
      ...walkDir(path.join(SRC_ROOT, "app")),
    ];
    const relevantFiles = sourceFiles.filter(
      (f) => !f.includes("__tests__") && !f.includes("node_modules")
    );
    expect(relevantFiles.length).toBeGreaterThan(50);
    const allUrls = new Set<string>();
    for (const file of relevantFiles) {
      const source = readFileSync(file, "utf8");
      const urls = extractApiUrls(source);
      for (const url of urls) allUrls.add(url);
    }
    expect(allUrls.size).toBeGreaterThan(20);
    console.log(`\n  Found ${allUrls.size} unique API URL patterns across ${relevantFiles.length} source files`);
  });

  it("every UI-referenced API URL resolves to a route.ts file", () => {
    const sourceFiles = [
      ...walkDir(path.join(SRC_ROOT, "components")),
      ...walkDir(path.join(SRC_ROOT, "app")),
    ];
    const relevantFiles = sourceFiles.filter(
      (f) => !f.includes("__tests__") && !f.includes("node_modules")
    );
    const allUrls = new Set<string>();
    const urlToFiles = new Map<string, string[]>();
    for (const file of relevantFiles) {
      const source = readFileSync(file, "utf8");
      const urls = extractApiUrls(source);
      for (const url of urls) {
        allUrls.add(url);
        if (!urlToFiles.has(url)) urlToFiles.set(url, []);
        urlToFiles.get(url)!.push(path.relative(process.cwd(), file));
      }
    }
    const knownPrefixes = new Set([
      "/api/v1/unions",
      "/api/legal-holds",
      "/api/public/files",
      "/api/foo",
      "/api/cron/compliance-sweep/route",
    ]);
    const missing: Array<{ url: string; referencedIn: string[] }> = [];
    for (const url of allUrls) {
      if (knownPrefixes.has(url)) continue;
      if (!routeFileExists(url)) {
        missing.push({ url, referencedIn: urlToFiles.get(url) ?? [] });
      }
    }
    if (missing.length > 0) {
      const details = missing.map((m) => `  ✗ ${m.url}\n    referenced in: ${m.referencedIn.join(", ")}`).join("\n");
      console.log(`\n  ${missing.length} route(s) missing:\n${details}\n`);
    }
    expect(missing).toEqual([]);
  });

  it("specifically verifies the version-download route exists (the chunk-11 bug)", () => {
    const versionDownloadUrl = "/api/unions/[param]/documents/[param]/versions/[param]/download";
    const exists = routeFileExists(versionDownloadUrl);
    if (!exists) {
      console.log(`\n  ✗ CRITICAL: The version-download route is missing!\n    URL pattern: ${versionDownloadUrl}\n    Expected file: src/app/api/unions/[unionId]/documents/[documentId]/versions/[versionId]/download/route.ts`);
    }
    expect(exists).toBe(true);
  });

  it("verifies key routes that are frequently referenced", () => {
    const keyRoutes = [
      "/api/auth/me", "/api/auth/login", "/api/auth/logout",
      "/api/unions", "/api/compliance", "/api/dashboard/stats",
      "/api/search", "/api/documents", "/api/notifications",
      "/api/export/compliance-report", "/api/export/compliance-matrix",
      "/api/export/expiry-forecast", "/api/webhooks",
      "/api/v1/compliance/status", "/api/v1/unions/export",
      "/api/contact-requests", "/api/cron/compliance-sweep",
      "/api/cron/compliance-snapshot", "/api/cron/webhook-retry",
      "/api/cron/audit-retention-sweep", "/api/cron/snapshot-retention-sweep",
    ];
    const missing: string[] = [];
    for (const route of keyRoutes) {
      if (!routeFileExists(route)) missing.push(route);
    }
    if (missing.length > 0) console.log(`\n  Missing key routes: ${missing.join(", ")}\n`);
    expect(missing).toEqual([]);
  });
});
