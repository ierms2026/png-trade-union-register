import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./setup";
import { buildComplianceReportHtml } from "../compliance/report-html";

// =============================================================================
// Step 6 (polish): PDF metadata test.
//
// Verifies that the compliance report HTML has:
//   1. A <title> tag (becomes the PDF /Title metadata)
//   2. <meta name="author"> set to the organization (NOT the user's email)
//   3. <meta name="generator"> set to the system name
//   4. The user's email (preparedBy) does NOT appear in the <head> — it
//      appears only in the visible cover page content (which is intentional
//      for audit, but must not leak to PDF metadata)
//
// WeasyPrint reads these HTML head elements and writes them to the PDF
// /Title, /Author, /Creator metadata fields. This test ensures no
// personal info (staff email) leaks into the PDF metadata when the
// report is shared externally.
// =============================================================================

describe("Step 6: PDF metadata (title, no author leakage)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("HTML head has a <title> tag with the report name + scope + date", async () => {
    const result = await buildComplianceReportHtml({
      unionId: null,
      preparedBy: "registrar@example.com",
    });
    // The <title> should contain "Compliance Report" + the scope + the date
    expect(result.html).toMatch(/<title>[^<]*Compliance Report[^<]*<\/title>/);
    // Should contain the scope text
    expect(result.html).toMatch(/<title>[^<]*All Registered Unions[^<]*<\/title>/);
    // Should contain a date (YYYY-MM-DD)
    expect(result.html).toMatch(/<title>[^<]*\d{4}-\d{2}-\d{2}[^<]*<\/title>/);
  });

  it("HTML head has <meta name=\"author\"> set to the organization, not the user email", async () => {
    const result = await buildComplianceReportHtml({
      unionId: null,
      preparedBy: "registrar@example.com",
    });
    // Should have the org-level author
    expect(result.html).toMatch(
      /<meta\s+name="author"\s+content="Office of The Industrial Registrar">/,
    );
  });

  it("HTML head has <meta name=\"generator\"> set to the system name", async () => {
    const result = await buildComplianceReportHtml({
      unionId: null,
      preparedBy: "registrar@example.com",
    });
    expect(result.html).toMatch(
      /<meta\s+name="generator"\s+content="Register of Trade Unions \(PNG\)">/,
    );
  });

  it("the preparedBy email does NOT appear in the <head> (no metadata leakage)", async () => {
    const userEmail = "registrar@example.com";
    const result = await buildComplianceReportHtml({
      unionId: null,
      preparedBy: userEmail,
    });
    // Extract the <head>...</head> section
    const headMatch = result.html.match(/<head>([\s\S]*?)<\/head>/);
    expect(headMatch, "HTML must have a <head> section").not.toBeNull();
    const head = headMatch![1];
    // The user's email must NOT appear anywhere in the head
    expect(head).not.toContain(userEmail);
  });

  it("the preparedBy email DOES appear in the visible cover page (audit trail)", async () => {
    const userEmail = "registrar@example.com";
    const result = await buildComplianceReportHtml({
      unionId: null,
      preparedBy: userEmail,
    });
    // Extract the <body>...</body> section (the visible content)
    const bodyMatch = result.html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    expect(bodyMatch, "HTML must have a <body> section").not.toBeNull();
    const body = bodyMatch![1];
    // The user's email SHOULD appear in the visible cover page (audit trail)
    expect(body).toContain(userEmail);
  });
});
