import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// =============================================================================
// Guard test: enforces that dashboard component files do NOT contain
// hardcoded hex color codes or hardcoded status color Tailwind classes.
//
// Per chunk 0.2 acceptance criterion: "Status config is the single
// definition of status colors, labels, and thresholds — enforced by test
// or lint rule."
//
// This test is forward-looking: the current dashboard.tsx uses CSS
// variables (var(--status-compliant)), so it passes now. If chunk 1.1
// (or any future chunk) introduces hardcoded hex codes like #22c55e,
// this test will fail — forcing the author to use the status config module
// instead.
//
// TODO(chunk-1.1): After rewiring components to use STATUS_CONFIG from
// src/lib/dashboard/status-config.ts, add a second scan that checks for
// hardcoded status label strings ("Compliant", "Expiring", "Overdue",
// "Missing", "N/A") in component files — they should come from
// STATUS_CONFIG[status].label. This is not enabled yet because the
// existing dashboard.tsx still has hardcoded labels (chunk 1.1's job to
// remove them).
// =============================================================================

const DASHBOARD_COMPONENT_DIRS = [
  "src/components/app/views",
];

const DASHBOARD_COMPONENT_FILES = [
  "src/components/app/views/dashboard.tsx",
  "src/components/app/views/compliance.tsx",
];

// Hex color code pattern: #RGB, #RRGGBB, #RRGGBBAA, #RRRRGGGGBBBBAAAA
const HEX_COLOR_REGEX = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g;

// Hardcoded status color Tailwind classes (not semantic tokens like
// chart-3, accent, destructive, muted — those are fine).
// These are the raw color names that should never appear directly in
// component files; they should come from the status config instead.
const STATUS_COLOR_TAILWIND = [
  /\bbg-green-\d/,
  /\btext-green-\d/,
  /\bborder-green-\d/,
  /\bbg-red-\d/,
  /\btext-red-\d/,
  /\bborder-red-\d/,
  /\bbg-amber-\d/,
  /\btext-amber-\d/,
  /\bborder-amber-\d/,
  /\bbg-gray-\d/,
  /\btext-gray-\d/,
  /\bborder-gray-\d/,
];

const PROJECT_ROOT = process.cwd();

function readComponentFile(relPath: string): string | null {
  const abs = join(PROJECT_ROOT, relPath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf8");
}

describe("status-config guard", () => {
  describe("no hardcoded hex color codes in dashboard components", () => {
    for (const file of DASHBOARD_COMPONENT_FILES) {
      it(`${file} has no hardcoded hex color codes`, () => {
        const content = readComponentFile(file);
        if (content === null) return; // file may not exist yet in all environments

        const matches = content.match(HEX_COLOR_REGEX);
        if (matches && matches.length > 0) {
          expect.fail(
            `Found hardcoded hex color codes in ${file}: ${matches.join(", ")}. ` +
              `Use STATUS_CONFIG from src/lib/dashboard/status-config.ts instead.`,
          );
        }
        expect(matches).toBeNull();
      });
    }
  });

  describe("no hardcoded status color Tailwind classes in dashboard components", () => {
    for (const file of DASHBOARD_COMPONENT_FILES) {
      it(`${file} has no hardcoded bg-green/red/amber/gray Tailwind classes`, () => {
        const content = readComponentFile(file);
        if (content === null) return;

        const violations: string[] = [];
        for (const pattern of STATUS_COLOR_TAILWIND) {
          const matches = content.match(new RegExp(pattern.source, "g"));
          if (matches) {
            violations.push(...matches);
          }
        }

        if (violations.length > 0) {
          expect.fail(
            `Found hardcoded status color Tailwind classes in ${file}: ` +
              `${[...new Set(violations)].join(", ")}. ` +
              `Use STATUS_CONFIG.colorToken or semantic tokens (chart-3, accent, ` +
              `destructive, muted) instead.`,
          );
        }
        expect(violations).toHaveLength(0);
      });
    }
  });

  describe("status config module exists and is importable", () => {
    it("src/lib/dashboard/status-config.ts exists", () => {
      const path = join(PROJECT_ROOT, "src/lib/dashboard/status-config.ts");
      expect(existsSync(path)).toBe(true);
    });

    it("src/lib/dashboard/metrics.ts exists", () => {
      const path = join(PROJECT_ROOT, "src/lib/dashboard/metrics.ts");
      expect(existsSync(path)).toBe(true);
    });
  });
});
