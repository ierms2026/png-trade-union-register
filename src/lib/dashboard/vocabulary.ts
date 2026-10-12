// =============================================================================
// Vocabulary — the single source of truth for all user-facing labels.
//
// Every label the user sees in the UI should come from this file. No component
// should hardcode status labels, view titles, or review-status text.
//
// This file unifies:
//   - Compliance status labels (was STATUS_CONFIG in status-config.ts)
//   - Review status labels (was duplicated 4x across components)
//   - Task status labels (was hardcoded in tasks.tsx)
//   - Contact-update status labels (was hardcoded in contact-requests.tsx)
//   - Webhook delivery status labels (was hardcoded in webhooks.tsx)
//   - Union status labels (was in status-badge.tsx)
//   - View titles (was inconsistent: "Compliance Matrix" vs "Compliance Status")
//   - The "Resources" vs "Legislation" naming (resolved: "Resources")
//
// NAMING DECISIONS:
//   1. "Resources" is the unified user-facing label (houses acts, regulations,
//      articles, + amendments — not just legislation). The internal route
//      name remains "legislation" for backward compatibility.
//   2. "Pending" (document review) → "Pending Review" (more descriptive,
//      matches the majority usage across 4 components)
//   3. "N/A" → "Not Applicable" (full word, consistent with the other 4)
//   4. "Compliance Matrix" → kept as the staff-facing title; portal uses
//      "Compliance Status" (simpler for reps — intentional difference)
// =============================================================================

import {
  CheckCircle2, AlertTriangle, XCircle, FileQuestion, Ban,
  Clock, XCircle as RejectIcon,
  type LucideIcon,
} from "lucide-react";

// =============================================================================
// Compliance statuses (COMPLIANT / EXPIRING / OVERDUE / AWAITING_REVIEW / MISSING / NOT_APPLICABLE)
// =============================================================================

export type ComplianceStatus =
  | "COMPLIANT"
  | "EXPIRING"
  | "OVERDUE"
  | "AWAITING_REVIEW"
  | "MISSING"
  | "NOT_APPLICABLE";

export interface StatusConfig {
  label: string;
  /** Abbreviated label for space-constrained UI (matrix cells, KPI tiles). Equals label unless an abbreviation is already used on screen. */
  shortLabel: string;
  icon: LucideIcon;
  /** Tailwind classes for badge rendering. */
  cell: string;
  dot: string;
  definition: string;
}

// PROVISIONAL(D4): see docs/decisions-and-defaults.md
// NOT_APPLICABLE uses label "Not Applicable" (canonical) + shortLabel "N/A"
// for space-constrained UI. Other statuses use shortLabel = label.
export const COMPLIANCE_STATUS_CONFIG: Record<ComplianceStatus, StatusConfig> = {
  COMPLIANT: {
    label: "Compliant",
    shortLabel: "Compliant",
    icon: CheckCircle2,
    // STEP 6 (polish): use tailwind color stops (not chart tokens) so the
    // bg+text pair is guaranteed WCAG-AA contrast in both light + dark.
    // Chart tokens at /15 opacity over card gave 3.29:1 in light mode
    // (chart-3 on chart-3/15 — same hue, insufficient luminance diff).
    // green-800 on green-100 = 6.49:1 (verified by contrast-check.ts).
    cell: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900",
    dot: "bg-chart-3",
    definition: "Document filed, approved by Registrar, with renewal date (counted from approval date) more than 90 days away.",
  },
  EXPIRING: {
    label: "Expiring",
    shortLabel: "Expiring",
    icon: AlertTriangle,
    // STEP 6: amber pair (was chart-4 tokens — failed in dark mode at
    // 1.39:1 because accent-foreground is dark navy on a barely-tinted
    // dark card). amber-800 on amber-100 = 6.37:1.
    cell: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
    dot: "bg-chart-4",
    definition: "Document filed and approved, but renewal date (counted from approval date) is within 90 days.",
  },
  OVERDUE: {
    label: "Overdue",
    shortLabel: "Overdue",
    icon: XCircle,
    // STEP 6: red pair (was destructive tokens — failed in light mode at
    // 4.01:1). red-800 on red-100 = 6.80:1.
    cell: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900",
    dot: "bg-destructive",
    definition: "Document filed and approved, but renewal date (counted from approval date) has passed.",
  },
  AWAITING_REVIEW: {
    label: "Awaiting Review",
    shortLabel: "Awaiting Review",
    icon: Clock,
    cell: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900",
    dot: "bg-blue-500",
    definition: "Document has been uploaded by the union but the Registrar has not yet approved it (or has rejected it). The union has done their part — this is not a gap in compliance, it's an item on the Registrar's desk.",
  },
  MISSING: {
    label: "Missing",
    shortLabel: "Missing",
    icon: FileQuestion,
    cell: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground/40",
    definition: "No document has been filed for this type, or a previously-filed document was disposed under retention rules. The union needs to file a new document.",
  },
  NOT_APPLICABLE: {
    label: "Not Applicable",
    shortLabel: "N/A",
    icon: Ban,
    cell: "bg-muted/50 text-muted-foreground border-border",
    dot: "bg-muted-foreground/20",
    definition: "Document type is not required for this union.",
  },
};

// =============================================================================
// Review statuses (PENDING / APPROVED / REJECTED) — for Document.reviewStatus
// =============================================================================

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ReviewStatusConfig {
  label: string;
  icon: LucideIcon;
  /** Tailwind classes for badge rendering. */
  tone: string;
  /** Plain-language definition (for tooltips, glossary, onboarding). */
  definition?: string;
}

export const REVIEW_STATUS_CONFIG: Record<ReviewStatus, ReviewStatusConfig> = {
  PENDING: {
    label: "Pending Review",
    icon: Clock,
    tone: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
    definition:
      "Document has been uploaded by a union representative or officer, but the Registrar has not yet approved it. A document in this state does NOT count toward compliance — it must be approved first.",
  },
  APPROVED: {
    label: "Approved",
    icon: CheckCircle2,
    tone: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900",
    definition:
      "Document has been reviewed and approved by the Registrar. Only approved documents count toward compliance.",
  },
  REJECTED: {
    label: "Rejected",
    icon: RejectIcon,
    tone: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900",
    definition:
      "Document was reviewed by the Registrar and rejected. The union should upload a corrected version. A rejected document does NOT count toward compliance.",
  },
};

// =============================================================================
// Task statuses — ALIGNED with the Prisma TaskStatus enum.
//
// The Prisma enum (prisma/schema.prisma) defines:
//   PENDING | IN_PROGRESS | COMPLETED | CANCELLED
//
// This config MUST mirror those exact keys. The test in dashboard-nav.test.ts
// ("TASK_STATUS_CONFIG keys match the Prisma TaskStatus enum") fails if they
// drift — so a future enum change either updates this map or fails loudly.
//
// Previous versions of this map used TODO/DONE/CANCELLED (invented names that
// didn't match the DB). That caused silent failures: a lookup with a real
// status (PENDING/COMPLETED) found no match, and the raw enum value was shown
// to users in capitals. The contract test prevents that from recurring.
// =============================================================================

export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; tone: string; definition: string }> = {
  PENDING: {
    label: "To Do",
    tone: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
    definition: "Task has been created but not yet started. This is the default state for new tasks.",
  },
  IN_PROGRESS: {
    label: "In Progress",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300",
    definition: "Task is actively being worked on by the assignee.",
  },
  COMPLETED: {
    label: "Done",
    tone: "bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300",
    definition: "Task has been finished. Completed tasks stay on the list for audit history.",
  },
  CANCELLED: {
    label: "Cancelled",
    tone: "bg-muted text-muted-foreground",
    definition: "Task has been cancelled and is no longer being worked on. The task stays on the list for audit history — it is not deleted.",
  },
};

// =============================================================================
// Contact-update statuses (PENDING / APPROVED / REJECTED) — same enum values
// as review statuses but different context. Same labels.
// =============================================================================

export const CONTACT_UPDATE_STATUS_CONFIG = REVIEW_STATUS_CONFIG;

// =============================================================================
// Webhook delivery statuses (PENDING / DELIVERED / FAILED)
// =============================================================================

export type WebhookDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED";

export const WEBHOOK_DELIVERY_STATUS_CONFIG: Record<
  WebhookDeliveryStatus,
  { label: string; icon: LucideIcon; tone: string }
> = {
  PENDING: {
    label: "Pending",
    icon: Clock,
    tone: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
  },
  DELIVERED: {
    label: "Delivered",
    icon: CheckCircle2,
    tone: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900",
  },
  FAILED: {
    label: "Failed",
    icon: XCircle,
    tone: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900",
  },
};

// =============================================================================
// Union statuses (ACTIVE / SUSPENDED / DEREGISTERED)
// =============================================================================

export type UnionStatus = "ACTIVE" | "SUSPENDED" | "DEREGISTERED";

export const UNION_STATUS_CONFIG: Record<
  UnionStatus,
  {
    label: string;
    icon: LucideIcon;
    variant: "default" | "secondary" | "destructive" | "outline";
    className: string;
    /** Plain-language definition for the public glossary + tooltips. */
    definition: string;
    /** One-line plain-language summary for the public glossary. */
    plainLanguage: string;
  }
> = {
  ACTIVE: {
    label: "Active",
    icon: CheckCircle2,
    variant: "default",
    // STEP 6 (polish): WCAG-AA-compliant tailwind color pair (was chart-3
    // tokens — failed at 3.29:1 in light mode). green-800 on green-100
    // = 6.49:1. Matches StatusBadge STATUS_CONFIG.
    className: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900",
    definition:
      "The union is currently registered and operating. It has met the requirements of the Industrial Organizations Act and its registration is in good standing.",
    plainLanguage:
      "The union is registered and operating. It is in good standing with the Registrar.",
  },
  SUSPENDED: {
    label: "Suspended",
    icon: Clock,
    variant: "secondary",
    // STEP 6: amber pair (was accent tokens — failed at 1.39:1 in dark
    // mode). amber-800 on amber-100 = 6.37:1. Matches StatusBadge.
    className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
    definition:
      "The union's registration has been temporarily suspended by the Registrar. A suspended union cannot operate as a registered trade union, but the suspension may be lifted once the issues are resolved.",
    plainLanguage:
      "The union's registration is temporarily on hold. It cannot operate as a registered union, but the suspension can be lifted.",
  },
  DEREGISTERED: {
    label: "Deregistered",
    icon: XCircle,
    variant: "secondary",
    className: "bg-muted text-muted-foreground border-border",
    definition:
      "The union's registration has been cancelled by the Registrar. A deregistered union is no longer recognised as a trade union under the Industrial Organizations Act. The record is kept on the register for historical reference.",
    plainLanguage:
      "The union is no longer registered. It is not recognised as a trade union. The record is kept for history.",
  },
};

// =============================================================================
// Role labels — translates stored Role enum values to human-readable labels
// =============================================================================

export type UserRole = "REGISTRAR" | "INSPECTOR" | "OFFICER";

export const ROLE_LABELS: Record<UserRole, string> = {
  // IA-3: user-facing labels. Internal enum values unchanged (REGISTRAR,
  // INSPECTOR, OFFICER). "Industrial Registrar" + "Union Official" are the
  // formal titles used in user-facing text; "Inspector" stays as-is.
  REGISTRAR: "Industrial Registrar",
  INSPECTOR: "Inspector",
  OFFICER: "Union Official",
};

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role as UserRole] ?? role;
}

// =============================================================================
// Notification type labels — translates stored NotificationType enum values
// =============================================================================

export type NotificationTypeLabel = "COMPLIANCE" | "TASK";

export const NOTIFICATION_TYPE_LABELS: Record<NotificationTypeLabel, string> = {
  COMPLIANCE: "Compliance Alert",
  TASK: "Task Update",
};

export function getNotificationTypeLabel(type: string): string {
  return NOTIFICATION_TYPE_LABELS[type as NotificationTypeLabel] ?? type;
}

// =============================================================================
// View titles — the canonical heading for each view.
//
// These labels MIRROR the nav-structure.ts destination labels. The two must
// stay in sync: the nav item, the breadcrumb, the palette row, and the page
// heading should all show the SAME name for a given destination. The
// `dashboard-nav.test.ts` test "VIEW_TITLES mirrors NAV_STRUCTURE labels"
// fails if they drift.
//
// Routes here that AREN'T in NAV_STRUCTURE (e.g. "document-detail",
// "account-security") are special-case views reachable via deep links but
// not via the nav bar. They get a title for the page heading + breadcrumb,
// but no nav entry.
// =============================================================================

export const VIEW_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  unions: "Unions",
  "my-union": "My Union",
  documents: "Documents",
  "document-detail": "Document Details",
  compliance: "Compliance",
  "configure-rules": "Rules",
  compare: "Compare",
  tasks: "Tasks",
  search: "Search",
  reviews: "Review Queue",
  // IA-1: "Retention Queue" → "Retention & Disposal"
  retention: "Retention & Disposal",
  "contact-requests": "Contact Updates",
  calendar: "Calendar",
  // IA-1: "Audit" → "Audit Log" (matches the nav label)
  audit: "Audit Log",
  users: "Users",
  // IA-1: "Security" → "Access Monitoring"
  security: "Access Monitoring",
  "api-keys": "API Keys",
  webhooks: "Webhooks",
  legislation: "Resources",
  // IA-1: "Account Security" → "My sign-in & 2FA"
  "account-security": "My sign-in & 2FA",
  help: "Help & Guide",
};

// =============================================================================
// Resources naming — the user-facing label is "Resources" everywhere.
// The internal route name is "legislation" (backward compatibility);
// the API endpoint is /api/legislation; the TypeScript type is LegislationEntry.
// Only the user-facing labels say "Resources".
// =============================================================================

export const RESOURCES_LABEL = "Resources";
export const RESOURCES_ADD_LABEL = "Add Resource";
export const RESOURCES_EDIT_LABEL = "Edit Resource";
export const RESOURCES_EMPTY_TITLE = "No resources";
export const RESOURCES_EMPTY_ACTION = "Add Resource";

// =============================================================================
// Feedback email — the address that the "Give feedback" link in the app
// shell sends to. This is the single place to change it.
//
// STEP 7 (feedback path): the value below is a PLACEHOLDER. Replace it
// with the actual stakeholder-feedback address (e.g. the Registrar's
// inbox or a shared support alias) before go-live. The test in
// feedback-link.test.ts asserts the constant is non-empty + looks like
// an email, so a missing @ will fail the build.
// =============================================================================

export const FEEDBACK_EMAIL = "registrar@example.com";

/**
 * Build a mailto: URL for the "Give feedback" link, pre-filled with the
 * current page URL and the user's role. The body is a short prompt so
 * the user knows what to type.
 *
 * @param currentUrl The current page URL (window.location.href from the caller).
 * @param roleLabel The user's role label (e.g. "Registrar", "Officer").
 * @returns A mailto: URL string.
 */
export function buildFeedbackMailto(currentUrl: string, roleLabel: string): string {
  const subject = `Feedback on the Register of Trade Unions`;
  const body =
    `I'd like to give feedback on the Register of Trade Unions.\n\n` +
    `Page: ${currentUrl}\n` +
    `My role: ${roleLabel}\n\n` +
    `What I was trying to do:\n\n` +
    `What I expected:\n\n` +
    `What actually happened:\n\n` +
    `(Delete anything above that isn't relevant. The more specific you are, ` +
    `the easier it is to act on.)`;
  // encodeURI handles the common cases. Line breaks (%0A) need explicit
  // handling because encodeURI does NOT encode them.
  const encoded = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return encoded;
}

// =============================================================================
// Document type categories — IA-3.
//
// The 13 canonical document types (from prisma/seed.ts) grouped into 4
// categories for the upload picker + union Documents tab. This is the
// single source of truth for the grouping — both UI surfaces read from
// here so they stay in sync.
//
// Categories:
//   Registration  — the founding documents (permanent, rarely re-filed)
//   Annual Filings — documents filed on a yearly cycle
//   Governance    — documents about the union's leadership + elections
//   Oversight     — documents produced by the Registrar's office
//
// If a document type from the DB is NOT in any category (e.g. a custom
// type added later), it falls through to an "Other" group at the bottom.
// =============================================================================

export interface DocumentTypeCategory {
  label: string;
  /** Short plain-language description of what this category covers. */
  description: string;
  documentTypes: string[];
  /**
   * Whether this category is "internal" — produced by the Industrial
   * Registrar's office, not filed by unions. Internal categories are
   * hidden from Union Officials (they can't upload these types, can't
   * see them in their Documents tab, and don't see them in their
   * compliance matrix). The Industrial Registrar + Inspector still see
   * them.
   *
   * IA-4: the "Oversight" category (Inspection Reports, Awards, General
   * Matters) is internal. The other 3 categories are union-filed.
   */
  internal?: boolean;
}

export const DOCUMENT_TYPE_CATEGORIES: DocumentTypeCategory[] = [
  {
    label: "Registration",
    description:
      "Founding documents that establish the union's legal existence. Permanent — rarely re-filed after initial registration.",
    documentTypes: [
      "Application for Registration",
      "Registration Certificate",
      "Constitution",
    ],
  },
  {
    label: "Annual Filings",
    description:
      "Documents filed on a yearly cycle. Must be renewed each year to stay compliant.",
    documentTypes: [
      "Financial Return",
      "Financial Membership List",
      "Affiliations",
      "Welfare Fund",
    ],
  },
  {
    label: "Governance",
    description:
      "Documents about the union's leadership, elections, and internal governance. Renewed every 3 years.",
    documentTypes: [
      "Election of Office Bearers",
      "Secret Ballots",
      "General Secretary Appointments",
    ],
  },
  {
    label: "Oversight",
    description:
      "Documents produced by the Industrial Registrar's office during oversight of the union. Renewed annually.",
    documentTypes: [
      "Inspection Reports",
      "Awards",
      "General Matters",
    ],
    // IA-4: internal — these types are produced by the Industrial
    // Registrar, not filed by unions. Hidden from Union Officials.
    internal: true,
  },
];

/**
 * Group a flat list of document type strings into categories.
 * Types not in any category go into an "Other" group at the bottom.
 * Categories with zero matching types are omitted.
 */
export function groupDocumentTypesByCategory(
  documentTypes: string[],
): DocumentTypeCategory[] {
  const typeSet = new Set(documentTypes);
  const grouped: DocumentTypeCategory[] = [];
  const seen = new Set<string>();

  for (const cat of DOCUMENT_TYPE_CATEGORIES) {
    const inCategory = cat.documentTypes.filter((t) => typeSet.has(t));
    if (inCategory.length > 0) {
      grouped.push({ label: cat.label, description: cat.description, documentTypes: inCategory });
      for (const t of inCategory) seen.add(t);
    }
  }

  // "Other" group for types not in any category
  const others = documentTypes.filter((t) => !seen.has(t));
  if (others.length > 0) {
    grouped.push({ label: "Other", description: "Document types not in a standard category.", documentTypes: others });
  }

  return grouped;
}

/**
 * The set of document types that are "internal" (produced by the
 * Industrial Registrar, not filed by unions). Union Officials should
 * not see these in their upload picker, Documents tab, or compliance
 * matrix.
 *
 * IA-4: derived from DOCUMENT_TYPE_CATEGORIES where `internal: true`.
 */
export const INTERNAL_DOCUMENT_TYPES: ReadonlySet<string> = new Set(
  DOCUMENT_TYPE_CATEGORIES
    .filter((cat) => cat.internal)
    .flatMap((cat) => cat.documentTypes),
);

/**
 * Check if a document type is internal (Industrial Registrar only).
 */
export function isInternalDocumentType(documentType: string): boolean {
  return INTERNAL_DOCUMENT_TYPES.has(documentType);
}

/**
 * Filter a list of document types to exclude internal types.
 * Used by the Union Official's upload picker, Documents tab, + compliance
 * matrix to hide Oversight-category types (Inspection Reports, Awards,
 * General Matters).
 *
 * @param documentTypes The full list of document types.
 * @returns The list with internal types removed.
 */
export function filterOutInternalTypes(documentTypes: string[]): string[] {
  return documentTypes.filter((t) => !INTERNAL_DOCUMENT_TYPES.has(t));
}

/**
 * Filter a list of document types to only include internal types.
 * Used by the Industrial Registrar's views when they want to see only
 * the internal (Oversight) types.
 */
export function filterToInternalTypes(documentTypes: string[]): string[] {
  return documentTypes.filter((t) => INTERNAL_DOCUMENT_TYPES.has(t));
}

// =============================================================================
// Helpers
// =============================================================================

export function getComplianceStatusLabel(status: ComplianceStatus): string {
  return COMPLIANCE_STATUS_CONFIG[status]?.label ?? status;
}

export function getComplianceStatusShortLabel(status: ComplianceStatus): string {
  return COMPLIANCE_STATUS_CONFIG[status]?.shortLabel ?? status;
}

export function getReviewStatusLabel(status: ReviewStatus): string {
  return REVIEW_STATUS_CONFIG[status]?.label ?? status;
}

export function getTaskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_CONFIG[status]?.label ?? status;
}

export function getUnionStatusLabel(status: UnionStatus): string {
  return UNION_STATUS_CONFIG[status]?.label ?? status;
}

export function getViewTitle(route: string): string {
  return VIEW_TITLES[route] ?? route;
}

// =============================================================================
// Notification linkUrl helpers — canonical format for all notification links.
//
// CANONICAL FORMAT (one agreed style, used everywhere):
//   Staff notifications:  /?view=<view>       (e.g., /?view=reviews)
//   Portal notifications: /portal?view=<view> (e.g., /portal?view=contact)
//
// Every notification creator calls staffLinkUrl() or portalLinkUrl() — never
// string-builds. Every consumer (AppShell, and historically PortalShell
// before the /portal app was removed in D7) calls the matching
// audience-aware parser. Email templates call resolveLinkUrlForEmail() to
// get an absolute URL that works when clicked from an email client.
//
// AUDIENCE-AWARE PARSING (prevents silent cross-audience failures):
//   parseStaffLinkUrl  — only honors /?view=X, IGNORES /portal?view=X.
//   parsePortalLinkUrl — only honors /portal?view=X, IGNORES /?view=X.
//
// Why: before audience-aware parsing, a staff user who received a portal
// link (/portal?view=contact) would have "contact" extracted by the generic
// parseLinkUrl, then onNavigate("contact") would fire — but the staff app
// has no "contact" view, so the user silently landed on the Dashboard.
// With audience-aware parsing, the staff app ignores the portal link entirely
// (the notification is still marked as read, just no navigation).
//
// The generic parseLinkUrl() is kept for backward compat + debugging — it
// extracts ?view= from any link regardless of audience. Production code
// should use the audience-aware variants.
// =============================================================================

/**
 * Build a canonical staff notification linkUrl.
 * @param view The view key (e.g., "reviews", "compliance", "tasks")
 * @returns A URL like "/?view=reviews"
 */
export function staffLinkUrl(view: string): string {
  return `/?view=${view}`;
}

/**
 * Build a canonical portal notification linkUrl.
 * @param view The portal view key (e.g., "contact", "documents", "compliance")
 * @returns A URL like "/portal?view=contact"
 */
export function portalLinkUrl(view: string): string {
  return `/portal?view=${view}`;
}

/**
 * Parse a notification linkUrl + extract the view key.
 * Works for both staff (/?view=X) and portal (/portal?view=X) formats.
 *
 * This is the GENERIC parser — it extracts ?view= from any link regardless
 * of audience. Production code should use the audience-aware variants
 * (parseStaffLinkUrl, parsePortalLinkUrl) to prevent cross-audience silent
 * failures. This generic parser is kept for backward compat + debugging.
 *
 * @returns The view key (e.g., "reviews"), or null if no ?view= param found.
 */
export function parseLinkUrl(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;
  const match = linkUrl.match(/[?&]view=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Parse a STAFF notification linkUrl — only honors /?view=X format.
 * Ignores portal links (/portal?view=X) to prevent cross-audience silent
 * failures. Used by AppShell (the staff notification bell).
 *
 * @returns The view key (e.g., "reviews"), or null if the link is not a
 *          staff link or has no ?view= param.
 */
export function parseStaffLinkUrl(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;
  // Staff links start with /?view= or just ?view= (relative). They do NOT
  // start with /portal. This prevents a portal link from being honored by
  // the staff app.
  if (linkUrl.startsWith("/portal")) return null;
  const match = linkUrl.match(/[?&]view=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Parse a PORTAL notification linkUrl — only honors /portal?view=X format.
 * Ignores staff links (/?view=X) to prevent cross-audience silent failures.
 * Used historically by PortalShell (the representative notification bell,
 * removed in D7). Kept because /api/contact-requests/[id]/{approve,reject}
 * still calls portalLinkUrl() to build notification linkUrls.
 *
 * @returns The view key (e.g., "contact"), or null if the link is not a
 *          portal link or has no ?view= param.
 */
export function parsePortalLinkUrl(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;
  // Portal links must start with /portal. This prevents a staff link
  // (/?view=X) from being honored by the portal.
  if (!linkUrl.startsWith("/portal")) return null;
  const match = linkUrl.match(/[?&]view=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Resolve a relative linkUrl to an absolute URL for email rendering.
 * Uses NEXT_PUBLIC_APP_URL if set, otherwise falls back to the provided base URL.
 *
 * @param linkUrl The relative linkUrl (e.g., "/?view=reviews")
 * @param fallbackBaseUrl The base URL to use if NEXT_PUBLIC_APP_URL is not set
 * @returns An absolute URL (e.g., "http://localhost:3000/?view=reviews")
 */
export function resolveLinkUrlForEmail(
  linkUrl: string | null | undefined,
  fallbackBaseUrl: string,
): string | null {
  if (!linkUrl) return null;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || fallbackBaseUrl;
  // Remove trailing slash from base + leading slash from linkUrl to avoid double slashes
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanLink = linkUrl.startsWith("/") ? linkUrl : `/${linkUrl}`;
  return `${cleanBase}${cleanLink}`;
}

/**
 * Infer the audience (staff vs portal) from a linkUrl.
 * Used by the email template to choose the right button label
 * ("View in Dashboard" vs "View in Portal").
 *
 * @returns "portal" if the link starts with /portal, "staff" otherwise.
 */
export function inferLinkAudience(linkUrl: string | null | undefined): "staff" | "portal" {
  if (!linkUrl) return "staff";
  return linkUrl.startsWith("/portal") ? "portal" : "staff";
}
