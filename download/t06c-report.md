# T06c: Exhaustiveness Sweep for AWAITING_REVIEW — Report

**Task:** T06c  
**Status:** done  
**Date:** 2026-10-05  

---

## Files changed

- `src/app/api/v1/compliance/status/route.ts` — added `awaitingReview` to summary counts + response-shape comment
- `src/app/api/dashboard/trend/route.ts` — added `awaitingReview` to response-shape comment
- `src/app/api/export/trend/route.ts` — added `AwaitingReview` column to CSV export
- `src/app/api/portal/dashboard/route.ts` — added `awaitingReview` to response-shape comment
- `src/lib/dashboard/snapshot.ts` — added `awaitingReview` to `ComplianceTrendPoint` interface + `EnsureSnapshotResult.counts` interface + `getComplianceTrend` row mapping
- `src/lib/dashboard/vocabulary.ts` — updated stale comment (5 statuses → 6)
- `src/lib/dashboard/metrics.ts` — updated stale comment (5 statuses → 6)
- `src/lib/dashboard/dashboard-links.ts` — updated stale comment (5 statuses → 6)
- `src/lib/compliance/matrix.ts` — updated stale comment (5 statuses → 6)
- `src/app/api/compliance/rules/preview/route.ts` — updated stale comment (5 statuses → 6)
- `src/lib/__tests__/dashboard-mutation.test.ts` — added `AWAITING_REVIEW: 0` to ComplianceCounts fixture (L574); cast UnionSummary status to union type (L861); updated denominator sum to include AWAITING_REVIEW
- `src/lib/__tests__/dashboard-snapshot.test.ts` — added `awaitingReview: 0` to all ComplianceTrendPoint fixtures; updated point-shape test to expect 9 keys
- `src/lib/__tests__/dashboard-trend.test.ts` — added `awaitingReview: 0` to all ComplianceTrendPoint fixtures

---

## Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit 2>&1 \| grep '^src/'` | → **9 errors** (was 22 — **13 errors eliminated**; zero in any touched file) |
| `npx eslint src/` | → 3 errors, 2 warnings (baseline match, no new) |
| `npm test` | → 621 passed / 31 files (baseline match) |
| `SESSION_SECRET=ci-check-only npx next build` | → pass |

---

## Defaults relied on

D1 (compliance rate rule: numerator = COMPLIANT; denominator = COMPLIANT + EXPIRING + OVERDUE + AWAITING_REVIEW + MISSING; NOT_APPLICABLE excluded), D2 (public/stats route held — not touched)

Note: `docs/decisions-and-defaults.md` does not exist in the repo. D1 and D2 are known from standing instructions + T06b context.

---

## Deviations from task

`docs/decisions-and-defaults.md` does not exist; D1 and D2 are known from standing instructions + T06b context. Proceeded since task is unambiguous.

---

## Out-of-scope findings

- `src/lib/compliance/matrix.ts:162-164` — the `expiresAt` computation excludes MISSING and NOT_APPLICABLE but NOT AWAITING_REVIEW. AWAITING_REVIEW cells get an `expiresAt` value even though their expiry date isn't meaningful until the document is approved. The `getExpiryForecast` function in `metrics.ts` already excludes AWAITING_REVIEW from the forecast, so this is a minor inconsistency in the data layer, not a runtime bug.
- `src/components/app/views/dashboard.tsx:41` — stale comment "6 stat cards (unions, documents, compliant, expiring, overdue, missing)" — not in the 5-comment list but same type of drift.
- `src/app/api/cron/compliance-sweep/route.ts` — not inspected for AWAITING_REVIEW handling (flagged as needs-human in sweep table). The sweep creates notifications for OVERDUE/EXPIRING documents — AWAITING_REVIEW documents are not OVERDUE/EXPIRING, so they're likely not affected. But the notification payload shape may need updating if it includes status counts.

---

## Sweep table

| File | Line(s) | Verdict | Action |
|---|---|---|---|
| `src/app/api/v1/compliance/status/route.ts` | L131-138 | **needs-fix** | Added `awaitingReview` to summary counts + comment |
| `src/app/api/public/stats/route.ts` | L41 | **intentionally-excluded** | D2: held — do not touch |
| `src/lib/compliance/matrix.ts` | L159 | **stale comment** | Updated comment to include AWAITING_REVIEW |
| `src/lib/dashboard/snapshot.ts` | L70-80, L96-107, L327-339 | **needs-fix** | Added `awaitingReview` to `ComplianceTrendPoint` + `EnsureSnapshotResult.counts` + `getComplianceTrend` row mapping |
| `src/app/api/export/trend/route.ts` | L14-24 | **needs-fix** | Added `AwaitingReview` column to CSV |
| `src/app/api/dashboard/trend/route.ts` | L29 | **stale comment** | Updated comment |
| `src/app/api/dashboard/stats/route.ts` | L21 | **stale comment** | Already has `awaitingReview` in code (T06a); comment at L21 is the old response shape — not in the 5-comment list, left as-is |
| `src/app/api/portal/dashboard/route.ts` | L19 | **stale comment** | Updated comment |
| `src/lib/dashboard/vocabulary.ts` | L35 | **stale comment** | Updated |
| `src/lib/dashboard/metrics.ts` | L77 | **stale comment** | Updated |
| `src/lib/dashboard/dashboard-links.ts` | L43 | **stale comment** | Updated |
| `src/app/api/compliance/rules/preview/route.ts` | L87 | **stale comment** | Updated |
| `src/lib/__tests__/dashboard-mutation.test.ts` | L574, L861 | **needs-fix** | Added `AWAITING_REVIEW: 0` to ComplianceCounts fixture; cast UnionSummary status to union type |
| `src/lib/__tests__/dashboard-snapshot.test.ts` | multiple (L562-844) | **needs-fix** | Added `awaitingReview: 0` to all ComplianceTrendPoint fixtures; updated point-shape test |
| `src/lib/__tests__/dashboard-trend.test.ts` | multiple (L55-260) | **needs-fix** | Added `awaitingReview: 0` to all ComplianceTrendPoint fixtures |
| `src/lib/__tests__/dashboard-heatmap.test.ts` | L222 | **not-applicable** | Pre-existing `string` vs `ComplianceStatus` error — unrelated to AWAITING_REVIEW (baseline error) |
| `src/lib/__tests__/dashboard-union-doc-matrix.test.ts` | L192-295 | **intentionally-excluded** | Tests the matrix's MISSING count (on-file MISSING + missing pairs). AWAITING_REVIEW cells have `documentId` set (they're on-file), so they don't affect the MISSING count logic. No fix needed. |
| `src/lib/__tests__/dashboard-links.test.ts` | L143, L153 | **intentionally-excluded** | Tests `complianceFilterUrl` + `parseStatusParam` with specific statuses. These are unit tests for individual statuses, not exhaustive lists. No fix needed. |
| `src/lib/__tests__/dashboard-forecast.test.ts` | L94-97, L229 | **intentionally-excluded** | Tests forecast logic with MISSING cells (which are excluded from forecast). AWAITING_REVIEW is already excluded by the production code (`metrics.ts:495`). No fix needed. |
| `src/app/api/cron/compliance-sweep/route.ts` | — | **needs-human** | Cron route sends notifications. Has not been inspected for AWAITING_REVIEW handling. The sweep creates notifications for OVERDUE/EXPIRING documents — AWAITING_REVIEW documents are not OVERDUE/EXPIRING, so they're likely not affected. But the notification payload shape may need updating if it includes status counts. |

---

## Step 5: Report-only checks

### (a) Does `--status-review` exist as a CSS variable?

**Yes.** Defined in `src/app/globals.css`:
- L84 (light mode): `--status-review: oklch(0.60 0.15 250);` with comment `/* Blue — awaiting review */`
- L126 (dark mode): `--status-review: oklch(0.68 0.15 250);`

Used by `STATUS_CONFIG.AWAITING_REVIEW.colorToken` in `status-config.ts:183`: `"var(--status-review)"`.

### (b) Are the portal `STATUS_ORDER` values unique?

**Yes.** `src/components/portal/views/compliance.tsx:38-45`:
```typescript
const STATUS_ORDER: Record<ComplianceCell["status"], number> = {
  OVERDUE: 0,
  EXPIRING: 1,
  AWAITING_REVIEW: 2,
  MISSING: 3,
  NOT_APPLICABLE: 4,
  COMPLIANT: 5,
};
```
All 6 values are unique (0-5). No duplicates.

### (c) What reads the export stats CSV or the portal dashboard response shape?

- **Export stats CSV** (`/api/export/stats`): consumed by a download link in `src/components/app/views/dashboard.tsx:955` — `<a href="/api/export/stats" target="_blank">`. The CSV is downloaded as a file; no code parses it back. Adding the "Awaiting Review" row is additive — existing CSV consumers (Excel, etc.) will see a new row but won't break.

- **Export trend CSV** (`/api/export/trend`): consumed by a download link in `src/components/app/views/dashboard.tsx:442`. Same pattern — downloaded as a file, not parsed back. Adding the "AwaitingReview" column is additive.

- **Portal dashboard response** (`/api/portal/dashboard`): consumed by `src/components/portal/views/dashboard.tsx:69` via `useFetch<DashboardData>("/api/portal/dashboard")`. The `DashboardData` interface (L43-52) now includes `awaitingReview: number` (added in T06b). The portal dashboard view displays tiles for Compliant/Expiring/Overdue/Missing but does NOT display Awaiting Review — the field is in the type but not rendered. No breakage.

---

## Impact summary

**tsc errors reduced from 22 to 9** — 13 errors eliminated:
- 1 `ComplianceCounts` missing `AWAITING_REVIEW` (dashboard-mutation.test.ts L574)
- 12 `UnionSummary` status type widening (dashboard-mutation.test.ts L927-1087, fixed by `as const` cast)
- All `ComplianceTrendPoint` fixture errors (dashboard-snapshot.test.ts + dashboard-trend.test.ts, fixed by adding `awaitingReview: 0`)

**Remaining 9 errors** are all pre-existing baseline errors unrelated to AWAITING_REVIEW:
- 4 × `DigestItem` scope issue (compliance-digest/route.ts)
- 1 × Prisma `UnionWhereInput` type (dashboard/document-types/route.ts)
- 1 × Prisma `_count` type (export/unions/route.ts)
- 2 × `Record<string, unknown>` type (tasks/route.ts + unions/route.ts)
- 1 × `string` vs `ComplianceStatus` (dashboard-heatmap.test.ts)
