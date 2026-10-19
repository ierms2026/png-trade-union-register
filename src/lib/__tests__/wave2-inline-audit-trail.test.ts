import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================================
// Wave 2 / Item 2: Inline audit trail on the document-detail page.
//
// Audit finding: the audit log was only accessible from the global Audit
// view. To see what happened to a specific document (reviews, retention
// approvals, downloads), users had to navigate away, filter by entity type,
// and visually scan for the document ID. There was no inline view.
//
// Fix:
//   1. /api/audit now supports ?entityId=<id> to filter by entity ID
//      (alongside the existing ?entityType filter).
//   2. document-detail.tsx renders an InlineAuditTrail component (last 5
//      entries) below the version history, REGISTRAR+INSPECTOR only.
//   3. A "View full audit log →" link deep-links to the Audit view
//      filtered by entityType=Document.
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");
const AUDIT_API = resolve(SRC_ROOT, "src/app/api/audit/route.ts");
const DOC_DETAIL_VIEW = resolve(SRC_ROOT, "src/components/app/views/document-detail.tsx");
const PAGE_VIEW = resolve(SRC_ROOT, "src/app/page.tsx");

describe("Wave 2 / Item 2: inline audit trail", () => {
  const apiSrc = readFileSync(AUDIT_API, "utf-8");
  const viewSrc = readFileSync(DOC_DETAIL_VIEW, "utf-8");
  const pageSrc = readFileSync(PAGE_VIEW, "utf-8");

  it("API supports ?entityId filter", () => {
    expect(apiSrc).toMatch(/url\.searchParams\.get\("entityId"\)/);
    expect(apiSrc).toMatch(/if\s*\(entityId\)\s*where\.entityId\s*=\s*entityId/);
  });

  it("API docstring mentions entityId + the inline audit trail use case", () => {
    expect(apiSrc).toMatch(/entityId/);
    expect(apiSrc).toMatch(/document-detail inline audit trail/);
  });

  it("view defines an InlineAuditTrail component", () => {
    expect(viewSrc).toMatch(/function\s+InlineAuditTrail/);
  });

  it("InlineAuditTrail fetches /api/audit with entityType=Document + entityId + limit=5", () => {
    // The fetch URL must include all three params. entityType=Document
    // filters to document-related actions; entityId=<docId> filters to
    // THIS document; limit=5 keeps the section compact (per user choice).
    expect(viewSrc).toMatch(/\/api\/audit\?entityType=Document&entityId=\$\{encodeURIComponent\(documentId\)\}&limit=5/);
  });

  it("view only renders InlineAuditTrail for non-OFFICER users (REGISTRAR + INSPECTOR)", () => {
    // The audit API returns 403 for Officers. We hide the section entirely
    // rather than show an error card — matches the Union Hub History tab
    // pattern (hidden via isOfficer check on the parent).
    expect(viewSrc).toMatch(/user\.role\s*!==\s*"OFFICER"/);
    expect(viewSrc).toMatch(/<InlineAuditTrail\s+documentId=\{doc\.id\}\s*\/>/);
  });

  it("page.tsx passes user prop to DocumentDetailView (so the role guard works)", () => {
    expect(pageSrc).toMatch(/<DocumentDetailView[^>]*user=\{currentUser\}/);
  });

  it("DocumentDetailView accepts a user prop with a role field", () => {
    expect(viewSrc).toMatch(/user\?:\s*\{\s*role:\s*string\s*\}/);
  });

  it("InlineAuditTrail shows a 'View full audit log' deep-link to the Audit view", () => {
    // When there are more than 5 entries for this document, the inline
    // trail shows a link to the full Audit view filtered by entityType=Document.
    expect(viewSrc).toMatch(/View full audit log/);
    expect(viewSrc).toMatch(/view=audit&entityType=Document/);
  });

  it("InlineAuditTrail shows a friendly empty state when no entries exist", () => {
    // A brand-new document has no audit history yet. The empty state should
    // explain what will appear here (not just "no data").
    expect(viewSrc).toMatch(/No audit entries for this document yet/);
  });

  it("InlineAuditTrail shows a loading state (not a blank card)", () => {
    expect(viewSrc).toMatch(/Loading audit entries/);
  });

  it("InlineAuditTrail handles API errors gracefully (shows error text, no crash)", () => {
    expect(viewSrc).toMatch(/Error loading audit entries/);
  });

  it("audit action labels are human-readable (snake_case → past-tense English)", () => {
    // The audit API stores actions like "document_review_approve". The
    // inline trail converts these to "Document approved" via a lookup table.
    // Test that the lookup table exists + handles the common document actions.
    expect(viewSrc).toMatch(/formatAuditAction/);
    expect(viewSrc).toMatch(/document_review_approve:\s*"Document approved"/);
    expect(viewSrc).toMatch(/document_review_reject:\s*"Document rejected"/);
    // Unknown actions should fall back to a Title-Cased version of the
    // snake_case name (defensive — never show raw snake_case to users).
    expect(viewSrc).toMatch(/action\.replace\(\/_\/g,\s*"\s*"\)/);
  });
});
