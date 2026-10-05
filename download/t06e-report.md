# T06e: Finish the review items the earlier read-only session skipped — Report

**Task:** T06e (read-only)  
**Status:** done  
**Date:** 2026-10-05  
**Branch:** none (read-only task — no branch, no commit)  
**Commits:** none

---

## Verification (baseline, no changes made)

| Command | Result |
|---|---|
| `npm run typecheck 2>&1 \| grep '^src/' \| wc -l` | 0 (baseline match) |
| `npm run lint` | 3 errors, 2 warnings (baseline match) |
| `npm test` | 631 passed / 34 files (baseline match) |
| `SESSION_SECRET=ci-check-only npx next build` | pass |
| `git status` | no modified files (db/custom.db unmodified) |

No source edits. No database writes. No scripts left in the repo. No branch, no commit.

---

## Item 1: Digest + snapshot crons + notification builders

| File | File:line | Verdict | Evidence |
|---|---|---|---|
| `src/app/api/cron/compliance-digest/route.ts` | L57-78 | **omits AWAITING_REVIEW (harmless)** | The digest iterates `cell.expiresAt` (L59: `if (!cell.expiresAt) continue;`). After T50, AWAITING_REVIEW cells have `expiresAt: null`, so they're skipped. The digest only reports overdue/expiring documents — it never tallied AWAITING_REVIEW and doesn't need to. No status counts in the payload; just buckets by days-until-expiry. |
| `src/app/api/cron/compliance-snapshot/route.ts` | L72-79 | **fine** | Delegates to `ensureSnapshotForToday()` in `src/lib/dashboard/snapshot.ts`. That function tallies all 6 statuses including `awaitingReview` (L169: `case "AWAITING_REVIEW": awaitingReview++`) and includes it in `rateDenominator` (L180). D1-compliant. |
| `src/lib/notifications.ts` | L84-175 | **fine (status-agnostic)** | Generic helper — takes `title`/`body`/`dedupKey`/`type` from the caller. No compliance-status references. Doesn't tally, filter, or choose recipients by status. |

### Evidence quotes

**`src/app/api/cron/compliance-digest/route.ts:57-78`** — the digest's issue-collection loop:
```typescript
for (const row of matrix.unions) {
  for (const cell of row.scores) {
    if (!cell.expiresAt) continue;
    const renewalYears = renewalByType.get(cell.documentType) ?? 1;
    if (renewalYears >= 99) continue;
    const expiryMs = new Date(cell.expiresAt).getTime();
    const daysUntil = Math.floor((expiryMs - nowMs) / msPerDay);
    ...
    if (daysUntil < 0) overdue.push(item);
    else if (daysUntil <= 30) expiring30.push(item);
    else if (daysUntil <= 90) expiring90.push(item);
  }
}
```
No AWAITING_REVIEW reference. After T50, AWAITING_REVIEW cells have `expiresAt: null` and are skipped by `if (!cell.expiresAt) continue;`. Harmless.

**`src/lib/dashboard/snapshot.ts:169-181`** — the snapshot tally:
```typescript
case "AWAITING_REVIEW": awaitingReview++;  break;
...
const rateDenominator = compliant + expiring + overdue + awaitingReview + missing;
return { compliant, expiring, overdue, awaitingReview, missing, rateNumerator, rateDenominator };
```
D1-compliant: AWAITING_REVIEW is tallied and included in the denominator.

**`src/lib/notifications.ts:84-175`** — `createNotification()` signature takes `title`, `body`, `dedupKey`, `type`, `linkUrl`. No status references. Status-agnostic.

---

## Item 2: Webhook payload builders + event types

| File | File:line | Verdict | Evidence |
|---|---|---|---|
| `src/lib/webhooks/dispatcher.ts` | L83-144 | **fine (generic)** | `dispatchEvent(event)` takes any `payload: Record<string, unknown>` from the caller. The dispatcher doesn't build payloads — it just signs + delivers them. No status counts or status lists in the dispatcher. |
| `src/app/api/cron/compliance-sweep/route.ts` | L313-324 | **omits AWAITING_REVIEW (harmless)** | The `COMPLIANCE_STATUS_CHANGE` payload contains: `unionId`, `unionName`, `previousScore`, `currentScore`, `issuesCount`, `sweptAt`. No status counts or status lists. `issuesCount` is the count of sweep issues (overdue/expiring) for that union — AWAITING_REVIEW isn't an "issue" so its absence is correct. |
| `prisma/schema.prisma` | L501-507 | **fine** | `enum WebhookEventType` has 5 values: `COMPLIANCE_STATUS_CHANGE`, `DOCUMENT_UPLOADED`, `DOCUMENT_REVIEWED`, `CONTACT_UPDATE_SUBMITTED`, `CONTACT_UPDATE_REVIEWED`. No status-count fields. |
| `src/components/app/views/webhooks.tsx` | L66-72 | **payload shape NOT documented** | The webhooks UI lists event types (labels only: "Compliance Status Change", etc.) but does NOT document the payload shape (fields, types, examples). No help text, no docs link, no JSON example. |

### Evidence quotes

**`src/app/api/cron/compliance-sweep/route.ts:313-324`** — the webhook payload:
```typescript
const result = await dispatchEvent({
  eventType: WebhookEventType.COMPLIANCE_STATUS_CHANGE,
  payload: {
    unionId: change.unionId,
    unionName: change.unionName,
    previousScore: change.previousScore,
    currentScore: change.currentScore,
    issuesCount: issues.filter((i) => i.unionId === change.unionId).length,
    sweptAt: now.toISOString(),
  },
});
```
No status counts or status lists. AWAITING_REVIEW is not represented, but it's not an "issue" (the sweep only fires on EXPIRING/OVERDUE), so its absence is correct.

**`prisma/schema.prisma:501-507`** — the enum:
```
enum WebhookEventType {
  COMPLIANCE_STATUS_CHANGE
  DOCUMENT_UPLOADED
  DOCUMENT_REVIEWED
  CONTACT_UPDATE_SUBMITTED
  CONTACT_UPDATE_REVIEWED
}
```

**Is the payload shape documented anywhere?** No. The webhooks UI (`webhooks.tsx:66-72`) lists event type labels but not payload shapes. The API-key screen (`api-keys.tsx:38-47`) lists scopes but not endpoint shapes. A grep for `webhook.*payload` in the UI components found nothing.

---

## Item 3: v1/compliance/status route

| File | File:line | Verdict | Evidence |
|---|---|---|---|
| `src/app/api/v1/compliance/status/route.ts` | L132-139 | **fine — `awaitingReview` in summary** | Summary counts include `awaitingReview: requirements.filter((r) => r.status === "AWAITING_REVIEW").length` (L136). |
| `src/app/api/v1/compliance/status/route.ts` | L141-150 | **does NOT compute a percentage/rate/applicable total** | The response returns `overallScore` (from the matrix, L145) and `summary` counts (L146). No `rate`, `percentage`, or `applicable` field is computed. The route doesn't call `computeRateFromCounts()`. Since there's no rate, the D1 rule isn't violated — but it's also not applied. |
| `src/app/api/v1/compliance/status/route.ts` | L30-39 | **v1 API NOT documented** | The response shape is documented in the route's header comment (L30-39) but NOT in any user-facing UI. The API-key screen lists the `compliance:read` scope (L44) but doesn't document the endpoint, its query params, or its response shape. No docs link from the API-key screen. |

### Evidence quotes

**`src/app/api/v1/compliance/status/route.ts:132-139`** — the summary:
```typescript
const summary = {
  compliant: requirements.filter((r) => r.status === "COMPLIANT").length,
  expiring: requirements.filter((r) => r.status === "EXPIRING").length,
  overdue: requirements.filter((r) => r.status === "OVERDUE").length,
  awaitingReview: requirements.filter((r) => r.status === "AWAITING_REVIEW").length,
  missing: requirements.filter((r) => r.status === "MISSING").length,
  notApplicable: requirements.filter((r) => r.status === "NOT_APPLICABLE").length,
};
```

**`src/app/api/v1/compliance/status/route.ts:141-150`** — the response:
```typescript
return NextResponse.json(
  {
    union,
    generatedAt: matrix.generatedAt,
    overallScore: row.overallScore,
    summary,
    requirements,
  },
  { headers: rlHeaders },
);
```
No `rate`, `percentage`, or `applicable` field. The route doesn't call `computeRateFromCounts()`. D1 is not violated (no rate computed), but it's also not applied.

---

## Item 4: Filters and option lists

| File | File:line | Verdict | Evidence |
|---|---|---|---|
| `src/app/api/calendar/route.ts` | L134 | **fine (intentional)** | `if (cell.status === "EXPIRING" \|\| cell.status === "OVERDUE")` — the calendar only shows expiring/overdue documents (not a status filter; a relevance filter). AWAITING_REVIEW isn't a calendar-relevant status. |
| `src/components/app/views/search.tsx` | L51, L113 | **fine (different vocabulary)** | Search filters by `reviewStatus` (PENDING/APPROVED/REJECTED) — that's document review status, not compliance status. AWAITING_REVIEW is a compliance status; it's not applicable here. |
| `src/components/app/views/compare.tsx` | L56-63 | **fine** | `STATUS_LETTER` includes all 6 statuses (COMPLIANT, EXPIRING, OVERDUE, AWAITING_REVIEW="R", MISSING, NOT_APPLICABLE). |
| `src/components/app/views/documents.tsx` | L51, L100 | **fine (different vocabulary)** | Documents list filters by `reviewStatus` (PENDING/APPROVED/REJECTED), not compliance status. |
| `src/lib/dashboard/dashboard-links.ts` | L46-48, L76-84 | **fine** | `complianceFilterUrl()` accepts any `ComplianceStatus` except NOT_APPLICABLE (L47-48 throws). `parseStatusParam()` validates against `APPLICABLE_STATUSES` (L80) which includes AWAITING_REVIEW. |

**No status filter or option list omits AWAITING_REVIEW** where it should be present.

### Evidence quotes

**`src/lib/dashboard/dashboard-links.ts:46-48`**:
```typescript
export function complianceFilterUrl(status: ComplianceStatus): string {
  if (status === "NOT_APPLICABLE") {
    throw new Error("Cannot filter by NOT_APPLICABLE — it is excluded from the compliance matrix.");
```

**`src/lib/dashboard/dashboard-links.ts:76-84`**:
```typescript
export function parseStatusParam(value: string | null): ComplianceStatus | null {
  if (!value) return null;
  const normalized = value.toUpperCase();
  if (APPLICABLE_STATUSES.includes(normalized as ComplianceStatus)) {
    return normalized as ComplianceStatus;
  }
  return null;
}
```
`APPLICABLE_STATUSES` (defined in `status-config.ts:125-131`) includes `"AWAITING_REVIEW"`.

---

## Item 5: PROVISIONAL comments

| File | File:line | Comment | D-reference? |
|---|---|---|---|
| `src/app/api/cron/compliance-snapshot/route.ts` | L18 | `Re-invoking on the same UTC day overwrites today's row (PROVISIONAL).` | No D-reference — snapshot idempotency, not a register decision. |
| `src/lib/__tests__/dashboard-trend.test.ts` | L492 | `Step 4: Re-trigger today's snapshot (PROVISIONAL — overwrites today's row).` | No D-reference — mirrors L18. |
| `src/lib/dashboard/vocabulary.ts` | L57 | `// PROVISIONAL(D4): see docs/decisions-and-defaults.md` | **D4** — correct (label policy). |
| `src/lib/dashboard/snapshot.ts` | L211 | `current — today's row is PROVISIONAL.` | No D-reference — snapshot idempotency. |
| `src/lib/dashboard/snapshot.ts` | L263 | `Today's row already exists — OVERWRITE with current values (PROVISIONAL).` | No D-reference — snapshot idempotency. |

**Is there a `PROVISIONAL(D1)` comment at `computeRateFromCounts`?** **No.**

`src/lib/dashboard/metrics.ts:191-198`:
```typescript
export function computeRateFromCounts(counts: ComplianceCounts): ComplianceRate {
  const numerator = counts.COMPLIANT;
  const denominator =
    counts.COMPLIANT + counts.EXPIRING + counts.OVERDUE + counts.AWAITING_REVIEW + counts.MISSING;
  const percentage =
    denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
  return { numerator, denominator, percentage };
}
```

The function implements the D1 rule (numerator = COMPLIANT, denominator = COMPLIANT + EXPIRING + OVERDUE + AWAITING_REVIEW + MISSING) but does NOT carry a `// PROVISIONAL(D1)` comment. The decisions register says: "Code that depends on a provisional default carries a comment `// PROVISIONAL(D<n>): see docs/decisions-and-defaults.md` in ONE place per decision." D1 is OPEN/provisional, so the comment should be here. (Report only per task — not fixing.)

---

## Item 6: Awaiting Review tile data flow

| Step | File:line | Evidence |
|---|---|---|
| 1. Stats route computes counts | `src/app/api/dashboard/stats/route.ts:109` | `awaitingReview: counts.AWAITING_REVIEW` — the route uses `tallyStatuses()` which counts all 6 statuses, then maps `counts.AWAITING_REVIEW` to the response's `awaitingReview` field. |
| 2. Dashboard fetches stats | `src/components/app/views/dashboard.tsx:65` | `awaitingReview: number;` in the `StatsResponse.compliance` interface. |
| 3. Dashboard maps to counts | `src/components/app/views/dashboard.tsx:1464` | `AWAITING_REVIEW: stats.compliance.awaitingReview` — maps the API's lowercase key to the canonical `ComplianceCounts` shape. |
| 4. Dashboard renders tile | `src/components/app/views/dashboard.tsx:1564-1604` | `getTileStatuses().map((status) => ...)` iterates `APPLICABLE_STATUSES` (includes AWAITING_REVIEW). For each status, renders `<StatCard value={counts![status]} ... />`. |
| 5. `getTileStatuses()` includes AWAITING_REVIEW | `src/lib/dashboard/status-config.ts:275-277` | `return APPLICABLE_STATUSES;` — and `APPLICABLE_STATUSES` (L125-131) includes `"AWAITING_REVIEW"`. |

**Confirmed: the Awaiting Review tile shows a number (not blank).** The data flows end-to-end:

1. `src/app/api/dashboard/stats/route.ts:109` — `awaitingReview: counts.AWAITING_REVIEW` (response field)
2. `src/components/app/views/dashboard.tsx:65` — `awaitingReview: number;` (interface)
3. `src/components/app/views/dashboard.tsx:1464` — `AWAITING_REVIEW: stats.compliance.awaitingReview` (mapping to counts)
4. `src/components/app/views/dashboard.tsx:1564` — `getTileStatuses().map(...)` iterates APPLICABLE_STATUSES (includes AWAITING_REVIEW)
5. `src/components/app/views/dashboard.tsx:1593` — `<StatCard value={counts![status]} ... />` renders the count
6. `src/lib/dashboard/status-config.ts:275-277` — `getTileStatuses()` returns `APPLICABLE_STATUSES`
7. `src/lib/dashboard/status-config.ts:125-131` — `APPLICABLE_STATUSES` includes `"AWAITING_REVIEW"`

The tile label comes from `STATUS_CONFIG[status].label` (L1592) which is "Awaiting Review" (per T20's vocabulary consolidation).

---

## Prioritized needs-fix items

1. **`src/lib/dashboard/metrics.ts:191` — missing `PROVISIONAL(D1)` comment at `computeRateFromCounts`.** The function implements the D1 rule but doesn't carry the provisional marker. The decisions register says "Code that depends on a provisional default carries a comment `// PROVISIONAL(D<n>): see docs/decisions-and-defaults.md` in ONE place per decision." D1 is OPEN/provisional, so the comment should be here. (Report only per task — not fixing.)

2. **Webhook payload shape not documented.** The webhooks UI (`src/components/app/views/webhooks.tsx:66-72`) lists event type labels but not payload fields. External systems integrating via webhook have no documentation of what fields to expect in `COMPLIANCE_STATUS_CHANGE` (or any other event). The payload shape is only documented in the route's header comment (`compliance-sweep/route.ts:316-323`), which is not user-facing.

3. **v1 API not documented.** The `/api/v1/compliance/status` endpoint is not documented in any user-facing UI. The API-key screen (`src/components/app/views/api-keys.tsx:38-47`) lists the `compliance:read` scope but doesn't document the endpoint, query params, or response shape. External systems have no docs to integrate against.

4. **`src/components/app/views/dashboard.tsx:41` — stale comment still says "6 stat cards".** On main (where this read-only task runs), the comment at L41 still says "6 stat cards (unions, documents, compliant, expiring, overdue, missing)". This is a needs-fix item on main, but it's already fixed on the T50 branch (`fix/t50-awaiting-review-no-expiry`) which is ready to merge.

---

## Standard report block

**Task:** T06e  
**Status:** done (read-only)  
**Branch:** none (read-only task — no branch, no commit)  
**Commits:** none  
**Files changed:** none  
**Verification:**
- `npm run typecheck 2>&1 | grep '^src/'` → 0 errors (baseline match)
- `npm run lint` → 3 errors, 2 warnings (baseline match)
- `npm test` → 631 passed / 34 files (baseline match)
- `SESSION_SECRET=ci-check-only npx next build` → pass
- `git status` → no modified files (db/custom.db unmodified)

**Defaults relied on:** none  
**Deviations from task:** none  
**Out-of-scope findings:**
- The 4 needs-fix items above (missing `PROVISIONAL(D1)` comment, undocumented webhook payloads, undocumented v1 API, stale dashboard comment on main — the last is already fixed on the T50 branch).
