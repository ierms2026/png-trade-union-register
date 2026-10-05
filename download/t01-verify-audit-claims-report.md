# T01: Verify Audit Claims — Baseline Report

**Task:** T01  
**Status:** done  
**Date:** 2026-10-05  

---

## Files changed

None (read-only task — no source edits)

---

## Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit 2>&1 \| grep '^src/'` | → 23 errors (baseline match, no new errors) |
| `npx eslint src/` | → 3 errors, 2 warnings (baseline match, no new errors) |
| `npm test` | → 610 passed / 30 files (baseline match) |
| `SESSION_SECRET=ci-check-only npx next build` | → pass (compiled successfully) |

---

## Deviations from task

None

---

## Out-of-scope findings

None

---

## Part A — Audit claim verification

| # | Claim | Verdict | Actual location | Note |
|---|---|---|---|---|
| 1 | `compliance.tsx` has local STATUS_CONFIG (~L62-69) with "N/A" for NOT_APPLICABLE | **Confirmed** | `src/components/app/views/compliance.tsx:62-69` | Line 68: `NOT_APPLICABLE: { label: "N/A", ... }`. The local STATUS_CONFIG now includes AWAITING_REVIEW (added since audit), but NOT_APPLICABLE still says "N/A". |
| 2 | `vocabulary.ts` COMPLIANCE_STATUS_CONFIG (~L91-97) labels it "Not Applicable" | **Confirmed** | `src/lib/dashboard/vocabulary.ts:91-97` | Line 92: `label: "Not Applicable"`. |
| 3 | Compliance heading is "Compliance Matrix" (~L167) while VIEW_TITLES.compliance is "Compliance" | **Confirmed** | `src/components/app/views/compliance.tsx:168` (heading "Compliance Matrix"); `src/lib/dashboard/vocabulary.ts:318` (`compliance: "Compliance"`) | Audit said ~L167; actual is L168. One line off. |
| 4 | `retention-flag.ts` (~L46-47) has user-visible message mentioning NEXT_PUBLIC_RETENTION_ENABLED | **Confirmed** | `src/lib/retention-flag.ts:46-47` | Message: `"The retention workflow is not enabled. Set NEXT_PUBLIC_RETENTION_ENABLED=true to enable it."`. The API routes return this message in the JSON body `{ error: RETENTION_DISABLED_MESSAGE }` with HTTP 404 — not a bare 404. Verified in `src/app/api/retention/route.ts`, `src/app/api/legal-holds/[documentId]/place/route.ts`, and `src/app/api/dispositions/[documentId]/execute/route.ts`. |
| 5 | `tasks/[id]/route.ts` (~L153) returns error listing raw enum values | **Confirmed** | `src/app/api/tasks/[id]/route.ts:153` | `` `Field 'status' must be one of: ${VALID_STATUSES.join(", ")}.` `` → renders as `"Field 'status' must be one of: PENDING, IN_PROGRESS, COMPLETED, CANCELLED."` |
| 6 | `portal-shell.tsx` (~L67-81) defines local PORTAL_NAV and buildBreadcrumbs | **Confirmed** | `src/components/portal/portal-shell.tsx:67-81` | PORTAL_NAV at L67-73 (5 items); buildBreadcrumbs at L75-81. Both local, not imported from nav-structure.ts. |
| 7 | Notification date-grouping duplicated in app-shell (~L309-333) and portal-shell (~L132-150) | **Confirmed** | `src/components/app/app-shell.tsx:308-333`; `src/components/portal/portal-shell.tsx:131-152` | app-shell: L308-333 (26 lines). portal-shell: L131-152 (22 lines, more compact but identical logic). Portal version has comment "same as AppShell". |
| 8 | Neither app-shell nor portal-shell renders a footer | **Confirmed** | No `<footer>` element in `src/components/app/app-shell.tsx` or `src/components/portal/portal-shell.tsx` | Confirmed via grep — zero matches for "footer" in either file. The public-portal.tsx does have a `<footer>` at L257. |
| 9 | Two parallel status configs exist: vocabulary.ts and status-config.ts | **Confirmed** | `src/lib/dashboard/vocabulary.ts:55-98` (COMPLIANCE_STATUS_CONFIG); `src/lib/dashboard/status-config.ts:149-201` (STATUS_CONFIG) | See detailed comparison below. |
| 10 | `public-portal.tsx` (~L39-43) computes "Last updated" from union `updatedAt` | **Confirmed** | `src/components/app/public-portal.tsx:92-93` | `Math.max(...all.map((u) => new Date(u.updatedAt).getTime()))`. Audit said ~L39-43; actual is L92-93 (the function was refactored, line numbers shifted). |

### Claim 9 detailed comparison — two parallel status configs

| Aspect | `vocabulary.ts` COMPLIANCE_STATUS_CONFIG | `status-config.ts` STATUS_CONFIG |
|---|---|---|
| **Type** | `Record<ComplianceStatus, StatusConfig>` where StatusConfig has `{ label, icon, cell, dot, definition }` | `Record<ComplianceStatus, StatusConfig>` where StatusConfig has `{ label, colorToken, icon, definition }` |
| **Labels** | Compliant / Expiring / Overdue / Awaiting Review / Missing / **Not Applicable** | Compliant / Expiring / Overdue / Awaiting Review / Missing / **N/A** |
| **Colors** | Tailwind classes (`cell` + `dot`) | CSS variable tokens (`colorToken` like `var(--status-compliant)`) |
| **Definitions** | Hardcoded strings (e.g. "more than 90 days away") | Template strings interpolating `${EXPIRING_WINDOW_DAYS}` (e.g. "more than 90 days away") |
| **NOT_APPLICABLE label** | "Not Applicable" | "N/A" |
| **Used by** | Compliance view legend tooltips, StatusGlossary, Help guide, public glossary | Dashboard KPI tiles, dashboard composition bar, dashboard tooltips |
| **Overlap** | Same 6 statuses, same definitions (semantically), same icons | Same 6 statuses, same definitions (semantically), same icons |
| **Drift** | NOT_APPLICABLE label differs: "Not Applicable" vs "N/A" | ← same drift |

**Additional parallel configs**: `src/lib/compliance/calculator.ts` also exports `STATUS_BADGE_CLASSES` (Tailwind classes, L354-388) and `STATUS_LETTER` (single-letter codes, L399-406). Plus `compliance.tsx` has a third local copy (L62-69). So there are effectively **four** places where compliance status styling is defined.

---

## Part B — Counts

### Staff view components

**21 files** in `src/components/app/views/`:

```
account-security.tsx
api-keys.tsx
audit.tsx
calendar.tsx
compare.tsx
compliance.tsx
configure-rules.tsx
contact-requests.tsx
dashboard.tsx
document-detail.tsx
documents.tsx
help-guide.tsx
legislation.tsx
retention.tsx
reviews.tsx
search.tsx
security.tsx
tasks.tsx
unions.tsx
users.tsx
webhooks.tsx
```

### Page routes

**4 files** under `src/app/`:

| Route | File |
|---|---|
| `/` | `src/app/page.tsx` (root SPA) |
| `/portal` | `src/app/portal/page.tsx` (representative portal) |
| `/reports/compliance` | `src/app/reports/compliance/page.tsx` (printable report) |
| `/unions/[registrationNo]` | `src/app/unions/[registrationNo]/page.tsx` (public union detail) |

### Nav groups per role (via `getNavForRole`)

With `retentionEnabled=true`:

| Role | Count | Group names |
|---|---|---|
| REGISTRAR | 9 | Dashboard, Unions, Compliance, Tasks, Calendar, Work Queues, Search, Admin, Help |
| INSPECTOR | 8 | Dashboard, Unions, Compliance, Tasks, Calendar, Search, Admin, Help |
| OFFICER | 7 | Dashboard, Unions, Compliance, Tasks, Calendar, Search, Help |

With `retentionEnabled=false` (default): identical counts — the Work Queues group still has Review Queue + Contact Updates (2 items) even without Retention Queue, so the group survives.

---

## Part C — New findings from baseline

### C1: Trace `dashboard.tsx:1456` type error

**Where the counts object originates**: `src/components/app/views/dashboard.tsx:1456-1462`. The dashboard constructs a `ComplianceCounts` object by mapping the API response:

```typescript
const counts: ComplianceCounts | null = stats
  ? {
      COMPLIANT: stats.compliance.compliant,
      EXPIRING: stats.compliance.expiring,
      OVERDUE: stats.compliance.overdue,
      MISSING: stats.compliance.missing,
      NOT_APPLICABLE: stats.compliance.notApplicable,
    }
  : null;
```

The `AWAITING_REVIEW` key is **missing** from this object literal. The `ComplianceCounts` interface (defined in `src/lib/dashboard/metrics.ts:83-90`) requires it.

**Does the API return awaitingReview?**: No. `src/app/api/dashboard/stats/route.ts:66-128` has a switch statement (L74-77) that counts `COMPLIANT`, `EXPIRING`, `OVERDUE`, `MISSING` — but **no `case "AWAITING_REVIEW"`**. The `awaitingReview` count is never computed or returned. The `StatsResponse` interface in `dashboard.tsx:61-72` also lacks an `awaitingReview` field.

**Does the dashboard render an Awaiting Review KPI tile?**: Yes — indirectly. `getTileStatuses()` returns `APPLICABLE_STATUSES` which now includes `AWAITING_REVIEW` (5 statuses). The tile loop at `dashboard.tsx:1560` iterates all 5 statuses and calls `counts![status]` at L1591. For `AWAITING_REVIEW`, this evaluates to `counts!["AWAITING_REVIEW"]` which is `undefined` (the key doesn't exist on the object).

**Would it display undefined/NaN/blank at runtime?**: At runtime, `counts!["AWAITING_REVIEW"]` is `undefined`. The `StatCard` component receives `value={undefined}`. React renders `undefined` as nothing (blank) — not "undefined" text, not NaN. So the Awaiting Review tile would render with a **blank value** (no number), but the label "Awaiting Review" and the icon would still show. The tooltip definition would also show correctly (it comes from `STATUS_CONFIG`, not `counts`). The tile's click link (`complianceFilterUrl("AWAITING_REVIEW")`) would work correctly.

**Root cause chain**: `status-config.ts` was updated to add AWAITING_REVIEW to `APPLICABLE_STATUSES` → `getTileStatuses()` now returns 5 statuses → the dashboard tile loop tries to look up `counts["AWAITING_REVIEW"]` → but the dashboard stats API route was **not updated** to count or return `awaitingReview` → and the dashboard component's `counts` object literal was **not updated** to include the key. Three files need updating: the API route (add `case "AWAITING_REVIEW"` + return the count), the `StatsResponse` interface (add `awaitingReview: number`), and the `counts` object literal (add `AWAITING_REVIEW: stats.compliance.awaitingReview`).

### C2: Other places that enumerate compliance statuses and omit AWAITING_REVIEW

**Switch statements missing `case "AWAITING_REVIEW"`** (6 files):

| File | Switch count | Has AWAITING_REVIEW? |
|---|---|---|
| `src/app/api/dashboard/stats/route.ts` | 1 | No |
| `src/app/api/portal/dashboard/route.ts` | 1 | No |
| `src/app/api/export/stats/route.ts` | 1 | No |
| `src/app/api/public/stats/route.ts` | 1 | No |
| `src/app/reports/compliance/page.tsx` | 3 | No |
| `src/lib/compliance/report-html.ts` | 1 | **Yes** (already updated) |
| `src/lib/dashboard/snapshot.ts` | 1 | **Yes** (already updated) |

**Type literals missing AWAITING_REVIEW** (4 files):

| File | Line | Literal |
|---|---|---|
| `src/components/app/views/compliance.tsx` | L41 | `"COMPLIANT" \| "EXPIRING" \| "OVERDUE" \| "MISSING" \| "NOT_APPLICABLE"` |
| `src/components/app/views/compare.tsx` | L36 | same |
| `src/components/portal/views/compliance.tsx` | L23 | same |
| `src/app/reports/compliance/page.tsx` | L199 | `(["COMPLIANT", "EXPIRING", "OVERDUE", "MISSING", "NOT_APPLICABLE"] as const)` |

**Object literals missing AWAITING_REVIEW** (1 file):

| File | Line | Literal |
|---|---|---|
| `src/components/app/views/compliance.tsx` | L133 | `{ COMPLIANT: 0, EXPIRING: 0, OVERDUE: 0, MISSING: 0 }` (summary bar chart data) |

**Arithmetic missing AWAITING_REVIEW** (2 files):

| File | Line | Expression |
|---|---|---|
| `src/components/app/views/dashboard.tsx` | L706 | `counts.COMPLIANT + counts.EXPIRING + counts.OVERDUE + counts.MISSING` (sum for denominator) |
| `src/app/api/dashboard/stats/route.ts` | L86 | `compliant + expiring + overdue + missing` (applicable count) |

### C3: Why the build passes with 23 tsc errors

`next.config.ts` (lines 4-6) contains:

```typescript
typescript: {
  ignoreBuildErrors: true,
},
```

This tells Next.js to skip TypeScript type checking during `next build`. The build compiles TypeScript to JavaScript via the SWC compiler (which strips types without checking them), so type errors don't block the build. This is a common pattern in development/preview environments where type errors are tracked separately via `tsc --noEmit` but don't block deployment.

### C4: Is `db/custom.db` tracked in git?

**Yes** — `git ls-files db/custom.db` returns `db/custom.db`, confirming it is tracked.

**No** — it is **not** listed in `.gitignore`. The `.gitignore` file has no entry for `db/`, `*.db`, or `db/custom.db`. The database file is committed to the repository, which means every clone gets a copy of the data. This is unusual for a production project (databases are typically gitignored), but may be intentional for this demo/preview environment where the seed data should persist across session reverts.

---

## Summary

All 10 audit claims are **Confirmed**. Key findings beyond the audit:

1. **AWAITING_REVIEW is incompletely propagated** — the status was added to `status-config.ts` and `vocabulary.ts` but not to 6 switch statements, 4 type literals, 1 object literal, and 2 arithmetic expressions across `src/`. The dashboard KPI tile for Awaiting Review renders with a blank value at runtime because the stats API doesn't return the count.

2. **Four parallel status-config definitions exist** (vocabulary.ts, status-config.ts, calculator.ts, compliance.tsx local) — not just two as the audit claimed. The NOT_APPLICABLE label drifts between "Not Applicable" and "N/A" across these configs.

3. **`next.config.ts` has `ignoreBuildErrors: true`** — the build passes despite 23 TypeScript errors because type checking is skipped during compilation.

4. **`db/custom.db` is git-tracked** and not gitignored — unusual for a database file.
