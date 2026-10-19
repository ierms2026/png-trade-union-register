import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================================
// Wave 3 / Item 2: Document view audit log.
//
// Audit finding: the system had no record of who viewed a document. While
// downloads were logged (document_download audit action), simple VIEWS were
// not — making it impossible to investigate "who saw this document before
// it was leaked".
//
// Fix: the /api/documents/[id] GET handler now writes a `document_view`
// audit log entry on EVERY call. The entry captures:
//   - actorId + actorName: who viewed
//   - entityType=Document + entityId: which document
//   - action="document_view": standard action name
//   - afterJson: { documentType, unionId, unionName, viewMethod }
//   - viewMethod: "UI" (session auth) vs "API" (API key auth) — useful for
//     distinguishing human views from programmatic access
//
// NO PII BEYOND ACTOR IDENTITY: per the user's defaults selection, we do NOT
// log IP, user agent, or other request metadata. This avoids collecting PII
// that would need separate retention/privacy handling.
//
// BEST-EFFORT: audit log write failures don't fail the API request (the
// user still gets their document). The try/catch silently swallows errors —
// logging is a side effect, not the primary purpose of the endpoint.
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");
const DOC_DETAIL_API = resolve(SRC_ROOT, "src/app/api/documents/[id]/route.ts");
const DOC_DETAIL_VIEW = resolve(SRC_ROOT, "src/components/app/views/document-detail.tsx");

describe("Wave 3 / Item 2: document view audit log in the API", () => {
  const src = readFileSync(DOC_DETAIL_API, "utf-8");

  it("API writes an audit log entry on every GET call", () => {
    expect(src).toMatch(/db\.auditLog\.create/);
  });

  it("audit action is 'document_view'", () => {
    expect(src).toMatch(/action:\s*"document_view"/);
  });

  it("audit entityType is 'Document'", () => {
    expect(src).toMatch(/entityType:\s*"Document"/);
  });

  it("audit entityId is the document ID being viewed", () => {
    expect(src).toMatch(/entityId:\s*id/);
  });

  it("audit severity is INFO (not WARNING/CRITICAL — views are benign)", () => {
    expect(src).toMatch(/severity:\s*Severity\.INFO/);
  });

  it("audit entry captures viewMethod (UI vs API) in afterJson", () => {
    // viewMethod lets the audit trail distinguish human views (session auth)
    // from programmatic access (API key auth).
    expect(src).toMatch(/viewMethod/);
    expect(src).toMatch(/user\.scopes\s*!==\s*null\s*\?\s*"API"\s*:\s*"UI"/);
  });

  it("audit entry captures documentType + unionId + unionName in afterJson", () => {
    // Context for the audit entry — useful for filtering the audit log by
    // document type or union without joining back to the Document table.
    expect(src).toMatch(/documentType:\s*doc\.documentType/);
    expect(src).toMatch(/unionId:\s*doc\.union\.id/);
    expect(src).toMatch(/unionName:\s*doc\.union\.unionName/);
  });

  it("does NOT log IP address (no PII collection per the user's defaults)", () => {
    // The audit entry must NOT include IP, user agent, or other request
    // metadata. This avoids collecting PII that would need separate
    // retention/privacy handling.
    expect(src).not.toMatch(/req\.headers\.get\(["']x-forwarded-for["']\)/);
    expect(src).not.toMatch(/user-agent/i);
    // The auditLog.create call itself should not reference IP/user-agent.
    const auditBlockMatch = src.match(/db\.auditLog\.create\(\{[\s\S]*?\}\)\s*;/);
    expect(auditBlockMatch, "auditLog.create call must exist").not.toBeNull();
    const auditBlock = auditBlockMatch![0];
    expect(auditBlock).not.toMatch(/ip/i);
    expect(auditBlock).not.toMatch(/userAgent/i);
  });

  it("audit write is best-effort (failures don't fail the API request)", () => {
    // The audit log write is wrapped in try/catch. If it fails (DB issue,
    // connection error, etc.), the user still gets their document. We
    // deliberately don't log to console because that could leak the
    // document ID to server logs.
    expect(src).toMatch(/try\s*\{[\s\S]*?db\.auditLog\.create/);
    expect(src).toMatch(/\}\s*catch\s*\{/);
  });

  it("imports Severity from @prisma/client (used for the audit log entry)", () => {
    expect(src).toMatch(/import\s+\{\s*Role,\s*Severity\s*\}\s+from\s+["']@prisma\/client["']/);
  });
});

describe("Wave 3 / Item 2: document-detail view — formatAuditAction handles document_view", () => {
  const src = readFileSync(DOC_DETAIL_VIEW, "utf-8");

  it("formatAuditAction maps 'document_view' to 'Document viewed'", () => {
    // The inline audit trail on the document-detail page uses
    // formatAuditAction to convert snake_case actions to human-readable
    // labels. The new 'document_view' action must be in the lookup table.
    expect(src).toMatch(/document_view:\s*"Document viewed"/);
  });

  it("formatAuditAction has a fallback for unknown actions (defensive)", () => {
    // Unknown actions should never be shown as raw snake_case to users.
    // The fallback Title-Cases the snake_case name.
    expect(src).toMatch(/action\.replace\(\/_\/g,\s*"\s*"\)/);
  });
});

describe("Wave 3 / Item 2: view audit log appears in the inline audit trail", () => {
  // The inline audit trail (Wave 2 / Item 2) fetches /api/audit?entityType=Document&entityId=<id>
  // Since the view audit entries are written with that exact entityType + entityId,
  // they will automatically appear in the inline trail. No additional wiring needed.

  const src = readFileSync(DOC_DETAIL_VIEW, "utf-8");

  it("inline audit trail fetches with entityType=Document + entityId (matches the view audit log shape)", () => {
    expect(src).toMatch(/\/api\/audit\?entityType=Document&entityId=\$\{encodeURIComponent\(documentId\)\}&limit=5/);
  });

  it("inline audit trail shows up to 5 entries (view audits will be interspersed with other document actions)", () => {
    // The inline trail shows the LAST 5 entries — view audits will appear
    // alongside review approvals, rejections, etc. This is intentional:
    // the user wants to see "what happened to this document recently",
    // and views are part of that history.
    expect(src).toMatch(/limit=5/);
  });
});
