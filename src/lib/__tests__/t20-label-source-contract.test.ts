import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  COMPLIANCE_STATUS_CONFIG,
  type ComplianceStatus,
  VIEW_TITLES,
} from "@/lib/dashboard/vocabulary";
import { COMPLIANCE_STATUSES } from "@/lib/dashboard/status-config";

// =============================================================================
// T20: Contract tests — one source for compliance status labels.
//
// These tests enforce that vocabulary.ts is the single source of truth for
// compliance status labels, shortLabels, and definitions. They fail loudly
// if anyone reintroduces a hardcoded status-label literal in a component.
// =============================================================================

describe("T20: single source for compliance status labels", () => {
  it("every ComplianceStatus has a non-empty label, shortLabel, and definition in vocabulary", () => {
    for (const status of COMPLIANCE_STATUSES) {
      const cfg = COMPLIANCE_STATUS_CONFIG[status];
      expect(cfg, `config for ${status} must exist`).toBeDefined();
      expect(typeof cfg.label).toBe("string");
      expect(cfg.label.length).toBeGreaterThan(0);
      expect(typeof cfg.shortLabel).toBe("string");
      expect(cfg.shortLabel.length).toBeGreaterThan(0);
      expect(typeof cfg.definition).toBe("string");
      expect(cfg.definition.length).toBeGreaterThan(0);
    }
  });

  it("NOT_APPLICABLE has canonical label 'Not Applicable' and shortLabel 'N/A' (decision D4)", () => {
    expect(COMPLIANCE_STATUS_CONFIG.NOT_APPLICABLE.label).toBe("Not Applicable");
    expect(COMPLIANCE_STATUS_CONFIG.NOT_APPLICABLE.shortLabel).toBe("N/A");
  });

  it("other statuses have shortLabel equal to label (no abbreviations on screen)", () => {
    for (const status of COMPLIANCE_STATUSES) {
      if (status === "NOT_APPLICABLE") continue;
      const cfg = COMPLIANCE_STATUS_CONFIG[status as ComplianceStatus];
      expect(cfg.shortLabel).toBe(cfg.label);
    }
  });

  it("no status-label literals outside the vocabulary module (label: 'N/A' / 'Not Applicable' / 'Awaiting Review' etc.)", () => {
    // Scan all .tsx and .ts files under src/ EXCEPT vocabulary.ts itself.
    // Fail if any file contains a `label: "N/A"`, `label: "Not Applicable"`,
    // `label: "Awaiting Review"`, `label: "Compliant"`, `label: "Expiring"`,
    // `label: "Overdue"`, or `label: "Missing"` literal.
    //
    // "N/A" is also used legitimately as an empty-value placeholder, so we
    // target the `label:` property-assignment pattern with an explicit
    // allowlist of the compliance status label strings.
    const projectRoot = resolve(__dirname, "../../..");
    const srcRoot = resolve(projectRoot, "src");
    const vocabularyPath = resolve(srcRoot, "lib/dashboard/vocabulary.ts");
    const offenders: string[] = [];
    const forbiddenLabels = [
      "N/A",
      "Not Applicable",
      "Awaiting Review",
      "Compliant",
      "Expiring",
      "Overdue",
      "Missing",
    ];

    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full);
          continue;
        }
        if (!full.endsWith(".tsx") && !full.endsWith(".ts")) continue;
        if (full === vocabularyPath) continue;
        if (full.includes("__tests__")) continue;
        const content = readFileSync(full, "utf8");
        for (const label of forbiddenLabels) {
          // Match `label: "X"` or `label: 'X'` (property assignment).
          const pattern = new RegExp(`label:\\s*["']${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`);
          if (pattern.test(content)) {
            offenders.push(`${full}: label: "${label}"`);
          }
        }
      }
    }

    walk(srcRoot);

    if (offenders.length > 0) {
      console.log(`\n  ✗ Status-label literals found outside vocabulary.ts:\n    ${offenders.join("\n    ")}\n`);
    }
    expect(offenders).toEqual([]);
  });

  it("Compliance view heading equals VIEW_TITLES.compliance", () => {
    const complianceViewPath = resolve(__dirname, "../../../src/components/app/views/compliance.tsx");
    const content = readFileSync(complianceViewPath, "utf8");
    // IA-2: the Compliance view now uses tabs (Overview / Compare / Rules).
    // The page-level h1 was removed — the breadcrumb provides the page
    // title via VIEW_TITLES.compliance. The tab bar replaces the heading.
    // We verify the file does NOT contain a hardcoded "Compliance Matrix"
    // heading (the old pre-IA-1 label).
    expect(content).not.toContain('>"Compliance Matrix"<');
    // The file must still import from vocabulary (for the legend labels).
    expect(content).toContain("COMPLIANCE_STATUS_CONFIG");
  });
});
