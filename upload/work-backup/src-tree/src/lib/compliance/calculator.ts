import type { ComplianceRule, Document, DocumentVersion } from "@prisma/client";

// =============================================================================
// Compliance Calculator — pure functions computing live compliance status.
//
// THE CORE MANDATE OF SESSION 3: "Compute live, never store."
//
// Why this matters (business justification):
// A regulator's answer to "is this union compliant?" must be correct *right
// now*, not at last cache refresh. If we cached `status: 'overdue'` in the
// DB, then a Registrar edited a rule (e.g. raised renewalYears from 1 to 3)
// and someone read the cached value before invalidation, we'd tell a judge
// the union was compliant when it wasn't — a perjury-adjacent failure mode.
// Pure functions guarantee the answer is always correct, recomputed from
// raw inputs on every call. The cost (a few ms of CPU per read) is
// negligible next to the regulatory cost of being wrong.
//
// WHY PURE (no I/O, no Date.now() at the call site — passed in as a param):
//   1. Testable: pass a fixed `now` and you get deterministic output.
//      The smoke test for this module freezes time at a known instant and
//      asserts every status + boundary condition.
//   2. Cacheable: same inputs → same output. The Compliance Matrix UI can
//      memoize freely.
//   3. Reasonable: no side effects means no hidden state. Code review can
//      trace a single function and prove the output.
//
// PROPERTIES OF THE INPUT SHAPES:
// The function accepts the Prisma-generated types directly (no DTO layer)
// because:
//   - The DB row IS the input shape — no transformation needed.
//   - Adding a DTO would create a maintenance burden (keep DTO in sync
//     with schema) for zero benefit.
//   - Callers already have these rows loaded (the API routes fetch them
//     with `include: { versions: true }` for the matrix view).
//
// EXCEPTION: `latestVersion` is passed separately (not as
// `document.versions[0]`) because the caller's already fetched it as
// `currentVersionId → DocumentVersion`. This avoids a redundant fetch
// when the caller has the latest version but didn't load the full
// version chain.
// =============================================================================

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Compliance status for a (rule, document, latestVersion) tuple.
 *
 * Order matters in the UI for badge color priority — if a doc is both
 * disposed AND would be overdue, MISSING wins (you can't be overdue on
 * a doc that's been disposed; it's just gone). The calculateStatus
 * function below encodes this precedence.
 *
 * Business meaning of each value:
 *   - COMPLIANT         : Doc filed, approved, renewal date is >90 days away.
 *                         Green badge.
 *   - EXPIRING          : Doc filed, approved, renewal date is within 90 days.
 *                         Yellow badge. The 90-day window gives the union
 *                         time to re-file before going overdue.
 *   - OVERDUE           : Doc filed, approved, renewal date has passed.
 *                         Red badge. The union is legally non-compliant.
 *   - AWAITING_REVIEW   : Doc has been uploaded but the Registrar hasn't
 *                         approved it yet (reviewStatus = PENDING or
 *                         REJECTED). Blue badge. The union has done their
 *                         job — this is NOT a gap in compliance, it's an
 *                         item on the Registrar's desk.
 *   - MISSING           : No doc filed, OR the doc was disposed. Gray badge.
 *                         This is a TRUE gap — the union needs to file.
 *   - NOT_APPLICABLE    : The ComplianceRule says this doc type isn't
 *                         required for any union (e.g. Welfare Fund is
 *                         required only for unions with >50 members).
 *                         Slate badge. Excluded from BOTH numerator AND
 *                         denominator of the per-union compliance score.
 *
 * Listed as a string union (not a TS enum) so:
 *   - The values are nominal strings that serialize directly to JSON
 *     without a transform. Returning `Status.COMPLIANT` from a JSON API
 *     serializes as the string `"COMPLIANT"` — no `.toString()` needed.
 *   - Importers can do `if (status === "COMPLIANT")` without an import.
 *   - The Prisma schema uses enums elsewhere (Role, Severity, UnionStatus),
 *     but those are persisted to the DB. This type is *never* persisted —
 *     pure function output, used in-memory only. A TS union is enough.
 */
export type ComplianceStatus =
  | "COMPLIANT"
  | "EXPIRING"
  | "OVERDUE"
  | "AWAITING_REVIEW"
  | "MISSING"
  | "NOT_APPLICABLE";

/**
 * The 6 statuses, in canonical display order. Used by UI badge selectors
 * and the Compliance Matrix column rendering. Kept in this file (not a
 * separate constants file) because it's tightly coupled to the
 * ComplianceStatus type above — if you change one, you change the other.
 */
export const COMPLIANCE_STATUSES: ComplianceStatus[] = [
  "COMPLIANT",
  "EXPIRING",
  "OVERDUE",
  "AWAITING_REVIEW",
  "MISSING",
  "NOT_APPLICABLE",
];

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * A document is "Expiring" if its next renewal date falls within this many
 * days from today.
 *
 * Why 90: the spec PDF calls this out as the demo value. 90 days gives a
 * union roughly 3 months to re-file — enough lead time for the registrar's
 * office to notify the union, the union to gather paperwork, and the doc
 * to be uploaded before going overdue. Change this constant and every
 * status recomputes immediately (live computation, no cache).
 *
 * Why it lives HERE (not in src/lib/auth/constants.ts where Session 1
 * reserved it):
 *   - Collocation. The constant is consumed by exactly one function
 *     (calculateStatus below). Co-locating the constant with its consumer
 *     means a future reader doesn't have to chase an import to find the
 *     value.
 *   - The Session 1 "constants.ts is the single source of truth" rule
 *     applies to AUTH constants (lockout, session TTL, etc.) — those have
 *     to be reachable from auth-guard code. Compliance is a different
 *     domain; the reserved slot was speculative. Collocation wins.
 *   - The Session 1 file has been updated to note that EXPIRING_WINDOW_DAYS
 *     has shipped here, so there's no dangling reservation.
 *
 * Unit: days.
 */
export const EXPIRING_WINDOW_DAYS = 90;

/**
 * Sentinel value for rules that effectively never expire (one-time filings
 * like a Constitution). Set this to `renewalYears` in the seed to mark a
 * rule as "no renewal required."
 *
 * Why 99 (not Infinity or 9999):
 *   - 99 years is well beyond any plausible audit horizon (anyone alive
 *     when a 99-year rule expires will have other problems).
 *   - The number is round and obviously-sentinel — a future reader sees
 *     `renewalYears: 99` and immediately reads it as "never."
 *   - The seed file uses the same value, so the convention is consistent
 *     across the codebase.
 */
export const NEVER_RENEW_YEARS = 99;

// -----------------------------------------------------------------------------
// Input shapes — accept Prisma's types directly
// -----------------------------------------------------------------------------

/**
 * Input shape for a rule. `Pick` instead of `ComplianceRule` so the
 * function accepts any superset (e.g. a partial rule loaded via `select`).
 */
export interface ComplianceRuleInput {
  required: boolean;
  renewalYears: number;
  retentionYrs?: number; // used by Retention (Session 5), not by status calc — optional here
}

/**
 * Input shape for a document. Nullable because the caller may pass `null`
 * when no Document row exists for a given (union, rule) pair — that's the
 * MISSING case.
 *
 * `disposedAt` is the only field the calculator reads (disposal = MISSING
 * per the spec). The other Document fields are present in the Prisma type
 * but ignored here.
 */
export interface DocumentInput {
  disposedAt: Date | null;
  reviewStatus?: "PENDING" | "APPROVED" | "REJECTED" | null;
}

/**
 * Input shape for the latest version. The `uploadedAt` field is the
 * `filedAt` date per the spec — the moment the union filed the document.
 *
 * Nullable because the caller may pass `null` when the Document has no
 * versions yet (edge case: a Document row was created but no version was
 * ever uploaded — shouldn't happen in practice, but the calculator
 * defends against it).
 */
export interface DocumentVersionInput {
  uploadedAt: Date;
}

// -----------------------------------------------------------------------------
// The pure function
// -----------------------------------------------------------------------------

/**
 * Compute the expiry date for a document: filedAt + renewalYears.
 *
 * Pure: clones the input date (doesn't mutate it). Uses calendar-year math
 * (setFullYear, not 365*N days) so a "1-year renewal filed Aug 15 2026"
 * expires Aug 15 2027 — not Aug 14 2027 minus leap-day drift.
 *
 * Shared between `calculateStatus` and the Compliance Matrix API so both
 * compute the exact same date — no drift between the status calculation
 * and the `expiresAt` field shown in the matrix response.
 */
export function computeExpiryDate(filedAt: Date, renewalYears: number): Date {
  const expiryDate = new Date(filedAt.getTime());
  expiryDate.setFullYear(expiryDate.getFullYear() + renewalYears);
  return expiryDate;
}

/**
 * Compute the compliance status for a (rule, document, latestVersion) tuple.
 *
 * Pure: no I/O, no `Date.now()`, no side effects. Pass a fixed `now` for
 * testability; defaults to `new Date()` for production use.
 *
 * Algorithm (per spec, in order):
 *   1. If `!rule.required`           → NOT_APPLICABLE
 *   2. If `!document` or disposedAt  → MISSING
 *   3. If reviewStatus !== APPROVED  → AWAITING_REVIEW (PENDING or REJECTED)
 *   4. filedAt = latestVersion.uploadedAt
 *   5. expiryDate = filedAt + renewalYears
 *   6. If expiryDate < now          → OVERDUE
 *   7. If expiryDate ≤ now + 90 days → EXPIRING
 *   8. Else                          → COMPLIANT
 *
 * EDGE CASES (defensive — these shouldn't happen in practice but the
 * calculator must not throw on bad input):
 *   - rule.renewalYears ≤ 0: treat as OVERDUE if doc exists (can't have
 *     a 0-year renewal; means the rule is misconfigured)
 *   - latestVersion = null but document exists: treat as MISSING (no filed
 *     version means no filing)
 *
 * @param rule            The ComplianceRule for this documentType
 * @param document        The Document row (or null if no doc filed)
 * @param latestVersion   The latest DocumentVersion (or null if no versions)
 * @param now             Reference "now" — defaults to new Date(). Pass a
 *                        fixed value in tests for deterministic output.
 */
export function calculateStatus(
  rule: ComplianceRuleInput | null,
  document: DocumentInput | null,
  latestVersion: DocumentVersionInput | null,
  now: Date = new Date(),
): ComplianceStatus {
  // 1. Rule must exist and be required. If the rule is missing (deleted
  //    from DB?) or marked !required, the doc type is NOT_APPLICABLE for
  //    this union. NOT_APPLICABLE excludes the (union, docType) cell from
  //    BOTH numerator AND denominator of the per-union compliance score.
  if (!rule || !rule.required) {
    return "NOT_APPLICABLE";
  }

  // 2. MISSING if no document, OR if the document was disposed.
  //    Per spec: a disposed doc is "gone from every active view" — the
  //    union must re-file to be compliant again. Treating disposal as
  //    MISSING (not OVERDUE) is the correct signal: the union needs to
  //    file a NEW document, not "renew" the disposed one.
  if (!document || document.disposedAt) {
    return "MISSING";
  }

  // 2b. AWAITING_REVIEW if the document is not APPROVED (PENDING or REJECTED).
  //     This is the key split from the old behavior: previously, PENDING/
  //     REJECTED documents were folded into MISSING, which was misleading —
  //     the union HAD uploaded, the document was just waiting for the
  //     Registrar's review. Now it gets its own visible status so:
  //       - The union sees "Awaiting Review" (blue), not "Missing" (gray)
  //       - The Registrar sees their review backlog in the compliance matrix
  //       - Inspectors can distinguish true gaps from pending reviews
  //     AWAITING_REVIEW counts toward the rate denominator (it's an
  //     applicable status — the document type IS required) but NOT the
  //     numerator (the doc isn't compliant yet).
  if (document.reviewStatus !== "APPROVED") {
    return "AWAITING_REVIEW";
  }

  // 3. filedAt = the moment the latest version was uploaded.
  //    If the Document exists but has no versions (shouldn't happen, but
  //    defends against an interrupted upload), treat as MISSING — there's
  //    no actual filing to evaluate.
  if (!latestVersion) {
    return "MISSING";
  }

  const filedAt = latestVersion.uploadedAt;

  // 4. expiryDate = filedAt + renewalYears.
  //    Using calendar-year math (add years, not 365*N days) because renewal
  //    cycles are legal terms, not astronomical ones — a "1-year renewal"
  //    means "filed Aug 15 2026, due Aug 15 2027", not "due Aug 14 2027
  //    minus leap-day drift".
  //    The computeExpiryDate helper is shared with the route layer so both
  //    compute the exact same date — no drift between status calc and the
  //    "expiresAt" field shown in the matrix response.
  const expiryDate = computeExpiryDate(filedAt, rule.renewalYears);

  // Edge case: renewalYears ≤ 0 means a misconfigured rule. The doc
  // can never be compliant — return OVERDUE so the matrix shows red and
  // a Registrar notices and fixes the rule.
  if (rule.renewalYears <= 0) {
    return "OVERDUE";
  }

  // 5/6/7. Compare expiryDate to now and now+window.
  //    < now (strictly past)   → OVERDUE
  //    ≤ now + 90 days         → EXPIRING (includes the exact boundary)
  //    else                    → COMPLIANT
  //
  //    Boundary semantics (verified by smoke test):
  //      - expiryDate < now          → OVERDUE (strictly in the past)
  //      - expiryDate === now         → EXPIRING (NOT OVERDUE — spec uses strict `<`)
  //      - expiryDate === now + 90d   → EXPIRING (boundary is inclusive)
  //      - expiryDate === now + 91d   → COMPLIANT
  //
  //    The spec uses strict `<` for OVERDUE and inclusive `≤` for EXPIRING,
  //    which means a doc whose expiry is exactly today is in its LAST day
  //    of validity (still expiring, not yet overdue). This is the correct
  //    business semantic — a 1-year renewal filed on Aug 15 2025 is valid
  //    THROUGH Aug 15 2026; on Aug 15 2026 the union has until end-of-day
  //    to re-file. Only on Aug 16 2026 does it become OVERDUE.
  const msPerDay = 24 * 60 * 60 * 1000;
  const expiringThresholdMs = now.getTime() + EXPIRING_WINDOW_DAYS * msPerDay;

  if (expiryDate.getTime() < now.getTime()) {
    return "OVERDUE";
  }
  if (expiryDate.getTime() <= expiringThresholdMs) {
    return "EXPIRING";
  }
  return "COMPLIANT";
}

// -----------------------------------------------------------------------------
// Convenience: badge color mapping for UI consumers
// -----------------------------------------------------------------------------

/**
 * Tailwind CSS color classes for each status. Centralized here so the
 * Compliance Matrix, Union Detail tiles, and Compare cells all render
 * the same color for the same status. UI consumers import this object
 * instead of branching on status strings.
 *
 * Format: { badge: string, text: string, dot: string }
 *   - badge: bg classes for the badge container
 *   - text:  text color classes
 *   - dot:   bg class for a leading dot (used in lists)
 */
export const STATUS_BADGE_CLASSES: Record<
  ComplianceStatus,
  { badge: string; text: string; dot: string }
> = {
  COMPLIANT: {
    badge: "bg-green-100 text-green-800 border-green-200",
    text: "text-green-700",
    dot: "bg-green-500",
  },
  EXPIRING: {
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  OVERDUE: {
    badge: "bg-red-100 text-red-800 border-red-200",
    text: "text-red-700",
    dot: "bg-red-500",
  },
  AWAITING_REVIEW: {
    badge: "bg-blue-100 text-blue-800 border-blue-200",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  MISSING: {
    badge: "bg-gray-100 text-gray-800 border-gray-200",
    text: "text-gray-700",
    dot: "bg-gray-400",
  },
  NOT_APPLICABLE: {
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    text: "text-slate-500",
    dot: "bg-slate-300",
  },
};

/**
 * Single-letter badge label for each status, used by the Compare screen's
 * tight grid (cells are too narrow for the full word).
 *   C = Compliant
 *   E = Expiring
 *   O = Overdue
 *   M = Missing
 *   N/A = Not Applicable (2 chars)
 */
export const STATUS_LETTER: Record<ComplianceStatus, string> = {
  COMPLIANT: "C",
  EXPIRING: "E",
  OVERDUE: "O",
  AWAITING_REVIEW: "R",
  MISSING: "M",
  NOT_APPLICABLE: "N/A",
};

// -----------------------------------------------------------------------------
// Convenience: per-union score
// -----------------------------------------------------------------------------

/**
 * Result of computing compliance for one (union, docType) cell.
 * Includes the underlying inputs (filedAt, expiryDate) so the UI can
 * show "Filed: Aug 15 2026 · Expires: Aug 15 2027" in tooltips without
 * recomputing the dates.
 */
export interface ComplianceCellResult {
  status: ComplianceStatus;
  /** When the latest version was filed. Null if no version. */
  filedAt: Date | null;
  /** When the doc expires (filedAt + renewalYears). Null if no version or N/A. */
  expiryDate: Date | null;
}

/**
 * Compute the per-union compliance score: (compliant / required) × 100.
 *
 * NOT_APPLICABLE cells are excluded from BOTH numerator and denominator —
 * they don't help or hurt the score. This matches the spec PDF:
 * "Not-Applicable types are excluded from BOTH numerator and denominator."
 *
 * Returns null if the union has zero required doc types (edge case:
 * a brand-new union with no rules yet — score is undefined, not 0%).
 *
 * @param statuses Array of statuses (one per docType for this union)
 * @returns 0–100, or null if no applicable doc types
 */
export function computeUnionScore(
  statuses: ComplianceStatus[],
): number | null {
  // Filter out NOT_APPLICABLE — they don't count
  const applicable = statuses.filter((s) => s !== "NOT_APPLICABLE");
  if (applicable.length === 0) return null;

  const compliant = applicable.filter((s) => s === "COMPLIANT").length;
  return Math.round((compliant / applicable.length) * 100);
}

// -----------------------------------------------------------------------------
// Convenience helper: a single function that takes Prisma rows directly
// -----------------------------------------------------------------------------

/**
 * Convenience wrapper that accepts full Prisma row types directly (no
 * need for the caller to Pick out the fields). This is what most callers
 * will use — the ComplianceRuleInput variants above are for callers that
 * have partial rows (e.g. via `select`).
 *
 * @example
 * const rule = await db.complianceRule.findUnique({ where: { documentType } });
 * const doc = await db.document.findFirst({ where: { unionId, documentType } });
 * const latestVersion = doc ? await db.documentVersion.findFirst({
 *   where: { documentId: doc.id },
 *   orderBy: { versionNumber: "desc" },
 * }) : null;
 * const status = calculateStatusFromRows(rule, doc, latestVersion);
 */
export function calculateStatusFromRows(
  rule: Pick<ComplianceRule, "required" | "renewalYears" | "retentionYrs"> | null,
  document: Pick<Document, "disposedAt" | "reviewStatus"> | null,
  latestVersion: Pick<DocumentVersion, "uploadedAt"> | null,
  now: Date = new Date(),
): ComplianceStatus {
  return calculateStatus(rule, document, latestVersion, now);
}
