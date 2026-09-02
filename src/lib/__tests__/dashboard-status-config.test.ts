import { describe, it, expect } from "vitest";
import {
  STATUS_CONFIG,
  COMPLIANCE_STATUSES,
  APPLICABLE_STATUSES,
  EXPIRING_WINDOW_DAYS,
  NEVER_RENEW_YEARS,
  getStatusConfig,
  getStatusLabel,
  getStatusColorToken,
  getStatusIcon,
  getStatusDefinition,
  isApplicableStatus,
  getTileStatuses,
  type ComplianceStatus,
} from "../dashboard/status-config";

describe("status-config", () => {
  describe("STATUS_CONFIG", () => {
    it("has an entry for every ComplianceStatus", () => {
      for (const status of COMPLIANCE_STATUSES) {
        expect(STATUS_CONFIG[status]).toBeDefined();
      }
    });

    it("each entry has label, colorToken, icon, and definition", () => {
      for (const status of COMPLIANCE_STATUSES) {
        const config = STATUS_CONFIG[status];
        expect(config.label).toBeTruthy();
        expect(config.label.length).toBeGreaterThan(0);
        expect(config.colorToken).toBeTruthy();
        expect(config.colorToken).toMatch(/^var\(--status-/);
        expect(config.icon).toBeDefined();
        expect(config.definition).toBeTruthy();
        expect(config.definition.length).toBeGreaterThan(10);
      }
    });

    it("uses CSS variable tokens, not hardcoded hex codes", () => {
      for (const status of COMPLIANCE_STATUSES) {
        const token = STATUS_CONFIG[status].colorToken;
        expect(token).not.toMatch(/^#[0-9a-fA-F]/);
        expect(token).toMatch(/^var\(/);
      }
    });

    it("has no duplicate labels across statuses", () => {
      const labels = COMPLIANCE_STATUSES.map((s) => STATUS_CONFIG[s].label);
      const unique = new Set(labels);
      expect(unique.size).toBe(labels.length);
    });

    it("has no duplicate color tokens across statuses", () => {
      const tokens = COMPLIANCE_STATUSES.map(
        (s) => STATUS_CONFIG[s].colorToken,
      );
      const unique = new Set(tokens);
      expect(unique.size).toBe(tokens.length);
    });
  });

  describe("EXPIRING_WINDOW_DAYS", () => {
    it("is a positive integer", () => {
      expect(EXPIRING_WINDOW_DAYS).toBeGreaterThan(0);
      expect(Number.isInteger(EXPIRING_WINDOW_DAYS)).toBe(true);
    });

    it("matches the audit value of 90", () => {
      expect(EXPIRING_WINDOW_DAYS).toBe(90);
    });
  });

  describe("NEVER_RENEW_YEARS", () => {
    it("is a positive integer > 50 (sentinel for permanent)", () => {
      expect(NEVER_RENEW_YEARS).toBeGreaterThan(50);
      expect(Number.isInteger(NEVER_RENEW_YEARS)).toBe(true);
    });
  });

  describe("APPLICABLE_STATUSES", () => {
    it("excludes NOT_APPLICABLE", () => {
      expect(APPLICABLE_STATUSES).not.toContain("NOT_APPLICABLE");
    });

    it("includes the 4 tile statuses", () => {
      expect(APPLICABLE_STATUSES).toContain("COMPLIANT");
      expect(APPLICABLE_STATUSES).toContain("EXPIRING");
      expect(APPLICABLE_STATUSES).toContain("OVERDUE");
      expect(APPLICABLE_STATUSES).toContain("MISSING");
    });
  });

  describe("selector helpers", () => {
    it("getStatusConfig returns the right entry", () => {
      const config = getStatusConfig("OVERDUE");
      expect(config.label).toBe("Overdue");
      expect(config.colorToken).toBe("var(--status-overdue)");
    });

    it("getStatusLabel returns the label string", () => {
      expect(getStatusLabel("COMPLIANT")).toBe("Compliant");
      expect(getStatusLabel("MISSING")).toBe("Missing");
    });

    it("getStatusColorToken returns the CSS variable", () => {
      expect(getStatusColorToken("COMPLIANT")).toBe("var(--status-compliant)");
    });

    it("getStatusIcon returns a component", () => {
      const icon = getStatusIcon("COMPLIANT");
      expect(icon).toBeDefined();
      expect(typeof icon).toBe("object" /* LucideIcon is a forwardRef component */);
    });

    it("getStatusDefinition returns a non-empty string", () => {
      const def = getStatusDefinition("EXPIRING");
      expect(def).toContain("90");
      expect(def.length).toBeGreaterThan(10);
    });

    it("isApplicableStatus returns true for COMPLIANT, false for NOT_APPLICABLE", () => {
      expect(isApplicableStatus("COMPLIANT")).toBe(true);
      expect(isApplicableStatus("NOT_APPLICABLE")).toBe(false);
    });

    it("getTileStatuses returns the 4 applicable statuses", () => {
      const tiles = getTileStatuses();
      expect(tiles).toHaveLength(4);
      expect(tiles).not.toContain("NOT_APPLICABLE");
    });
  });

  describe("definition accuracy (per chunk 0.1 audit)", () => {
    it("MISSING definition mentions PENDING/REJECTED review", () => {
      const def = STATUS_CONFIG.MISSING.definition;
      expect(def.toLowerCase()).toContain("pending");
      expect(def.toLowerCase()).toContain("rejected");
    });

    it("NOT_APPLICABLE definition mentions rule.required", () => {
      const def = STATUS_CONFIG.NOT_APPLICABLE.definition;
      expect(def).toContain("rule.required");
    });

    it("EXPIRING definition references the 90-day window", () => {
      const def = STATUS_CONFIG.EXPIRING.definition;
      expect(def).toContain(String(EXPIRING_WINDOW_DAYS));
    });
  });
});
