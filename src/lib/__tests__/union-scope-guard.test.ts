import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const projectRoot = resolve(__dirname, "../../..");
const apiRoot = resolve(projectRoot, "src", "app", "api");

const ALLOWLIST: Array<[string, string]> = [
  ["tasks/route.ts", "Uses a ternary that falls through to { assigneeId: user.id } for an unassigned Officer — they see only tasks assigned to them, not all tasks. Fail-closed enough for the tasks domain."],
];

function collectRouteFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) files.push(...collectRouteFiles(fullPath));
    else if (entry.endsWith(".ts") && !entry.includes(".test.")) files.push(fullPath);
  }
  return files;
}

const FAILOPEN_PATTERN = /(?:Role\.OFFICER|isUnionScopedRole)\s*&&\s*\w+\.assignedUnionId\b(?!\s*!==)/;

describe("union-scope guard — no fail-open patterns in src/app/api", () => {
  const routeFiles = collectRouteFiles(apiRoot);
  it("found route files to scan", () => { expect(routeFiles.length).toBeGreaterThan(50); });
  it("no fail-open OFFICER&&assignedUnionId truthiness gates (allowlisted excluded)", () => {
    const offenders: string[] = [];
    for (const filePath of routeFiles) {
      const relPath = filePath.replace(apiRoot + "/", "");
      if (ALLOWLIST.find(([p]) => p === relPath)) continue;
      const source = readFileSync(filePath, "utf8");
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      const match = FAILOPEN_PATTERN.exec(stripped);
      if (match) {
        const lines = source.split("\n");
        let lineNum = 0;
        for (let i = 0; i < lines.length; i++) {
          if (FAILOPEN_PATTERN.test(lines[i].replace(/\/\/.*$/, ""))) { lineNum = i + 1; break; }
        }
        offenders.push(`  ${relPath}:${lineNum}: ${match[0].trim()}`);
      }
    }
    if (offenders.length > 0) {
      throw new Error(`Guard: ${offenders.length} fail-open pattern(s) found.\nUse getUnionScope(user) instead.\n` + offenders.join("\n"));
    }
  });
  it("allowlisted files exist", () => {
    for (const [relPath] of ALLOWLIST) { expect(statSync(join(apiRoot, relPath)).isFile()).toBe(true); }
  });
});
