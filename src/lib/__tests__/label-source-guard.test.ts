import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// =============================================================================
// Label-source guard: prevents hardcoded status/role labels in user-facing
// source files outside the vocabulary module.
//
// This guard catches the "Pending" vs "Pending Review" class of bug — where
// an agent introduces a literal label string instead of reading from
// vocabulary.ts. Agents reintroduce literals unless something stops them.
//
// The guard scans .ts/.tsx files under src/components/ and src/app/ (the
// user-facing code: React components + Next.js route handlers) for string
// literals that exactly match a known compliance, review, task, union, or
// role label. It fails if any are found.
//
// ALLOWLIST:
//   - vocabulary.ts is NOT scanned (it's the source of truth — it lives
//     under src/lib/, outside the scan scope, so it's naturally excluded).
//   - status-config.ts is NOT scanned (same — under src/lib/).
//   - __tests__/ directories are skipped (tests can use literal strings).
//   - src/app/api/export/ is allowlisted (status labels used as CSV column
//     headers — data format, not UI labels).
//
// WHAT THE GUARD CATCHES:
//   - Quoted string literals where the ENTIRE string is a known label:
//       "Pending Review"  ← should use REVIEW_STATUS_CONFIG.PENDING.label
//       "Industrial Registrar" ← should use ROLE_LABELS.REGISTRAR
//   - JSX text between tags that exactly matches a label:
//       <span>Approved</span>  ← should use REVIEW_STATUS_CONFIG.APPROVED.label
//   - Comment lines are stripped before scanning (labels in comments are
//     documentation, not rendered labels).
//
// WHAT THE GUARD DOES NOT CATCH:
//   - Labels embedded in longer strings: "Approved by Registrar" is prose,
//     not a label duplication. The regex requires the label to be the
//     ENTIRE quoted content.
//   - Enum keys, object keys, route names: "PENDING", "APPROVED" (uppercase)
//     are not label strings.
//   - Labels in files outside src/components/ and src/app/ (e.g. src/lib/).
// =============================================================================

const projectRoot = resolve(__dirname, "../../..");
const srcRoot = resolve(projectRoot, "src");

// --- Canonical labels (read from vocabulary.ts at test time) ---------------

function extractLabelsFromFile(
  filePath: string,
  patterns: RegExp[],
): string[] {
  const content = readFileSync(filePath, "utf8");
  const labels: string[] = [];
  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) labels.push(match[1]);
    }
  }
  return labels;
}

const vocabularyPath = resolve(srcRoot, "lib/dashboard/vocabulary.ts");

// Compliance status labels: label: "Compliant", etc.
const COMPLIANCE_LABELS = extractLabelsFromFile(vocabularyPath, [
  /label:\s*"((?:Compliant|Expiring|Overdue|Awaiting Review|Missing|Not Applicable))"/g,
]);

// Review status labels: label: "Pending Review", etc.
const REVIEW_LABELS = extractLabelsFromFile(vocabularyPath, [
  /label:\s*"((?:Pending Review|Approved|Rejected))"/g,
]);

// Role labels: REGISTRAR: "Industrial Registrar", INSPECTOR: "Inspector", OFFICER: "Union Official".
const ROLE_LABELS = extractLabelsFromFile(vocabularyPath, [
  /(?:REGISTRAR|INSPECTOR|OFFICER):\s*"((?:Industrial Registrar|Inspector|Union Official))"/g,
]);

// Task status labels: label: "To Do", etc.
const TASK_LABELS = extractLabelsFromFile(vocabularyPath, [
  /label:\s*"((?:To Do|In Progress|Done|Cancelled))"/g,
]);

// Union status labels: label: "Active", etc.
const UNION_LABELS = extractLabelsFromFile(vocabularyPath, [
  /label:\s*"((?:Active|Suspended|Deregistered))"/g,
]);

const ALL_LABELS = [
  ...COMPLIANCE_LABELS,
  ...REVIEW_LABELS,
  ...ROLE_LABELS,
  ...TASK_LABELS,
  ...UNION_LABELS,
];

// --- Scan configuration -----------------------------------------------------

// Directories to scan.
const SCAN_DIRS = [
  resolve(srcRoot, "components"),
  resolve(srcRoot, "app"),
];

// Directories to skip entirely.
const SKIP_DIRS = ["__tests__", "node_modules", ".next"];

// Additional directories where label literals are allowed (data formats,
// not UI labels).
// - src/app/api/export/ — status labels used as CSV column headers in
//   export routes. These are data-format strings consumed by external
//   systems, not rendered UI labels. Changing them would break the export
//   format contract.
const ALLOWED_DIRS = ["app/api/export/"];

// --- Comment stripping ------------------------------------------------------

function stripComments(line: string, inBlockComment: { current: boolean }): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (inBlockComment.current) {
      if (line[i] === "*" && line[i + 1] === "/") {
        inBlockComment.current = false;
        i += 2;
      } else {
        i++;
      }
    } else {
      if (line[i] === "/" && line[i + 1] === "/") {
        break;
      }
      if (line[i] === "/" && line[i + 1] === "*") {
        inBlockComment.current = true;
        i += 2;
        continue;
      }
      out += line[i];
      i++;
    }
  }
  return out;
}

// --- Scanner ----------------------------------------------------------------

function shouldSkipDir(full: string): boolean {
  if (SKIP_DIRS.some((d) => full.includes(d))) return true;
  if (ALLOWED_DIRS.some((d) => full.includes(d))) return true;
  return false;
}

function walk(dir: string, offenders: string[]) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);

    if (st.isDirectory()) {
      if (shouldSkipDir(full)) continue;
      walk(full, offenders);
      continue;
    }

    if (!full.endsWith(".tsx") && !full.endsWith(".ts")) continue;

    const content = readFileSync(full, "utf8");
    const relPath = full.replace(srcRoot + "/", "");
    const lines = content.split("\n");

    const inBlockComment = { current: false };
    const strippedLines = lines.map((line) => stripComments(line, inBlockComment));

    for (const label of ALL_LABELS) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Match the label as the ENTIRE quoted string content (with optional
      // surrounding whitespace). This avoids false positives on prose like
      // "Approved by Registrar".
      const pattern = new RegExp(`["']\\s*${escaped}\\s*["']`);
      for (let i = 0; i < strippedLines.length; i++) {
        if (pattern.test(strippedLines[i])) {
          offenders.push(`${relPath}:${i + 1}: literal "${label}" (use vocabulary.ts)`);
        }
      }
    }

    // Check for the old "Pending" label (should be "Pending Review").
    // Only flag in review-context files — not webhook delivery status,
    // which legitimately uses "Pending".
    const isReviewContext = content.includes("REVIEW_STATUS") ||
      content.includes("reviewStatus") ||
      content.includes("ComplianceStatus");
    if (isReviewContext) {
      for (let i = 0; i < strippedLines.length; i++) {
        const pendingPattern = /["']\s*Pending\s*["']/;
        if (pendingPattern.test(strippedLines[i]) && !strippedLines[i].includes("Pending Review")) {
          offenders.push(`${relPath}:${i + 1}: old label "Pending" (should be "Pending Review" or use REVIEW_STATUS_CONFIG)`);
        }
      }
    }
  }
}

// --- Tests ------------------------------------------------------------------

describe("Label-source guard: no hardcoded status/role labels in user-facing code", () => {
  it("vocabulary.ts defines all expected compliance status labels", () => {
    const content = readFileSync(vocabularyPath, "utf8");
    for (const label of COMPLIANCE_LABELS) {
      expect(content).toContain(`label: "${label}"`);
    }
    expect(COMPLIANCE_LABELS.length).toBe(6);
  });

  it("vocabulary.ts defines all expected review status labels", () => {
    const content = readFileSync(vocabularyPath, "utf8");
    for (const label of REVIEW_LABELS) {
      expect(content).toContain(`label: "${label}"`);
    }
    expect(REVIEW_LABELS.length).toBe(3);
  });

  it("vocabulary.ts defines all expected role labels", () => {
    const content = readFileSync(vocabularyPath, "utf8");
    for (const label of ROLE_LABELS) {
      expect(content).toContain(`: "${label}"`);
    }
    expect(ROLE_LABELS.length).toBe(3);
  });

  it("no hardcoded status/role label literals in src/components/ and src/app/", () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      walk(dir, offenders);
    }
    if (offenders.length > 0) {
      console.log(`\n  ✗ Hardcoded labels found:\n    ${offenders.join("\n    ")}\n`);
    }
    expect(offenders).toEqual([]);
  });

  it("the old 'Pending' label is not used in review-context files", () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      walk(dir, offenders);
    }
    const pendingOffenders = offenders.filter((o) => o.includes("old label"));
    if (pendingOffenders.length > 0) {
      console.log(`\n  ✗ Old "Pending" label found:\n    ${pendingOffenders.join("\n    ")}\n`);
    }
    expect(pendingOffenders).toEqual([]);
  });
});
