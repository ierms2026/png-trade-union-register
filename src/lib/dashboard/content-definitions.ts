// =============================================================================
// Content Definitions — the runtime mirror of docs/CONTENT.md.
//
// Every domain term shown in the UI that has a "?" popover next to it
// MUST have an entry here. The test in
// src/lib/__tests__/content-definitions.test.ts enforces:
//   1. Every `termKey` referenced via <DefinitionPopover termKey="..." />
//      in src/ has an entry here.
//   2. Every entry has a non-empty `title` and `body`.
//   3. The set of keys here matches the set of headings in docs/CONTENT.md
//      (drift alarm — if you add a key here, also add a section in
//      CONTENT.md, and vice versa).
//
// WHY A RUNTIME MIRROR:
//   CONTENT.md is human-readable documentation. The UI cannot read Markdown
//   at runtime (we don't ship a Markdown parser to the browser). This file
//   is the typed, runtime-accessible version of the same content. The two
//   must stay in sync — the test makes drift loud.
//
// READING LEVEL: plain language a union officer can follow. Avoid jargon.
//   - "registrar" not "the system administrator"
//   - "file a new document" not "submit a new artifact"
//   - "the union has done their part" not "the union-side obligation is
//      discharged"
//
// LENGTH: each body is 1-4 sentences. The popover is a quick help bubble,
// not a manual. If a definition needs more than 4 sentences, link to the
// Help & Guide view (or CONTENT.md) for the long version.
// =============================================================================

export interface ContentDefinition {
  /** Short title shown at the top of the popover (e.g. "Compliant"). */
  title: string;
  /** 1-4 sentence plain-language definition. */
  body: string;
}

// -----------------------------------------------------------------------------
// Keys — the canonical set. Adding a key here REQUIRES:
//   1. Adding a matching section in docs/CONTENT.md
//   2. Using the key in at least one <DefinitionPopover termKey="..." />
//   3. Adding the key to CONTENT_DEFINITION_KEYS below (it's auto-derived,
//      but the test asserts the derivation matches the object keys — so
//      adding a key here without using it in the UI is allowed but the
//      test will note it as an unused key)
// -----------------------------------------------------------------------------

export const CONTENT_DEFINITIONS = {
  // --- Compliance statuses (the 6 colors on the matrix) ---
  "compliance-status.compliant": {
    title: "Compliant",
    body:
      "The document is filed, has been approved by the Registrar, and its renewal date is more than 90 days away. " +
      "This is the only status that counts toward the compliance rate.",
  },
  "compliance-status.expiring": {
    title: "Expiring",
    body:
      "The document is filed and approved, but its renewal date is within the next 90 days. " +
      "The union should start preparing a renewal now so it does not slip into Overdue.",
  },
  "compliance-status.overdue": {
    title: "Overdue",
    body:
      "The document is filed and approved, but its renewal date has already passed. " +
      "The union is out of compliance for this document type and should file a renewal immediately.",
  },
  "compliance-status.awaiting-review": {
    title: "Awaiting Review",
    body:
      "The document has been uploaded by the union, but the Registrar has not yet approved it. " +
      "This is NOT a gap in compliance — the union has done their part. " +
      "The document is on the Registrar's desk. It does not count toward the compliance rate until approved.",
  },
  "compliance-status.missing": {
    title: "Missing",
    body:
      "No document has been filed for this type, or a previously-filed document was disposed under retention rules. " +
      "The union needs to file a new document.",
  },
  "compliance-status.not-applicable": {
    title: "Not Applicable",
    body: "This document type is not required for this union. No action is needed.",
  },

  // --- Review statuses (the Registrar's review of an uploaded document) ---
  "review-status.pending": {
    title: "Pending Review",
    body:
      "The document has been uploaded by a union representative or officer, but the Registrar has not yet approved it. " +
      "A document in this state does NOT count toward compliance — it must be approved first.",
  },
  "review-status.approved": {
    title: "Approved",
    body:
      "The document has been reviewed and approved by the Registrar. " +
      "Only approved documents count toward compliance.",
  },
  "review-status.rejected": {
    title: "Rejected",
    body:
      "The document was reviewed by the Registrar and rejected. " +
      "The union should upload a corrected version. A rejected document does NOT count toward compliance.",
  },

  // --- Union statuses (the badge on each union record) ---
  "union-status.active": {
    title: "Active",
    body:
      "The union is currently registered and operating. " +
      "It has met the requirements of the Industrial Organizations Act and its registration is in good standing.",
  },
  "union-status.suspended": {
    title: "Suspended",
    body:
      "The union's registration has been temporarily suspended by the Registrar. " +
      "A suspended union cannot operate as a registered trade union, BUT the suspension may be lifted once the issues are resolved. " +
      "Think of this as 'on pause' — the union is still on the register, just not allowed to act as a union right now.",
  },
  "union-status.deregistered": {
    title: "Deregistered",
    body:
      "The union's registration has been cancelled by the Registrar. " +
      "A deregistered union is no longer recognised as a trade union under the Industrial Organizations Act. " +
      "The record is kept on the register for historical reference. " +
      "This is permanent — unlike Suspended, there is no 'lift' action.",
  },

  // --- Roles ---
  "role.registrar": {
    title: "Industrial Registrar",
    body:
      "The system administrator. The Registrar can do everything: register and deregister unions, " +
      "approve or reject documents, configure compliance rules, manage users, place and lift legal holds, and approve disposals.",
  },
  "role.inspector": {
    title: "Inspector",
    body:
      "An oversight role. The Inspector can view everything the Registrar can see (unions, documents, compliance, audit log) " +
      "but CANNOT make changes — they cannot approve documents, configure rules, manage users, or dispose of records. " +
      "The Inspector is for auditors and reviewers.",
  },
  "role.officer": {
    title: "Union Official",
    body:
      "A union-scoped staff user. An Officer is assigned to ONE specific union and can only see data for that union. " +
      "They can file documents for their union and view their union's compliance status. " +
      "They cannot see other unions' data, manage users, or configure rules.",
  },

  // --- Tasks ---
  "task-status.pending": {
    title: "To Do",
    body:
      "The task has been created but not yet started. " +
      "This is the default state for new tasks.",
  },
  "task-status.in-progress": {
    title: "In Progress",
    body: "The task is actively being worked on by the assignee.",
  },
  "task-status.completed": {
    title: "Done",
    body:
      "The task has been finished. " +
      "Completed tasks stay on the list for audit history.",
  },
  "task-status.cancelled": {
    title: "Cancelled",
    body:
      "The task has been cancelled and is no longer being worked on. " +
      "The task stays on the list for audit history — it is not deleted.",
  },

  // --- Contact updates ---
  "contact-update.pending": {
    title: "Pending",
    body:
      "The union has submitted a contact update request. " +
      "The Registrar has not yet approved it.",
  },
  "contact-update.approved": {
    title: "Approved",
    body:
      "The Registrar has approved the request. " +
      "The union's contact details have been updated.",
  },
  "contact-update.rejected": {
    title: "Rejected",
    body:
      "The Registrar has rejected the request. " +
      "The union's contact details are unchanged. The union can submit a new request.",
  },

  // --- Retention + Disposal ---
  "retention.retention-years": {
    title: "Retention Years",
    body:
      "The number of years a document of a given type must be kept after it is superseded or expired. " +
      "The default is 7 years for most document types. " +
      "A document does NOT go to the Retention Queue the moment it expires — it goes there once its retention period has also elapsed.",
  },
  "retention.queue": {
    title: "Retention & Disposal",
    body:
      "The staff view that lists documents that have reached the end of their retention period and are ready for disposal. " +
      "The Registrar must approve each disposal before it happens.",
  },
  "disposition.request": {
    title: "Disposition Request",
    body:
      "A formal request to dispose of a document. Created from the Retention Queue. " +
      "Goes through a mandatory cooldown period before it can be executed.",
  },
  "disposition.cooldown": {
    title: "Cooldown",
    body:
      "A mandatory waiting period between requesting a disposal and executing it. " +
      "This gives interested parties a chance to object. The cooldown length is configured per system.",
  },
  "disposition.certificate": {
    title: "Certificate of Disposal",
    body:
      "A JSON certificate generated when a disposal is executed. " +
      "It records what was disposed, when, by whom, and why — for audit history.",
  },
  "disposition-status.scheduled": {
    title: "Scheduled",
    body:
      "The disposal has been requested and is in its cooldown. " +
      "It cannot be executed yet.",
  },
  "disposition-status.cancelled": {
    title: "Cancelled",
    body:
      "The disposal was cancelled (e.g. a legal hold was placed, or the Registrar changed their mind). " +
      "The document stays on the register.",
  },
  "disposition-status.executed": {
    title: "Executed",
    body:
      "The disposal has been carried out. " +
      "The document is no longer on the active register; the certificate of disposal is kept for audit.",
  },
  "disposition-status.blocked": {
    title: "Blocked",
    body:
      "The disposal cannot proceed (e.g. a legal hold is in place, or the document is needed for an open review).",
  },

  // --- Legal hold ---
  "legal-hold.place": {
    title: "Place a Hold",
    body:
      "Flag the document as frozen. " +
      "No disposition request can be executed while the hold is in place. " +
      "Used when a document is relevant to an active investigation, court case, or complaint.",
  },
  "legal-hold.lift": {
    title: "Lift a Hold",
    body:
      "Remove the legal-hold flag. " +
      "The document can then be disposed normally (subject to its retention period).",
  },

  // --- Webhooks ---
  "webhook-delivery.pending": {
    title: "Pending",
    body: "The webhook delivery has been queued but not yet sent.",
  },
  "webhook-delivery.delivered": {
    title: "Delivered",
    body:
      "The webhook was sent and the receiving system responded with a success status (2xx).",
  },
  "webhook-delivery.failed": {
    title: "Failed",
    body:
      "The webhook was sent but the receiving system responded with an error, or did not respond at all. " +
      "Failed deliveries are retried automatically.",
  },

  // --- Audit log ---
  "audit.severity": {
    title: "Severity",
    body:
      "How urgent an audit-log entry is. INFO = a normal event (e.g. a document was filed). " +
      "WARNING = something that may need attention (e.g. a document is expiring soon). " +
      "CRITICAL = something that needs immediate attention (e.g. a union was deregistered, a legal hold was lifted).",
  },

  // --- Compliance rate ---
  "compliance-rate": {
    title: "Compliance Rate",
    body:
      "The percentage of required document slots that are Compliant. " +
      "Not Applicable slots are excluded. Awaiting Review is in the denominator but not the numerator — " +
      "the document does not count as compliant until the Registrar approves it. " +
      "If the denominator is zero (no required documents), the rate is 0%, not 100%.",
  },

  // --- Document type categories (IA-3) ---
  "document-category.registration": {
    title: "Registration",
    body:
      "Founding documents that establish the union's legal existence. " +
      "Permanent — rarely re-filed after initial registration. " +
      "Includes: Application for Registration, Registration Certificate, Constitution.",
  },
  "document-category.annual-filings": {
    title: "Annual Filings",
    body:
      "Documents filed on a yearly cycle. Must be renewed each year to stay compliant. " +
      "Includes: Financial Return, Financial Membership List, Affiliations, Welfare Fund.",
  },
  "document-category.governance": {
    title: "Governance",
    body:
      "Documents about the union's leadership, elections, and internal governance. Renewed every 3 years. " +
      "Includes: Election of Office Bearers, Secret Ballots, General Secretary Appointments.",
  },
  "document-category.oversight": {
    title: "Oversight",
    body:
      "Documents produced by the Industrial Registrar's office during oversight of the union. Renewed annually. " +
      "Includes: Inspection Reports, Awards, General Matters.",
  },

  // --- Document types (the kinds of records a union must file) ---
  // IA-3: all 13 types now have entries. DRAFT wording — needs Industrial
  // Registrar review. Based on seed data + code behavior, not legislation.
  "document-type.application-for-registration": {
    title: "Application for Registration",
    body:
      "The union's original application to be registered. Filed once (renewal period = 99 years, treated as permanent). " +
      "DRAFT: needs Industrial Registrar review.",
  },
  "document-type.registration-certificate": {
    title: "Registration Certificate",
    body:
      "The official certificate issued by the Industrial Registrar when the union was first registered. " +
      "Permanent (renewal period = 99 years). " +
      "DRAFT: needs Industrial Registrar review.",
  },
  "document-type.constitution": {
    title: "Constitution",
    body:
      "The union's governing rules. Sets out how the union is run, how office bearers are elected, and how decisions are made. " +
      "Permanent (renewal period = 99 years). A new version is filed if the constitution is amended. " +
      "DRAFT: needs Industrial Registrar review.",
  },
  "document-type.financial-return": {
    title: "Financial Return",
    body:
      "The union's annual financial return. Shows income, expenses, assets, and liabilities. " +
      "Renewed annually (1 year). " +
      "DRAFT: needs Industrial Registrar review.",
  },
  "document-type.financial-membership-list": {
    title: "Financial Membership List",
    body:
      "The current list of financial members of the union. " +
      "Renewed annually (1 year). " +
      "DRAFT: needs Industrial Registrar review.",
  },
  "document-type.affiliations": {
    title: "Affiliations",
    body:
      "Records of the union's affiliations with other bodies (e.g. a national trade union congress). " +
      "Renewed annually (1 year). " +
      "DRAFT: needs Industrial Registrar review.",
  },
  "document-type.welfare-fund": {
    title: "Welfare Fund",
    body:
      "Records of the union's welfare fund (a fund that provides benefits to members in need). " +
      "Renewed annually (1 year). " +
      "DRAFT: needs Industrial Registrar review.",
  },
  "document-type.election-of-office-bearers": {
    title: "Election of Office Bearers",
    body:
      "The record of the most recent election of the union's office bearers (president, secretary, treasurer, etc.). " +
      "Renewed every 3 years. " +
      "DRAFT: needs Industrial Registrar review.",
  },
  "document-type.secret-ballots": {
    title: "Secret Ballots",
    body:
      "Records of secret ballots conducted by the union (e.g. for elections or major decisions). " +
      "Renewed every 3 years. " +
      "DRAFT: needs Industrial Registrar review.",
  },
  "document-type.general-secretary-appointments": {
    title: "General Secretary Appointments",
    body:
      "Records of the appointment of the union's General Secretary. " +
      "Renewed every 3 years. " +
      "DRAFT: needs Industrial Registrar review.",
  },
  "document-type.inspection-reports": {
    title: "Inspection Reports",
    body:
      "Reports produced by the Industrial Registrar after inspecting the union's records, finances, or operations. " +
      "The union does not produce this document. Renewed annually (1 year). " +
      "DRAFT: needs Industrial Registrar review.",
  },
  "document-type.awards": {
    title: "Awards",
    body:
      "Any industrial awards or agreements the union is a party to. " +
      "Renewed every 3 years. " +
      "DRAFT: needs Industrial Registrar review.",
  },
  "document-type.general-matters": {
    title: "General Matters",
    body:
      "General correspondence or matters between the union and the Industrial Registrar that do not fit into another document type. " +
      "Renewed annually (1 year). " +
      "DRAFT: needs Industrial Registrar review.",
  },
} as const satisfies Record<string, ContentDefinition>;

// -----------------------------------------------------------------------------
// Derived helpers
// -----------------------------------------------------------------------------

export type ContentDefinitionKey = keyof typeof CONTENT_DEFINITIONS;

/** Sorted list of all keys (for the test + for tooling). */
export const CONTENT_DEFINITION_KEYS: readonly ContentDefinitionKey[] = Object.keys(
  CONTENT_DEFINITIONS,
).sort() as ContentDefinitionKey[];

/**
 * Look up a definition by key. Returns undefined if the key is not found
 * (the popover component handles this gracefully — but the test ensures
 * every termKey used in the UI is defined, so this should never happen
 * in practice).
 */
export function getContentDefinition(
  key: string,
): ContentDefinition | undefined {
  return CONTENT_DEFINITIONS[key as ContentDefinitionKey];
}

/**
 * Type guard — does this string correspond to a known content definition key?
 * Used by the test to validate termKey props across the codebase.
 */
export function isContentDefinitionKey(key: string): key is ContentDefinitionKey {
  return key in CONTENT_DEFINITIONS;
}
