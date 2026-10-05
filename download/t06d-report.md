# T06d: AWAITING_REVIEW Residual Items — Report

**Task:** T06d  
**Status:** needs-human (scoping report — no code changes)  
**Date:** 2026-10-05

---

## Summary

T06d is a scoping report for the residual AWAITING_REVIEW items that T06c identified but did not fix. T06a/T06b/T06c completed the AWAITING_REVIEW rollout across the dashboard, portal, exports, report HTML, type literals, comments, and tests. Four items remained, three of them flagged as "out-of-scope findings" or "needs-human" in T06c. T06d captures all four in one place, classifies each as **fix-now** vs **needs-human**, and proposes concrete changes for each.

**No code changes were made in T06d.** This is the planning artifact for the next code-bearing task. The four items differ in risk: two are safe mechanical fixes (matrix.ts `expiresAt` exclusion + dashboard.tsx stale comment), one is a real false-notification bug that needs a small code change plus a regression test (cron compliance-sweep), and one is a policy decision held by D2 (public stats route).

---

## Files in scope

| File | Lines | Issue | Class |
|---|---|---|---|
| `src/lib/compliance/matrix.ts` | L162-164 | `expiresAt` is computed for AWAITING_REVIEW cells (only MISSING + NOT_APPLICABLE are excluded). The comment at L158-161 was fixed in T06c but the exclusion list at L162-163 wasn't. | **fix-now** (data-layer inconsistency) |
| `src/app/api/cron/compliance-sweep/route.ts` | L102-119 | The sweep iterates cells with `expiresAt` and computes daysUntilExpiry. Because matrix.ts returns an `expiresAt` for AWAITING_REVIEW cells, the sweep can fire EXPIRING/OVERDUE notifications for documents that have not been approved yet. Zero `AWAITING_REVIEW` references in the file. | **fix-now** (false-notification bug) |
| `src/components/app/views/dashboard.tsx` | L41 | Stale comment: "6 stat cards (unions, documents, compliant, expiring, overdue, missing)". Doesn't include "awaiting review". | **fix-now** (stale comment) |
| `src/app/api/public/stats/route.ts` | L37-43 | Switch has no `case "AWAITING_REVIEW"` — cells are silently dropped from `applicable`, undercounting the denominator. The public rate is overstated whenever any document is awaiting review. | **needs-human** (held by D2) |

---

## Verification (current state, no changes)

| Command | Result |
|---|---|
| `npx tsc --noEmit 2>&1 \| grep '^src/' \| wc -l` | → **9 errors** (baseline match — same 9 as T06c) |
| `grep -n "AWAITING_REVIEW" src/lib/compliance/matrix.ts` | → 1 hit (L159, comment only — the code at L162-163 still doesn't exclude it) |
| `grep -n "AWAITING_REVIEW" src/app/api/cron/compliance-sweep/route.ts` | → 0 hits (the sweep has no AWAITING_REVIEW awareness) |
| `grep -n "AWAITING_REVIEW" src/app/api/public/stats/route.ts` | → 0 hits (the public rate still omits it) |
| `grep -n "AWAITING_REVIEW" src/components/app/views/dashboard.tsx \| head -5` | → multiple hits in code (T06a added them); the L41 comment is still stale |

---

## Defaults relied on

D1 (compliance rate rule: numerator = COMPLIANT; denominator = COMPLIANT + EXPIRING + OVERDUE + AWAITING_REVIEW + MISSING; NOT_APPLICABLE excluded), D2 (public/stats route held — not touched in T06d), D8 (the 9 baseline type errors are pre-existing and unrelated to AWAITING_REVIEW — leave the `ignoreBuildErrors` flag).

`docs/decisions-and-defaults.md` exists in the repo (added in commit `e1b2370`). D1, D2, and D8 are documented at lines 43-49, 51-57, and 79-80 respectively.

---

## Item 1: matrix.ts `expiresAt` excludes AWAITING_REVIEW in comment only

### Current state

`src/lib/compliance/matrix.ts:158-165`:

```typescript
// expiresAt is only meaningful for ACTIVE filings
// (COMPLIANT / EXPIRING / OVERDUE). For AWAITING_REVIEW / MISSING /
// NOT_APPLICABLE, it's null — see /api/compliance/route.ts for the
// full rationale.
const expiresAt =
  latestVersion && status !== "NOT_APPLICABLE" && status !== "MISSING"
    ? computeExpiryDate(latestVersion.uploadedAt, rule.renewalYears).toISOString()
    : null;
```

The comment (updated in T06c) says AWAITING_REVIEW cells get `expiresAt: null`. The code (not updated in T06c) still returns a real expiry date for AWAITING_REVIEW cells. This is a documentation/code mismatch — the comment lies about the runtime behavior.

### Why this matters

AWAITING_REVIEW documents have a `latestVersion` (the union uploaded something), so `latestVersion` is truthy. They're not NOT_APPLICABLE and not MISSING. So `expiresAt` is computed from the upload date + `rule.renewalYears`. But the renewal clock shouldn't start until the Registrar approves — a document that sat in review for 6 months shouldn't show as "expires in 6 months" when it's finally approved.

This is the root cause of Item 2 below: the cron sweep reads `expiresAt` and assumes it's meaningful.

### Proposed fix

```typescript
const expiresAt =
  latestVersion &&
  status !== "NOT_APPLICABLE" &&
  status !== "MISSING" &&
  status !== "AWAITING_REVIEW"
    ? computeExpiryDate(latestVersion.uploadedAt, rule.renewalYears).toISOString()
    : null;
```

One line added. No type changes — `expiresAt` stays `string | null`. No test changes needed — existing tests assert `expiresAt` for COMPLIANT/EXPIRING/OVERDUE cells and `null` for MISSING/NOT_APPLICABLE; the new behavior adds AWAITING_REVIEW to the `null` set, which is what the comment already claimed.

### Risk

Low. The only consumers of `expiresAt` are:

- The cron compliance-sweep (Item 2 — this fix makes the sweep correct)
- The compliance matrix API response (cells rendered in the staff + portal compliance views)
- The expiry forecast (`getExpiryForecast` in `metrics.ts` — already excludes AWAITING_REVIEW explicitly at L495, so it never read the bogus `expiresAt` anyway)

None of these consumers depend on AWAITING_REVIEW cells having a non-null `expiresAt`. The fix is strictly more correct.

---

## Item 2: cron compliance-sweep can fire false notifications for AWAITING_REVIEW

### Current state

`src/app/api/cron/compliance-sweep/route.ts:102-119`:

```typescript
for (const row of matrix.unions) {
  for (const cell of row.scores) {
    if (!cell.expiresAt) continue;                              // ← L104
    const renewalYears = renewalByType.get(cell.documentType) ?? 1;
    if (renewalYears >= 99) continue;                            // ← L106 (NOT_APPLICABLE rule)
    const expiryMs = new Date(cell.expiresAt).getTime();
    const daysUntil = Math.floor((expiryMs - nowMs) / msPerDay);
    let tier: Tier | null = null;
    if (daysUntil < -30) tier = "T_30_OVERDUE";
    else if (daysUntil < 0) tier = "T_0_OVERDUE";
    else if (daysUntil <= 30) tier = "T_30_DAYS";
    else if (daysUntil <= 90) tier = "T_90_DAYS";
    else if (daysUntil <= 180 && renewalYears >= 3) tier = "T_180_DAYS";
    if (tier) {
      issues.push({ /* ... */ });
    }
  }
}
```

Because Item 1 returns a non-null `expiresAt` for AWAITING_REVIEW cells, the `if (!cell.expiresAt) continue;` guard at L104 does NOT skip them. An AWAITING_REVIEW document uploaded 340 days ago on a 1-year cycle would have `daysUntilExpiry = 25` → tier `T_30_DAYS` → "URGENT: … expires in 25 days" notification fired. But the document hasn't been approved yet — its "expiry" is meaningless.

### Why this matters

This is a real false-notification bug, not a theoretical risk. On the current seed data (20 AWAITING_REVIEW cells), the sweep would fire notifications for any of them whose upload date is close to the renewal window. The notification titles say "URGENT RENEWAL WARNING" and "Notice of Non-Compliance" — these would confuse the Officer (who already uploaded; they're waiting on the Registrar) and the Registrar (who already knows there's a review backlog).

The bug is silent in dev (no seed data triggers it on today's date) but would fire in production as soon as a real AWAITING_REVIEW document aged past its renewal window. The `T_0_OVERDUE` and `T_30_OVERDUE` tiers also auto-create Non-Compliance tasks assigned to the Officer — so the bug creates spurious tasks too.

### Proposed fix

Two options, in increasing order of correctness:

**Option A (minimum):** Skip AWAITING_REVIEW cells explicitly in the sweep.

```typescript
for (const cell of row.scores) {
  if (!cell.expiresAt) continue;
  if (cell.status === "AWAITING_REVIEW") continue;              // ← new line
  // ... rest unchanged
}
```

This depends on Item 1 being fixed first (otherwise the `if (!cell.expiresAt) continue;` guard already handles it — AWAITING_REVIEW cells would have `expiresAt: null` and be skipped). If Item 1 is fixed, Option A is redundant but defensive.

**Option B (better):** Fix Item 1, then add a regression test that seeds an AWAITING_REVIEW document with an old upload date and asserts the sweep does NOT create a notification for it.

Recommended: do both. Fix Item 1 (which makes the `expiresAt: null`), then add the regression test to prevent a future regression where someone "fixes" the `expiresAt` computation back to including AWAITING_REVIEW.

### Risk

Low. The sweep already skips cells with `expiresAt: null` (MISSING, NOT_APPLICABLE). Adding AWAITING_REVIEW to that set is consistent with the existing behavior — no notifications are lost, only false ones are suppressed.

---

## Item 3: dashboard.tsx L41 stale comment

### Current state

`src/components/app/views/dashboard.tsx:37-48`:

```typescript
// =============================================================================
// Dashboard view — the landing page for authenticated users.
//
// Shows:
//   - 6 stat cards (unions, documents, compliant, expiring, overdue, missing)
//   - Compliance summary (overall rate + breakdown)
//   - Recent activity feed (latest 20 audit log entries)
//
// Each section loads independently — the stats fetch and the activity
// fetch are separate, so a slow activity endpoint doesn't block the
// stats from rendering.
// =============================================================================
```

The "6 stat cards (unions, documents, compliant, expiring, overdue, missing)" comment doesn't include "awaiting review". After T06a, the dashboard renders 5 compliance tiles (Compliant, Expiring, Overdue, Awaiting Review, Missing) plus the Unions and Documents tiles — so the comment is both numerically wrong (says 6, is 7) and list-wise wrong (omits Awaiting Review).

### Why this matters

Pure documentation drift. No runtime impact. But the T06c sweep explicitly listed this comment as out-of-scope to keep the change set focused on code correctness; T06d is the right place to clean it up.

### Proposed fix

```typescript
//   - 7 stat cards (unions, documents, compliant, expiring, overdue, awaiting review, missing)
```

One line. No code changes. No test changes.

### Risk

Zero. Comment-only change.

---

## Item 4: public stats route — held by D2

### Current state

`src/app/api/public/stats/route.ts:37-44`:

```typescript
switch (cell.status) {
  case "COMPLIANT": compliant++; applicable++; break;
  case "EXPIRING":
  case "OVERDUE":
  case "MISSING": applicable++; break;
}
```

No `case "AWAITING_REVIEW"` — cells are silently dropped from `applicable`, undercounting the denominator. The public `overallComplianceRate` is overstated whenever any document is awaiting review.

### Why this matters

This is the only remaining route that still drops AWAITING_REVIEW cells. Every other route (staff dashboard, portal dashboard, export stats, export trend, report HTML, snapshot) was fixed in T06a/T06b/T06c. The public rate is the lone outlier.

### Why this is held (not fix-now)

D2 (in `docs/decisions-and-defaults.md:51-57`) holds this route pending a Registrar decision. The rationale, copied from the decisions register:

> **Finding (T08):** the premise "no public rate" is false. `GET /api/public/stats` is reachable without authentication, has no rate limiting, and already returns `overallComplianceRate`, computed without AWAITING_REVIEW in the denominator, so it is overstated whenever any document is compliant. No page displays it and nothing documents it as an external API, but anyone can read it.
>
> **Default:** no change to the route's behavior or fields yet. Any change to a published figure should be deliberate (this is an official register).
>
> **Status:** the app is not live, so no figure has been published and nothing needs retracting. This is a launch gate: decide it with D1 before go-live.

The decision to align the public rate with the D1 rule (or to remove the `overallComplianceRate` field entirely, or to leave it as-is) belongs to the Registrar, not to a code-bearing task. T06d does not touch this route.

### What T06d does instead

Documents the gap so the checkpoint agenda (proposed 2026-10-19, see `docs/decisions-and-defaults.md:118-123`) has a single concrete artifact to point at. Three options for the Registrar to choose from:

1. **Align:** add `case "AWAITING_REVIEW": applicable++; break;` to the switch. The public rate matches the staff rate. Same before/after as the other routes (denominator 58 → 78 on seed data; rate 0% → 0% because 0 COMPLIANT cells).
2. **Remove:** delete the `overallComplianceRate` field from the response. No public rate is published. The route still returns `totalUnions`, `activeUnions`, `totalDocuments`.
3. **Hold:** leave the route as-is. The public rate stays overstated. Acceptable only if no consumer ever displays it.

The default if the Registrar doesn't answer by the checkpoint is Option 1 (align), per D1's "guardrails until decided" clause: the rule lives in `computeRateFromCounts()` only, and the public route should use it.

---

## Out-of-scope findings (new, surfaced during T06d scoping)

- **`src/app/api/cron/compliance-sweep/route.ts:300-302`** — the webhook dispatch path checks `cell.status === "EXPIRING" || cell.status === "OVERDUE"` to decide which unions to emit a `COMPLIANCE_STATUS_CHANGE` event for. This is correct (AWAITING_REVIEW shouldn't trigger a status-change webhook), but it means the webhook path and the notification path use different filters. If Item 2 is fixed by skipping AWAITING_REVIEW cells at the top of the loop, the webhook path's filter becomes redundant — a future cleanup could simplify it. Not in scope for T06d.

- **`src/lib/dashboard/metrics.ts:495`** — `getExpiryForecast` already excludes AWAITING_REVIEW from the forecast (added in the original AWAITING_REVIEW rollout). Once Item 1 is fixed, the explicit exclusion in `getExpiryForecast` becomes redundant (AWAITING_REVIEW cells will have `expiresAt: null` and be filtered out by the `expiresAt` check). Leaving the explicit exclusion is defensive — if someone later "fixes" the `expiresAt` computation back, the forecast stays correct. Not in scope for T06d.

---

## Sweep table

| File | Line(s) | Verdict | Action |
|---|---|---|---|
| `src/lib/compliance/matrix.ts` | L162-164 | **needs-fix** | Add `status !== "AWAITING_REVIEW"` to the `expiresAt` condition. One-line change. (Item 1) |
| `src/app/api/cron/compliance-sweep/route.ts` | L102-119 | **needs-fix** | After Item 1, AWAITING_REVIEW cells will be skipped by the `!cell.expiresAt` guard. Add a regression test. (Item 2) |
| `src/components/app/views/dashboard.tsx` | L41 | **stale comment** | Update "6 stat cards" → "7 stat cards" + add "awaiting review" to the list. (Item 3) |
| `src/app/api/public/stats/route.ts` | L37-43 | **held (D2)** | No code change in T06d. Decision belongs to the Registrar at the 2026-10-19 checkpoint. (Item 4) |
| `src/app/api/cron/compliance-sweep/route.ts` | L300-302 | **intentionally-excluded** | Webhook path's EXPIRING/OVERDUE filter is correct; becomes redundant after Item 2 but cleanup is out of scope. |
| `src/lib/dashboard/metrics.ts` | L495 | **intentionally-excluded** | `getExpiryForecast`'s explicit AWAITING_REVIEW exclusion is defensive; leave as-is. |

---

## Impact summary

T06d is a scoping report — **zero code changes, zero test changes, zero build impact.** The 9 baseline `tsc` errors are unchanged from T06c.

The next code-bearing task should:

1. Fix Item 1 (matrix.ts `expiresAt` exclusion) — one line.
2. Fix Item 2 (cron compliance-sweep regression test) — one new test file. The fix itself is implied by Item 1.
3. Fix Item 3 (dashboard.tsx L41 comment) — one line.
4. Hold Item 4 (public stats route) for the Registrar's decision at the 2026-10-19 checkpoint. Default if no answer: align with D1.

Items 1-3 are safe to ship together in a single PR. Item 4 is a launch gate, not a code task.
