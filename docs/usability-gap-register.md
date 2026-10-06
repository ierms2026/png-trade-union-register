# Usability Gap Register

Derived from the usability audit, verified against the code on 2026-10-06.
Each claim was checked against the actual source. Discrepancies from the audit are noted.

---

## Summary

| Audit claim | Audit count | Verified count | Discrepancy |
|---|---|---|---|
| Forms with toast-only validation (no FieldError) | 7 | 12 | Audit undercounted — see U-01 |
| Native `confirm()` calls | 8 | 8 | Exact match |
| Clickable `<div onClick>` without keyboard support | 4+ | 2 confirmed | Audit overcounted — many are already `<button>`; see U-05 |
| Heatmap cells `tabIndex={-1}` with no keyboard JS | 1 | 1 | Confirmed — cells are `<a>` not `<div>`, but still keyboard-inaccessible; see U-07 |
| Calendar tabs missing ARIA | 1 | 1 | Confirmed; see U-08 |
| Dashboard "Awaiting Review" KPI links to wrong place | 1 | 1 | Confirmed; see U-09 |
| Review "Approve" has no confirmation | 1 | 1 | Confirmed; see U-10 |
| Upload dialog text mentions SHA-256 but not PENDING review | 1 | 1 | Confirmed; see U-11 |
| EmptyState without action | 15 | 14 | Audit said 15, actual is 14 of 19 (5 have action); see U-12 |
| Help-guide "one or more" unions | 1 | 1 | Confirmed; see U-13 |

---

## Gap Register

| ID | Finding | Status | True file:line | WCAG criterion | Severity | Phase |
|---|---|---|---|---|---|---|
| U-01 | Forms using toast-only validation (no inline FieldError) | CONFIRMED — 12 forms | api-keys.tsx, compare.tsx, compliance.tsx, configure-rules.tsx, contact-requests.tsx, legislation.tsx, retention.tsx, reviews.tsx, security.tsx, tasks.tsx, unions.tsx, webhooks.tsx | 3.3.1 Error Identification | High | 3 |
| U-02 | Native `confirm()` calls instead of AlertDialog | CONFIRMED — 8 calls | account-security.tsx:376, tasks.tsx:179, tasks.tsx:203, contact-requests.tsx:132, users.tsx:114, users.tsx:138, api-keys.tsx:111, webhooks.tsx:177 | 4.1.2 Name, Role, Value | Medium | 3 |
| U-03 | Clickable `<div onClick>` — union list rows | CONFIRMED | unions.tsx:336 | 2.1.1 Keyboard | High | 2 |
| U-04 | Clickable `<div onClick>` — calendar day cells | CONFIRMED | calendar.tsx:198 | 2.1.1 Keyboard | High | 2 |
| U-05 | Clickable `<div onClick>` — audit log rows | NOT FOUND — audit rows are already `<button>` | audit.tsx:283 uses `<button>` | — | — | — |
| U-06 | Clickable `<div onClick>` — document tiles | NOT FOUND — document tiles use `<Button>` and `<a>` elements | unions.tsx uses `<Button>` for actions | — | — | — |
| U-07 | Heatmap cells have `tabIndex={-1}` with no roving-tabindex JS — keyboard-inaccessible | CONFIRMED — cells are `<a role="gridcell">` with `tabIndex={-1}`, no JS to manage focus | dashboard.tsx:1140-1141 | 2.1.1 Keyboard, 2.4.3 Focus Order | High | 2 |
| U-08 | Calendar tabs missing `role="tab"` / `aria-selected` / `aria-controls` | CONFIRMED — plain `<button>` elements with no ARIA tab semantics | calendar.tsx:142-152 | 4.1.2 Name, Role, Value | Medium | 2 |
| U-09 | Dashboard "Awaiting Review" KPI links to compliance matrix (filtered by AWAITING_REVIEW), not Review Queue | CONFIRMED — `href={complianceFilterUrl(status)}` at dashboard.tsx:1601 sends all tile statuses to the compliance view | 2.4.5 Multiple Ways | High | 3 |
| U-10 | Review "Approve" has no confirmation dialog — one-click irreversible action | CONFIRMED — `onClick={() => approve(item.documentId)}` at reviews.tsx:134 | 3.3.4 Error Prevention (Legal, Financial, Data) | Medium | 3 |
| U-11 | Upload dialog text mentions SHA-256 checksum but not PENDING review workflow | CONFIRMED — description at unions.tsx:907 says only "Upload a new version of a document. Duplicate detection is based on SHA-256 checksum." | — | High | 3 |
| U-12 | EmptyState without action prop — 14 of 19 call sites | CONFIRMED — 14 of 19 lack `action` prop (5 have it: api-keys, documents, tasks, users, webhooks) | audit.tsx:304, compare.tsx:108, compare.tsx:234, compliance.tsx:159, configure-rules.tsx:78, contact-requests.tsx:180, dashboard.tsx:1761, legislation.tsx:119, retention.tsx:108, reviews.tsx:90, search.tsx:370, search.tsx:383, security.tsx:327, unions.tsx:127 | — | Medium | 3 |
| U-13 | Help-guide Officer summary says "one or more assigned unions" but Officer has exactly one | CONFIRMED | help-guide.tsx:128 | — | Low | 3 |
| U-14 | No `aria-describedby` linking form fields to error text | CONFIRMED — `FieldError` component renders error text without `id` or `aria-describedby` wiring | field-error.tsx:24-29 | 3.3.1 Error Identification, 4.1.2 Name, Role, Value | Medium | 1 |
| U-15 | No `aria-invalid` on inputs with errors | CONFIRMED — views don't pass `aria-invalid` to inputs | Various | 3.3.1 Error Identification | Medium | 1 |

---

## Discrepancies from the audit

1. **Forms with toast-only validation (U-01):** The audit said 7; the actual count is 12. The audit listed only the "major" forms (union create/edit, document upload, task create, API key create, webhook create, compliance rule edit, contact-request approve/reject) but missed that compare, compliance, legislation, retention, reviews, and security views also use toast without FieldError.

2. **Clickable `<div onClick>` elements (U-05, U-06):** The audit claimed audit log rows (`audit.tsx:283`) and document tiles (`unions.tsx:436`) are clickable divs. Verified: audit rows are `<button>` elements (`audit.tsx:283`), and document tiles use `<Button>` components for actions. These are already keyboard-accessible. Only union list rows (`unions.tsx:336`) and calendar day cells (`calendar.tsx:198`) are confirmed as clickable divs.

3. **Heatmap cells (U-07):** The audit said cells are `<div>` with `tabIndex={-1}`. Verified: cells are actually `<a role="gridcell">` elements with `tabIndex={-1}` (dashboard.tsx:1140). They have `href` for navigation but `tabIndex={-1}` makes them unfocusable. The issue is the same (keyboard-inaccessible) but the element type is different.

4. **Dashboard clickable elements (U-05/U-06):** The audit claimed dashboard composition bar and status tiles are clickable divs. Verified: they are all `<button type="button">` elements with proper `aria-label` and `focus-visible:ring-2` styling (dashboard.tsx:765, 806). Already keyboard-accessible.

5. **EmptyState count (U-12):** The audit said 15 of 19 lack CTAs. Verified: 14 of 19 lack the `action` prop. The `EmptyState` component already supports an `action` prop (`empty-state.tsx:25-28`) — it just isn't used at 14 call sites. No component change needed; only call-site changes.

6. **EmptyState action prop:** The audit said "add an optional action prop." The component already has one (`empty-state.tsx:25`). The gap is that 14 call sites don't use it.

---

## Phase plan

| Phase | Scope | Items |
|---|---|---|
| 0 | Verify and build gap register | This document |
| 1 | Shared primitives | U-14 (FieldError aria wiring), ConfirmDialog component, EmptyState already supports action (no change needed) |
| 2 | Keyboard blockers | U-03 (union rows), U-04 (calendar days), U-07 (heatmap), U-08 (calendar tabs) |
| 3 | Content and workflow fixes | U-01 (inline validation), U-02 (confirm dialogs), U-09 (KPI link), U-10 (review approve confirmation), U-11 (upload dialog text), U-12 (empty state CTAs), U-13 (help guide text), U-15 (aria-invalid) |
