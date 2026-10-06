import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComplianceStatusBadge } from "@/components/app/compliance-status-badge";
import { COMPLIANCE_STATUS_CONFIG, type ComplianceStatus } from "@/lib/dashboard/vocabulary";
import { COMPLIANCE_STATUSES } from "@/lib/dashboard/status-config";

// =============================================================================
// T52: Portal compliance status badge — renders the label from the single
// source (COMPLIANCE_STATUS_CONFIG), not the raw enum text.
//
// Before T52, the portal compliance view passed a ComplianceStatus to
// StatusBadge (which only knows union statuses). The fallback showed the
// raw enum text (e.g. "AWAITING_REVIEW") with deregistered styling.
//
// This test renders the new ComplianceStatusBadge for each of the 6
// statuses (using createElement + renderToStaticMarkup — no JSX so the
// .ts extension works with the existing vitest include pattern, and no
// @testing-library/react dependency needed) and asserts:
//   - the label equals COMPLIANCE_STATUS_CONFIG[status].label
//   - the raw enum text (e.g. "AWAITING_REVIEW") does NOT appear
//   - an SVG icon is rendered
// =============================================================================

describe("T52: ComplianceStatusBadge renders vocabulary labels", () => {
  for (const status of COMPLIANCE_STATUSES) {
    it(`renders "${COMPLIANCE_STATUS_CONFIG[status].label}" for ${status} (no raw enum text)`, () => {
      const html = renderToStaticMarkup(
        createElement(ComplianceStatusBadge, { status: status as ComplianceStatus }),
      );
      const expectedLabel = COMPLIANCE_STATUS_CONFIG[status].label;
      // The label text must appear in the rendered HTML
      expect(html).toContain(expectedLabel);
      // The raw enum text must NOT appear
      expect(html).not.toContain(status);
    });
  }

  it("renders an icon (svg) for every compliance status", () => {
    for (const status of COMPLIANCE_STATUSES) {
      const html = renderToStaticMarkup(
        createElement(ComplianceStatusBadge, { status: status as ComplianceStatus }),
      );
      // Each badge must render an SVG icon (lucide icons are <svg>)
      expect(html).toContain("<svg");
    }
  });
});
