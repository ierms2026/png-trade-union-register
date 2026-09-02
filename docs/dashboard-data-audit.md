# Dashboard Data Audit — Chunk 0.1

**Date:** 2026-09-02
**Scope:** Investigation only. No code changes. Fixes belong to chunk 1.1.

## Summary of findings

| Number | Where it appears | Source | Value |
|--------|------------------|--------|-------|
| 23 | "Documents" KPI stat card | `/api/dashboard/stats` → `db.document.count()` (no filter) | 23 |
| 21 | "Documents by Type" subtitle ("21 documents across 8 types") | `/api/dashboard/document-types` → `db.document.findMany({ where: { disposedAt: null } })` → `.length` | 21 |
| 78 | Sum of 4 compliance KPI tiles (Compliant 14 + Expiring 2 + Overdue 2 + Missing 57 = 75... see note)¹ | `/api/dashboard/stats` → `buildComplianceMatrix()` → cell tally | 78 |

¹ The chunk prompt said "tiles sum to 78" but live DB query shows 17 + 2 + 2 + 57 = 78 (not 14 + 2 + 2 + 57 = 75). The "14" in the chunk prompt likely came from a prior session's data; the live value as of this audit is 17 compliant. The 78 sum itself is correct and explained below.

---

## Discrepancy #1: Documents KPI (23) vs Documents-by-Type subtitle (21)

### Root cause: **different definitions, not a data bug**

The two numbers use **different filter predicates** on the same `Document` table:

| Endpoint | Query | Count |
|----------|-------|-------|
| `GET /api/dashboard/stats` (line 44) | `db.document.count({ where: {} })` — no filter | **23** |
| `GET /api/dashboard/document-types` (line 22) | `db.document.findMany({ where: { disposedAt: null } })` then `.length` | **21** |

The 2-document gap = disposed documents. Verified via DB query:

```
Total documents (stats route — no disposedAt filter):    23
Non-disposed documents (document-types route):           21
Disposed documents:                                       2
Discrepancy:                                              2  ← matches 23 - 21
```

### Why this is confusing to users

The dashboard shows **two different document counts simultaneously**:
- The "Documents" stat card (top row, KPI band) shows **23** — counts everything, including disposed docs
- The "Documents by Type" card subtitle shows **21** — counts only non-disposed docs

A user looking at both at the same time sees "23 documents" in one place and "21 documents" in another and reasonably wonders which is correct. Neither is wrong — they answer different questions — but the dashboard gives no hint that the definitions differ.

### Which definition is "correct"?

That's a product decision for chunk 1.1. Two reasonable options:
- **Option A (consistency):** Both endpoints use the same filter. The KPI card is the more prominent surface, so likely it should match the document-types card and exclude disposed docs (a disposed doc is "gone from active views" per the codebase's own comment in `calculator.ts:252`).
- **Option B (clarity):** Keep both numbers but relabel them — "23 Documents (all)" vs "21 Active documents (non-disposed)" — so the distinction is explicit.

Either way, the current state (same label "documents", two different counts, no explanation) is the bug.

### Code locations (for chunk 1.1)

- `src/app/api/dashboard/stats/route.ts:42-50` — the `db.document.count` call with no `where` filter (other than Officer scoping)
- `src/app/api/dashboard/document-types/route.ts:22-30` — the `db.document.findMany` with `where: { disposedAt: null }`
- `src/components/app/views/dashboard.tsx:251` — the StatCard showing `stats.totalDocuments` (23)
- `src/components/app/views/dashboard.tsx:323` — the subtitle showing `docTypesData?.total` (21)

---

## Discrepancy #2: Compliance tiles sum to 78

### Root cause: **matrix dimensions, not a bug** — 6 unions × 13 required rules = 78 cells

The 4 compliance tiles (Compliant / Expiring / Overdue / Missing) tally cells from the compliance matrix. The matrix has one cell per **(union × required compliance rule)** pair. Verified via DB query:

```
Total unions:                       6
Total compliance rules:            13
Required rules (required: true):   13  ← all 13 rules are required
Matrix dimensions:                 6 × 13 = 78 cells
```

The compliance matrix's cell tally (from `/api/dashboard/stats` → `buildComplianceMatrix`):

```
COMPLIANT:      17
EXPIRING:        2
OVERDUE:         2
MISSING:        57
NOT_APPLICABLE:  0
───────────────────
Total cells:    78  ← matches 6 × 13
```

Sum of the 4 tiles shown in the dashboard (excluding NOT_APPLICABLE which is 0 here): 17 + 2 + 2 + 57 = **78**. ✅

### Why all 13 rules count toward the matrix (none are NOT_APPLICABLE)

The `calculateStatus` function in `src/lib/compliance/calculator.ts:246-248` returns `NOT_APPLICABLE` only when `!rule.required`. Since all 13 rules in the seed have `required: true` (the default), every (union × rule) pair produces one of COMPLIANT / EXPIRING / OVERDUE / MISSING. There is no rule with `required: false` in the current config, so `NOT_APPLICABLE = 0`.

This is **not a bug** — it's the intended design. The matrix is supposed to cover every (union × required-rule) pair. The sum 78 is correct and meaningful: it represents the total compliance burden across the registry (6 unions × 13 required filings each = 78 required filings).

### Caveat: the chunk prompt's "14" vs the live "17"

The chunk prompt says "Compliant (14, green)" but the live DB shows 17 compliant cells. This is a data drift, not a code bug — likely the prompt was written against an earlier session's data. The audit is against live data (2026-09-02 01:55 UTC backup), which has 17. Chunk 1.1 should not "fix" 17 → 14; the live data is authoritative.

### Why "Missing" is so high (57 of 78 = 73%)

This is also not a bug — it's the review workflow's interaction with the compliance calculator. From chunk "Step 4" of the prior session:

> Review workflow (Option A): an un-reviewed upload doesn't count toward compliance. This drops the union's score the moment they upload, and recovers only when the Registrar approves.

`src/lib/compliance/calculator.ts:264-266` returns `MISSING` whenever `document.reviewStatus !== "APPROVED"`. The seed data was backfilled to `APPROVED` for all 23 existing documents (per the re-implementation), so this shouldn't drive MISSING — but the high MISSING count suggests most (union × rule) pairs have **no Document row at all**, not a PENDING/REJECTED one. Verified: 23 documents spread across 6 unions × 13 rules = 78 cells means at most 23 cells have a document; the other 55 cells have no Document row → `calculateStatus` returns `MISSING` at `calculator.ts:256`. Plus 2 disposed docs → also MISSING. So 57 = (78 - 23) + 2 = 57. ✅

---

## Data flow summary (for the next chunk)

```
DB (Document table)
  ├─ db.document.count({})                          → 23  ─→ stats route → StatCard "Documents"
  └─ db.document.findMany({ disposedAt: null })     → 21  ─→ document-types route → "Documents by Type" subtitle

DB (Union × ComplianceRule)
  └─ fetchMatrixData() + buildComplianceMatrix()     → 78 cells
       ├─ COMPLIANT: 17   ─→ stats route → StatCard "Compliant" + KPI tile
       ├─ EXPIRING:  2    ─→ stats route → StatCard "Expiring"  + KPI tile
       ├─ OVERDUE:   2    ─→ stats route → StatCard "Overdue"   + KPI tile
       ├─ MISSING:  57    ─→ stats route → StatCard "Missing"   + KPI tile
       └─ NOT_APPLICABLE: 0 (excluded from tiles)
```

All four "Compliance Status Distribution" tiles read from the same `/api/dashboard/stats` response. They are not independent queries — they're 4 fields of one object.

---

## Acceptance criteria check

- [x] A short written audit exists explaining each number's data source. ← this file
- [x] The discrepancy cause is identified and stated (data bug vs. different definitions). ← "different definitions" for 23-vs-21; "intended matrix dimensions" for 78

## Out of scope for chunk 0.1 (deferred to 1.1)

- Changing the stats route's `db.document.count` filter
- Changing the document-types route's filter
- Relabeling the dashboard cards
- Adjusting any compliance numbers
- Building any canonical `DashboardMetrics` type or status config (that's a later Phase 0 chunk if the plan calls for one)
