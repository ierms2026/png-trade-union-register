// =============================================================================
// Activity Config — chunks 5.1 + 5.2
//
// The single source of truth for activity-event classification + severity.
//
// LAYER 1 (5.1): classifyEvent(type) → "session" | "stateChange"
//   Inverted-denylist rule: SESSION_EVENT_TYPES is the enumerated noise set;
//   everything else (including unknown types) is stateChange. Unknown types
//   stay visible — the safety property.
//
// LAYER 2 (5.2): severityForEvent(type) → "success" | "warn" | "error" | "neutral"
//   Every KNOWN_EVENT_TYPES entry has a severity in EVENT_SEVERITY. Unknown
//   types → "neutral" (consistent with 5.1's inverted rule — unknown stays
//   visible, uncolored). The completeness test enforces that a new event
//   type added to KNOWN_EVENT_TYPES MUST have a severity entry — fails
//   loudly rather than silently rendering neutral forever.
//
// SEVERITY SEMANTICS (final map — recorded for 6.2):
//   success = completed beneficial actions (uploads, approvals, restores)
//   warn    = upcoming risk (expiring set) — N/A in current inventory; reserved
//   error   = failures + negative states (rejections, tamper, dispositions
//             executed, deleted users/tasks, blocked legal holds)
//   neutral = administrative / other (rule edits, task creates/updates,
//             user creates/updates, session revokes, downloads, snoozes,
//             text extraction, legal hold placements/lifts, API key ops)
//
// The "warn" bucket is reserved for future event types that signal upcoming
// risk (e.g. "document_expiring_soon"). No current event type fits "warn";
// the bucket exists so a future PR has a place to put it without reshaping
// the type union.
//
// 5.2 SCOPE: this module stays two-valued for classification (session vs
//   stateChange). Severity is additive — it does NOT change classifyEvent's
//   contract. The two-valued EventClass union is the stable foundation.
//
// TWO BADGE SYSTEMS COEXIST (5.2 handoff):
//   1. Compliance status badges: STATUS_CONFIG in status-config.ts (5 statuses
//      → label + colorToken + icon). Used by Compliance cards. Tokens:
//      --status-compliant/expiring/overdue/missing.
//   2. Event severity badges: EVENT_SEVERITY here (4 severities → variant).
//      Used by Recent Activity panel. Tokens: same --status-* family
//      (success → --status-compliant, warn → --status-expiring,
//      error → --status-overdue, neutral → --status-missing).
//   The two systems are semantically distinct (compliance-state vs
//   event-action). They happen to share color tokens because the design
//   system only has those 4 colored tokens. Unification, if ever wanted,
//   is a 6.2 discussion — NOT 5.2.
// =============================================================================

/**
 * Event types classified as "session" (auth/session noise to collapse).
 *
 * These are the ONLY event types that get collapsed into per-user session
 * summaries. Every other event type renders as a state-changing row.
 *
 * Source: grep `action: "user_login"`, `action: "user_logout"`, etc.
 * across src/app/api/**. Cross-verified against ACTION_LABELS in
 * dashboard.tsx (the UI's canonical action label map).
 *
 * If you add a new auth/session action type (e.g. `user_login_sso`), add it
 * here AND to ACTION_LABELS in dashboard.tsx AND to KNOWN_EVENT_TYPES below.
 * The three are linked: ACTION_LABELS renders the human-readable label;
 * SESSION_EVENT_TYPES classifies it; KNOWN_EVENT_TYPES + EVENT_SEVERITY
 * attach a severity.
 */
export const SESSION_EVENT_TYPES = [
  "user_login",
  "user_login_2fa",
  "user_logout",
  "session_revoke",
] as const;

/** Type-level export for the session-types tuple (useful in tests). */
export type SessionEventType = (typeof SESSION_EVENT_TYPES)[number];

/**
 * Two-valued classification result.
 *
 * - "session": collapse to per-user summary line
 * - "stateChange": render as top-level row
 *
 * 5.2 adds severity as an ADDITIVE layer; this union stays two-valued.
 */
export type EventClass = "session" | "stateChange";

/**
 * Classify an audit event by its `action` string.
 *
 * INVERTED RULE (see module header for rationale):
 *   - If `type` is in SESSION_EVENT_TYPES → return "session"
 *   - Otherwise (including unknown / null / undefined / any new type) →
 *     return "stateChange"
 *
 * Unknown types stay visible as state-changing rows. This is the
 * deliberate safety property — never change it without a chunk-level
 * decision to do so.
 *
 * @param type  The audit log entry's `action` field (e.g. "user_login",
 *             "document_upload", or a future unknown type).
 * @returns "session" for known session event types; "stateChange" otherwise.
 */
export function classifyEvent(type: string | null | undefined): EventClass {
  if (type && (SESSION_EVENT_TYPES as readonly string[]).includes(type)) {
    return "session";
  }
  return "stateChange";
}

/**
 * Predicate form of `classifyEvent` — useful for `filter()` calls.
 *
 * @param type  The audit log entry's `action` field.
 * @returns true if the event is a session event (should be collapsed).
 */
export function isSessionEvent(type: string | null | undefined): boolean {
  return classifyEvent(type) === "session";
}

/**
 * Predicate form of `classifyEvent` — useful for `filter()` calls.
 *
 * @param type  The audit log entry's `action` field.
 * @returns true if the event is a state-changing event (should be a top-level row).
 */
export function isStateChangeEvent(type: string | null | undefined): boolean {
  return classifyEvent(type) === "stateChange";
}

// =============================================================================
// LAYER 2 — Severity (chunk 5.2)
// =============================================================================

/**
 * Four-valued event severity. Additive to classification — does NOT replace
 * `EventClass`. Every state-changing event has BOTH a class ("stateChange")
 * AND a severity (one of these four values).
 *
 * - success: completed beneficial actions (uploads, approvals, restores)
 * - warn:    upcoming risk — reserved for future event types; no current
 *            event fits this bucket
 * - error:   failures + negative states (rejections, tamper, dispositions
 *            executed, deletions, blocked legal holds)
 * - neutral: administrative / other (rule edits, task creates/updates, user
 *            creates/updates, session revokes, downloads, snoozes, text
 *            extraction, legal hold placements/lifts, API key ops)
 *
 * Mapping to Badge variants (component-side, in dashboard.tsx):
 *   success → status-compliant token (sage green)
 *   warn    → status-expiring token (warm gold)
 *   error   → status-overdue token (rich red)
 *   neutral → status-missing token (warm grey)
 */
export type EventSeverity = "success" | "warn" | "error" | "neutral";

/**
 * The complete list of known event types (session + state-changing).
 *
 * Every type here MUST have an entry in EVENT_SEVERITY. The completeness
 * test asserts this — a new type added here without a severity mapping
 * fails the test loudly.
 *
 * Source: 5.1 handoff "Event-type inventory" + ACTION_LABELS in
 * dashboard.tsx. Cross-verified against actual `auditLog.create({ data:
 * { action: "..." } })` call sites.
 *
 * Maintenance contract: when a new audit-emitting action is added to the
 * codebase, add its type string here AND to EVENT_SEVERITY. The
 * completeness test will catch a miss.
 */
export const KNOWN_EVENT_TYPES = [
  // Session (4) — also in SESSION_EVENT_TYPES above
  "user_login",
  "user_login_2fa",
  "user_logout",
  "session_revoke",

  // User administration (7)
  "user_create",
  "user_update",
  "user_delete",
  "user_unlock",
  "user_reset_2fa",
  "user_2fa_enable",
  "user_2fa_disable",

  // Union registry (1)
  "union_update",

  // Compliance rules (1)
  "compliance_rule_edit",

  // API keys (2)
  "api_key_create",
  "api_key_revoke",

  // Retention / disposition (2)
  "retention_dispose",
  "retention_snooze",

  // Documents (8)
  "document_upload",
  "document_review_approve",
  "document_review_reject",
  "document_restore",
  "document_download",
  "document_text_extracted",
  "document_tamper_detected",
  // (legal_hold_* listed separately below for clarity)

  // Legal holds (2)
  "legal_hold_placed",
  "legal_hold_lifted",

  // Dispositions (4)
  "disposition_scheduled",
  "disposition_cancelled",
  "disposition_executed",
  "disposition_blocked_legal_hold",

  // Tasks (3)
  "task_create",
  "task_update",
  "task_delete",
] as const;

/**
 * The severity map for every known event type.
 *
 * COMPLETENESS CONTRACT: every entry in KNOWN_EVENT_TYPES MUST have a key
 * here. The completeness test asserts `KNOWN_EVENT_TYPES.every(t => t in
 * EVENT_SEVERITY)`. Adding a new type to KNOWN_EVENT_TYPES without adding
 * it here fails the test loudly.
 *
 * SEMANTICS (recorded in the module header + handoff for 6.2):
 *   success: completed beneficial actions
 *     - document_upload (a new doc was filed)
 *     - document_review_approve (reviewer accepted it)
 *     - document_restore (a deleted version was brought back)
 *   warn: upcoming risk
 *     - (no current event types fit; bucket reserved for future use)
 *   error: failures + negative states
 *     - document_review_reject (reviewer rejected the upload)
 *     - document_tamper_detected (integrity check failed)
 *     - user_delete (a user was removed — negative state)
 *     - task_delete (a task was removed — negative state)
 *     - disposition_executed (document destroyed — irreversible)
 *     - disposition_blocked_legal_hold (action blocked — friction event)
 *   neutral: administrative / other (everything else)
 *     - user_create, user_update, user_unlock, user_reset_2fa,
 *       user_2fa_enable, user_2fa_disable (user admin)
 *     - union_update (union metadata edit)
 *     - compliance_rule_edit (rule config change)
 *     - api_key_create, api_key_revoke (api key admin)
 *     - retention_dispose, retention_snooze (retention admin — not the
 *       destructive kind; those are disposition_executed)
 *     - document_download, document_text_extracted (read-only ops)
 *     - legal_hold_placed, legal_hold_lifted (hold admin)
 *     - disposition_scheduled, disposition_cancelled (disposition admin;
 *       the destructive one is disposition_executed → error)
 *     - task_create, task_update (task admin; task_delete → error)
 *     - user_login, user_login_2fa, user_logout, session_revoke (session
 *       events — though these never render as state-changing rows because
 *       classifyEvent puts them in the "session" bucket; the severity
 *       entry exists for completeness so the test doesn't have to special-
 *       case them)
 */
export const EVENT_SEVERITY: Readonly<Record<string, EventSeverity>> = {
  // Session (4) — collapsed to summaries, never badge-rendered, but
  // mapped for completeness so the test doesn't special-case them.
  user_login: "neutral",
  user_login_2fa: "neutral",
  user_logout: "neutral",
  session_revoke: "neutral",

  // User administration (7)
  user_create: "neutral",
  user_update: "neutral",
  user_delete: "error", // removing a user is a negative state
  user_unlock: "neutral",
  user_reset_2fa: "neutral",
  user_2fa_enable: "neutral",
  user_2fa_disable: "neutral",

  // Union registry (1)
  union_update: "neutral",

  // Compliance rules (1)
  compliance_rule_edit: "neutral",

  // API keys (2)
  api_key_create: "neutral",
  api_key_revoke: "neutral",

  // Retention / disposition (2) — admin actions; the destructive
  // disposition is `disposition_executed` (error below).
  retention_dispose: "neutral",
  retention_snooze: "neutral",

  // Documents (8)
  document_upload: "success",          // a new doc was filed — beneficial
  document_review_approve: "success", // reviewer accepted — beneficial
  document_review_reject: "error",    // reviewer rejected — failure
  document_restore: "success",        // a deleted version was brought back — beneficial
  document_download: "neutral",       // read-only
  document_text_extracted: "neutral", // background processing step
  document_tamper_detected: "error",  // integrity check failed — critical

  // Legal holds (2) — admin actions, not destructive in themselves
  legal_hold_placed: "neutral",
  legal_hold_lifted: "neutral",

  // Dispositions (4)
  disposition_scheduled: "neutral",         // admin step; the actual destruction is `disposition_executed`
  disposition_cancelled: "neutral",         // admin step
  disposition_executed: "error",            // document destroyed — irreversible
  disposition_blocked_legal_hold: "error",  // action blocked — friction event

  // Tasks (3)
  task_create: "neutral",
  task_update: "neutral",
  task_delete: "error", // removing a task is a negative state
};

/**
 * Look up the severity for an event type.
 *
 * UNKNOWN → "neutral" (the safe default — consistent with 5.1's inverted
 * rule: unknown types stay visible as state-changing rows; "neutral" keeps
 * them visible without colored drama). Never throws, never returns
 * undefined.
 *
 * @param type  The audit log entry's `action` field.
 * @returns One of "success" | "warn" | "error" | "neutral". Always
 *          "neutral" for unknown / null / undefined.
 */
export function severityForEvent(type: string | null | undefined): EventSeverity {
  if (!type) return "neutral";
  return EVENT_SEVERITY[type] ?? "neutral";
}
