import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================================
// Wave 2 / Item 1: Document compliance card on the document-detail page.
//
// Audit finding: the document-detail page showed the document header, union
// info, and version history — but NOT the live compliance status. Users had
// to mentally cross-reference with the compliance matrix to know whether
// this specific document was Compliant / Expiring / Overdue / etc.
//
// Fix: the /api/documents/[id] endpoint now returns a `compliance` object
// with `status`, `expiresAt`, and `renewalYears`. The document-detail view
// renders a DocumentComplianceCard above the version history using the same
// STATUS_VISUAL tokens + COMPLIANCE_STATUS_CONFIG labels as the matrix.
//
// These contract tests guard the contract:
//   - The API computes status via the shared calculator (no second copy).
//   - The API returns the `compliance` field.
//   - The view renders the card with status icon + label + expiry details.
//   - The card uses COMPLIANCE_STATUS_CONFIG for labels (T20 single source).
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");
const DOC_DETAIL_API = resolve(SRC_ROOT, "src/app/api/documents/[id]/route.ts");
const DOC_DETAIL_VIEW = resolve(SRC_ROOT, "src/components/app/views/document-detail.tsx");

describe("Wave 2 / Item 1: document compliance card", () => {
  const apiSrc = readFileSync(DOC_DETAIL_API, "utf-8");
  const viewSrc = readFileSync(DOC_DETAIL_VIEW, "utf-8");

  it("API imports the shared calculator (no second copy of status logic)", () => {
    expect(apiSrc).toMatch(/from\s+["']@\/lib\/compliance\/calculator["']/);
    expect(apiSrc).toMatch(/calculateStatus/);
    expect(apiSrc).toMatch(/computeExpiryDateFromApproval/);
  });

  it("API looks up the ComplianceRule for the document's type", () => {
    expect(apiSrc).toMatch(/db\.complianceRule\.findUnique/);
    expect(apiSrc).toMatch(/where:\s*\{\s*documentType:\s*doc\.documentType\s*\}/);
  });

  it("API returns a compliance object in the response", () => {
    expect(apiSrc).toMatch(/compliance:\s*\{/);
    expect(apiSrc).toMatch(/status:\s*complianceStatus/);
    expect(apiSrc).toMatch(/expiresAt:\s*complianceExpiresAt/);
    expect(apiSrc).toMatch(/renewalYears:\s*rule\?\.renewalYears\s*\?\?\s*null/);
  });

  it("API excludes expiry for MISSING / NOT_APPLICABLE / AWAITING_REVIEW (matches matrix)", () => {
    // This is the same exclusion logic as matrix.ts. We test it's present so
    // a future refactor doesn't accidentally start returning expiry dates
    // for non-active filings (which would mislead the UI).
    expect(apiSrc).toMatch(/NOT_APPLICABLE/);
    expect(apiSrc).toMatch(/MISSING/);
    expect(apiSrc).toMatch(/AWAITING_REVIEW/);
  });

  it("view imports COMPLIANCE_STATUS_CONFIG + getComplianceStatusLabel (single source)", () => {
    expect(viewSrc).toMatch(/import.*COMPLIANCE_STATUS_CONFIG.*from.*vocabulary/);
    expect(viewSrc).toMatch(/import.*getComplianceStatusLabel.*from.*vocabulary/);
  });

  it("view defines a DocumentComplianceCard component", () => {
    expect(viewSrc).toMatch(/function\s+DocumentComplianceCard/);
  });

  it("view renders the compliance card above the version history (per user choice)", () => {
    // Find the position of the compliance card render vs the version history.
    const cardIdx = viewSrc.indexOf("DocumentComplianceCard");
    const versionIdx = viewSrc.indexOf("Version History");
    expect(cardIdx, "DocumentComplianceCard must be referenced").toBeGreaterThan(-1);
    expect(versionIdx, "Version History must be referenced").toBeGreaterThan(-1);
    expect(cardIdx, "compliance card must render BEFORE version history").toBeLessThan(versionIdx);
  });

  it("view only renders the compliance card when doc.compliance is present (defensive)", () => {
    // Defensive: if the API doesn't return compliance (old cached response,
    // future API refactor), the card should not crash. The {doc.compliance && ...}
    // guard ensures this.
    expect(viewSrc).toMatch(/\{doc\.compliance\s*&&\s*\(\s*<DocumentComplianceCard/);
  });

  it("compliance card uses COMPLIANCE_STATUS_CONFIG[status].icon for the status icon", () => {
    // Single source of truth for icons — same icons as the compliance matrix
    // cells (CheckCircle2 / AlertTriangle / XCircle / Clock / FileQuestion / Ban).
    expect(viewSrc).toMatch(/COMPLIANCE_STATUS_CONFIG\[status\]/);
    expect(viewSrc).toMatch(/const\s+Icon\s*=\s*cfg\.icon/);
    expect(viewSrc).toMatch(/<Icon/);
  });

  it("compliance card uses getComplianceStatusLabel for the status label (T20 contract)", () => {
    expect(viewSrc).toMatch(/getComplianceStatusLabel\(status\)/);
    // No hardcoded status label literals in the card.
    const cardBlockMatch = viewSrc.match(/function\s+DocumentComplianceCard[\s\S]*?\n\}/);
    expect(cardBlockMatch, "DocumentComplianceCard function must exist").not.toBeNull();
    const cardBlock = cardBlockMatch![0];
    for (const forbidden of ["Compliant", "Expiring", "Overdue", "Awaiting Review", "Missing", "Not Applicable"]) {
      // Allow in comments, but not as JSX text or attribute values.
      expect(cardBlock).not.toMatch(new RegExp(`>${forbidden}<`));
    }
  });

  it("compliance card shows days-until-expiry with color-coded urgency (red/amber/neutral)", () => {
    // The card shows "X days remaining" or "X days overdue" with red text
    // for overdue, amber for <=90 days, muted for >90 days. This matches
    // the matrix's EXPIRING threshold (90 days).
    expect(viewSrc).toMatch(/daysUntilExpiry/);
    expect(viewSrc).toMatch(/daysUntilExpiry\s*<\s*0/);
    expect(viewSrc).toMatch(/daysUntilExpiry\s*<=\s*90/);
  });
});
