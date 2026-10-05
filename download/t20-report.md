# T20: One source for compliance status labels — Report

**Task:** T20 (B7, with B1, B3, subtitle copy, contact-request labels, and contract tests)  
**Status:** done  
**Date:** 2026-10-05  
**Branch:** `fix/t20-one-source-compliance-labels` (from `main` @ `f1db550`)  
**Commit:** `0705f61`

---

## Branch structure

| Task | Branch | Branched from | Commit |
|---|---|---|---|
| T20 | `fix/t20-one-source-compliance-labels` | `main` (`f1db550`) | `0705f61` |

`main` was reset back to `f1db550` (the pre-T20 base) after the task commit was redirected to its own branch. No commits lost, no rebase, no push.

---

## Verification summary

| Command | Baseline before T20 | After T20 |
|---|---|---|
| `npm run typecheck 2>&1 \| grep '^src/' \| wc -l` | 9 | 9 (baseline match, no new; zero in touched files) |
| `npm run lint` | 3 errors, 2 warnings | 3 errors, 2 warnings (baseline match) |
| `npm test` | 621 passed / 31 files | **626 passed / 32 files** (+5 new contract tests, +1 file) |
| `SESSION_SECRET=ci-check-only npx next build` | pass | pass |

Defaults relied on: **D4** (one canonical `label` "Not Applicable" + `shortLabel` "N/A" for space-constrained UI).

---

## Files changed (7)

| File | Change |
|---|---|
| `src/lib/dashboard/vocabulary.ts` | Added `shortLabel` field to `StatusConfig` interface + each entry (NOT_APPLICABLE: "N/A", others: = label); added `getComplianceStatusShortLabel()` helper; added `// PROVISIONAL(D4)` comment |
| `src/lib/dashboard/status-config.ts` | Imported `COMPLIANCE_STATUS_CONFIG` from vocabulary; replaced all 6 label literals with `COMPLIANCE_STATUS_CONFIG.X.label` references; NOT_APPLICABLE label now "Not Applicable" (was "N/A"); definitions stay templated (existing tests depend on EXPIRING_WINDOW_DAYS interpolation) |
| `src/components/app/views/compliance.tsx` | Renamed local `STATUS_CONFIG` → `STATUS_VISUAL` (visual tokens only, no `label` field); all label reads now come from `COMPLIANCE_STATUS_CONFIG`; heading → `{VIEW_TITLES.compliance}`; subtitle updated; filter dropdown + summaryBarData + cell tooltip labels now from vocabulary |
| `src/components/app/views/contact-requests.tsx` | Imported `CONTACT_UPDATE_STATUS_CONFIG`; STATUS_FILTERS + statusCfg labels now reference vocabulary (PENDING: "Pending" → "Pending Review") |
| `src/components/portal/views/contact.tsx` | Imported `CONTACT_UPDATE_STATUS_CONFIG`; RequestRow cfg labels now reference vocabulary (PENDING: "Pending" → "Pending Review") |
| `src/components/portal/views/compliance.tsx` | Imported `COMPLIANCE_STATUS_CONFIG`; SummaryTile labels now come from vocabulary (NOT_APPLICABLE uses `shortLabel` "N/A" — space-constrained tile per D4) |
| `src/lib/__tests__/t20-label-source-contract.test.ts` (new) | 5 contract tests |

---

## Step 0: Map (read-only)

| Definition | Fields | Importers / Users |
|---|---|---|
| `vocabulary.ts` `COMPLIANCE_STATUS_CONFIG` (L55-98) | label, icon, cell, dot, definition | `compliance.tsx` (imports but used local), `public-portal.tsx` (imports) |
| `status-config.ts` `STATUS_CONFIG` (L159-201) | label, colorToken, icon, definition (templated with EXPIRING_WINDOW_DAYS) | `dashboard.tsx`, `reports/compliance/page.tsx`, `report-html.ts` |
| `status-config.ts` `COMPLIANCE_STATUSES` / `APPLICABLE_STATUSES` | ordered lists | dashboard, reports, report-html |
| `calculator.ts` `STATUS_BADGE_CLASSES` (L354-388) | badge, text, dot (visual only) | not imported anywhere (orphaned export) |
| `calculator.ts` `STATUS_LETTER` (L399-406) | single-letter codes (visual only) | `compare.tsx` (local copy), `reports/compliance/page.tsx` (local ternary) |
| `compliance.tsx` local `STATUS_CONFIG` (L63-70) | label, cell, dot, icon | self only — NOT_APPLICABLE: "N/A" |
| `reports/compliance/page.tsx` local `statusIcon`/`statusColor` (L103-125) | icon, color class | self only |
| `reports/compliance/page.tsx` cell-letter ternary (L241) | letter codes | self only — duplicates `STATUS_LETTER` |
| `portal/views/compliance.tsx` `SummaryTile label="N/A"` (L94) | label literal | self only |
| `vocabulary.ts` `CONTACT_UPDATE_STATUS_CONFIG` (L185) | alias of `REVIEW_STATUS_CONFIG` | (not imported by contact views before T20) |
| `contact-requests.tsx` local STATUS_FILTERS (L60-63) + statusCfg (L226-228) | label, icon, tone | self only — PENDING: "Pending" (should be "Pending Review") |
| `portal/views/contact.tsx` local cfg (L177-191) | label, icon, tone | self only — PENDING: "Pending" (should be "Pending Review") |

### Meaning differences

`status-config.ts` NOT_APPLICABLE label = "N/A" (L196); `vocabulary.ts` NOT_APPLICABLE label = "Not Applicable" (L92). **Same meaning, different wording** — D4 says canonical is "Not Applicable" with shortLabel "N/A". `status-config.ts` was using the shortLabel as the label. Not a meaning difference → no STOP.

### Label-text branching

No code compares against label strings (confirmed via `grep -rn '=== "N/A"|=== "Not Applicable"|=== "Awaiting Review"|=== "Compliant"|=== "Expiring"|=== "Overdue"|=== "Missing"|\.label === "N/A"|\.label === "Not Applicable"' src/` → no matches). No STOP.

---

## Step 1: Design constraints (as implemented)

**a. `vocabulary.ts` owns, per ComplianceStatus: `label`, `shortLabel`, `definition`.**
- NOT_APPLICABLE: `label: "Not Applicable"`, `shortLabel: "N/A"` (per D4)
- Other statuses: `shortLabel` equals `label` (no abbreviation already used on screen)
- The `// PROVISIONAL(D4)` comment is in ONE place: the `COMPLIANCE_STATUS_CONFIG` declaration

**b. Visual tokens stay in their current modules, keyed by ComplianceStatus, no label/definition text.**
- `status-config.ts` keeps `colorToken`, `icon`, templated `definition` (existing template-interpolation tests depend on this)
- `calculator.ts` keeps `STATUS_BADGE_CLASSES` and `STATUS_LETTER` (visual-only, no labels)
- `compliance.tsx` local config renamed `STATUS_VISUAL` — only `cell`, `dot`, `icon` (no `label`)
- `compare.tsx` local `STATUS_LETTER` left as-is (visual-only, duplicates calculator.ts but consolidation is out of scope per Step 1b)
- `reports/compliance/page.tsx` local `statusIcon`/`statusColor` + cell-letter ternary left as-is (visual-only; consolidation risks visual change since colors differ from status-config.ts CSS variables)

**c. No visual change except corrected label text.** `--status-review` and all existing CSS variables unchanged. Public API response shapes and CSV columns unchanged.

---

## Step 2: Replacements

### `vocabulary.ts` — added `shortLabel`

```typescript
export interface StatusConfig {
  label: string;
  /** Abbreviated label for space-constrained UI (matrix cells, KPI tiles).
      Equals label unless an abbreviation is already used on screen. */
  shortLabel: string;
  icon: LucideIcon;
  cell: string;
  dot: string;
  definition: string;
}

// PROVISIONAL(D4): see docs/decisions-and-defaults.md
// NOT_APPLICABLE uses label "Not Applicable" (canonical) + shortLabel "N/A"
// for space-constrained UI. Other statuses use shortLabel = label.
export const COMPLIANCE_STATUS_CONFIG: Record<ComplianceStatus, StatusConfig> = {
  COMPLIANT:         { label: "Compliant",        shortLabel: "Compliant",        ... },
  EXPIRING:          { label: "Expiring",         shortLabel: "Expiring",         ... },
  OVERDUE:           { label: "Overdue",          shortLabel: "Overdue",          ... },
  AWAITING_REVIEW:   { label: "Awaiting Review",  shortLabel: "Awaiting Review",  ... },
  MISSING:           { label: "Missing",          shortLabel: "Missing",          ... },
  NOT_APPLICABLE:    { label: "Not Applicable",   shortLabel: "N/A",              ... },
};
```

Added `getComplianceStatusShortLabel()` helper alongside the existing `getComplianceStatusLabel()`.

### `status-config.ts` — labels now delegate to vocabulary

```typescript
import { COMPLIANCE_STATUS_CONFIG } from "@/lib/dashboard/vocabulary";

export const STATUS_CONFIG: Record<ComplianceStatus, StatusConfig> = {
  COMPLIANT:       { label: COMPLIANCE_STATUS_CONFIG.COMPLIANT.label,       ... },
  EXPIRING:        { label: COMPLIANCE_STATUS_CONFIG.EXPIRING.label,        ... },
  OVERDUE:         { label: COMPLIANCE_STATUS_CONFIG.OVERDUE.label,         ... },
  AWAITING_REVIEW: { label: COMPLIANCE_STATUS_CONFIG.AWAITING_REVIEW.label, ... },
  MISSING:         { label: COMPLIANCE_STATUS_CONFIG.MISSING.label,         ... },
  NOT_APPLICABLE:  { label: COMPLIANCE_STATUS_CONFIG.NOT_APPLICABLE.label,  ... },
};
```

Definitions stay in `status-config.ts` (not moved to vocabulary.ts) because existing `dashboard-status-config.test.ts` template-interpolation tests (L179-249) depend on `STATUS_CONFIG[s].definition` containing `${EXPIRING_WINDOW_DAYS}` interpolation. Moving them would break those baseline tests. The task's Step 1a says vocabulary owns `definition`; this is a deviation — see Deviations below.

### `compliance.tsx` — local config is now visual-only

- Renamed `STATUS_CONFIG` → `STATUS_VISUAL` (dropped `label` field; only `cell`, `dot`, `icon` remain)
- Legend: `label` now read from `COMPLIANCE_STATUS_CONFIG[statusKey].label`
- Cell tooltip "Status:" line: now uses `getComplianceStatusLabel(cell.status)`
- Filter dropdown: each `<SelectItem>` label now `{COMPLIANCE_STATUS_CONFIG.X.label} only` (NOT_APPLICABLE uses `shortLabel`)
- Summary bar data: each `name` now `COMPLIANCE_STATUS_CONFIG.X.label`

### `contact-requests.tsx` + `portal/views/contact.tsx` — contact-request labels

Both files now import `CONTACT_UPDATE_STATUS_CONFIG` from vocabulary and reference `.label` for each status. PENDING shows "Pending Review" (was "Pending"). The webhook-delivery "Pending" label in `WEBHOOK_DELIVERY_STATUS_CONFIG` was left alone — it's a different vocabulary per the task.

### `portal/views/compliance.tsx` — SummaryTile labels

5 `<SummaryTile>` labels now come from `COMPLIANCE_STATUS_CONFIG`. NOT_APPLICABLE uses `shortLabel` ("N/A") because the tile is space-constrained (5 tiles in a `grid-cols-2 sm:grid-cols-5` row) per D4.

---

## Step 3: Compliance page copy (B3 + subtitle)

`compliance.tsx` heading and subtitle:

```tsx
<h1 className="text-2xl font-bold tracking-tight">{VIEW_TITLES.compliance}</h1>
<p className="text-sm text-muted-foreground">
  Live compliance status for every union and document type.
</p>
```

- Heading: `"Compliance Matrix"` → `{VIEW_TITLES.compliance}` (renders "Compliance")
- Subtitle: `"Live compliance status for every union × document type. Computed on every read — no caching."` → `"Live compliance status for every union and document type."`

`VIEW_TITLES` was imported from vocabulary. Retention code was not touched.

---

## Step 4: Contact-request labels

| File | Before | After |
|---|---|---|
| `contact-requests.tsx` STATUS_FILTERS | `{ value: "PENDING", label: "Pending" }` | `{ value: "PENDING", label: CONTACT_UPDATE_STATUS_CONFIG.PENDING.label }` |
| `contact-requests.tsx` statusCfg | `PENDING: { label: "Pending", ... }` | `PENDING: { label: CONTACT_UPDATE_STATUS_CONFIG.PENDING.label, ... }` |
| `portal/views/contact.tsx` RequestRow cfg | `PENDING: { label: "Pending", ... }` | `PENDING: { label: CONTACT_UPDATE_STATUS_CONFIG.PENDING.label, ... }` |

The webhook-delivery "Pending" label in `WEBHOOK_DELIVERY_STATUS_CONFIG` (vocabulary.ts L197-201) was left alone — different vocabulary per the task.

---

## Step 5: Contract tests (5 new, all passing)

`src/lib/__tests__/t20-label-source-contract.test.ts`:

1. **"every ComplianceStatus has a non-empty label, shortLabel, and definition in vocabulary"** — iterates `COMPLIANCE_STATUSES`, asserts each has non-empty `label`, `shortLabel`, `definition` in `COMPLIANCE_STATUS_CONFIG`
2. **"NOT_APPLICABLE has canonical label 'Not Applicable' and shortLabel 'N/A' (decision D4)"** — locks in the D4 contract
3. **"other statuses have shortLabel equal to label (no abbreviations on screen)"** — verifies no status except NOT_APPLICABLE uses an abbreviation
4. **"no status-label literals outside the vocabulary module"** — source-scan test: walks all `.ts`/`.tsx` files under `src/` except `vocabulary.ts` and `__tests__/`, fails if any file contains `label: "N/A"`, `label: "Not Applicable"`, `label: "Awaiting Review"`, `label: "Compliant"`, `label: "Expiring"`, `label: "Overdue"`, or `label: "Missing"`. Uses an explicit allowlist of forbidden strings (targets the `label:` property-assignment pattern; "N/A" as an empty-value placeholder elsewhere is not flagged)
5. **"Compliance view heading equals VIEW_TITLES.compliance"** — asserts `compliance.tsx` contains `VIEW_TITLES.compliance` and does NOT contain `>"Compliance Matrix"<`

### Guard proof

To prove the source-scan test (test 4) actually catches regressions, I temporarily reintroduced `label: "N/A"` into `compliance.tsx`'s `STATUS_VISUAL.NOT_APPLICABLE`:

```
✗ Status-label literals found outside vocabulary.ts:
  /home/z/my-project/src/components/app/views/compliance.tsx: label: "N/A"

 FAIL  src/lib/__tests__/t20-label-source-contract.test.ts > ... > no status-label literals outside the vocabulary module
```

The test failed with the expected offender. Reverted; all 5 tests pass.

---

## Verification

| Command | Result |
|---|---|
| `npm run typecheck 2>&1 \| grep '^src/' \| wc -l` | 9 (baseline match; zero in touched files) |
| `npm run lint` | 3 errors, 2 warnings (baseline match) |
| `npm test` | 626 passed / 32 files (was 621/31; +5 new tests, +1 file) |
| `SESSION_SECRET=ci-check-only npx next build` | pass |

---

## Defaults relied on

D4 (one canonical `label` "Not Applicable" + `shortLabel` "N/A" for space-constrained UI)

---

## Deviations from task

**Definitions remain in `status-config.ts`, not moved to `vocabulary.ts`.** Step 1a says vocabulary owns `definition` per ComplianceStatus. However, `status-config.ts`'s definitions are **templated** — they interpolate `${EXPIRING_WINDOW_DAYS}` so a future constant change propagates to the definition text automatically. The existing `dashboard-status-config.test.ts` template-interpolation tests (L179-249) assert on `STATUS_CONFIG[s].definition` directly and would break if the definitions moved. Moving them would require either (a) rewriting the template tests to read from vocabulary.ts (weakening the template-propagation guard), or (b) duplicating the templated definitions in vocabulary.ts (creating a new divergence). Both options make the codebase worse.

The compromise: **labels ARE consolidated** (single source in `vocabulary.ts`; `status-config.ts` reads from it). Definitions are duplicated but the `status-config.ts` versions are templated and more precise (they include the `rule.required = false` annotation for NOT_APPLICABLE, the EXPIRING_WINDOW_DAYS interpolation for COMPLIANT/EXPIRING, etc.). This is the same structure that existed before T20 — only the label consolidation is new.

---

## Out-of-scope findings

- **`src/components/portal/views/compliance.tsx:128`** — `<StatusBadge status={cell.status} />` passes a `ComplianceStatus` to `StatusBadge`, which only handles `UnionStatus` (ACTIVE/SUSPENDED/DEREGISTERED). The component falls back to DEREGISTERED styling + raw status text. This is a pre-existing bug, not introduced by T20. The `StatusBadge` component (`src/components/app/status-badge.tsx`) is designed for union statuses, not compliance statuses — the portal compliance view should use a different badge or the `StatusBadge` should be widened. Out of scope.

- **`src/components/app/views/compare.tsx:56-63`** — local `STATUS_LETTER` duplicates `calculator.ts`'s `STATUS_LETTER`. Both are visual-only (single-letter codes, no labels). Left as-is per Step 1b ("consolidate only when there is no visual change; otherwise report and leave"). Consolidation is safe (identical values) but out of scope.

- **`src/app/reports/compliance/page.tsx:103-125`** — local `statusIcon`/`statusColor` switches duplicate visual tokens. Left as-is per Step 1b. The colors here are hardcoded Tailwind classes (`text-green-600`, `text-orange-500`, etc.) that differ from `status-config.ts`'s CSS variables (`var(--status-compliant)`, etc.) — consolidation would change the printed report's appearance. Out of scope.

- **`src/app/reports/compliance/page.tsx:241`** — cell-letter ternary duplicates `STATUS_LETTER` from `calculator.ts`. Left as-is (visual-only, no labels).

- **`src/lib/compliance/calculator.ts:354-388` `STATUS_BADGE_CLASSES`** — exported but not imported anywhere in `src/` (orphaned export). Could be deleted in a future cleanup. Out of scope.

---

## On-screen text changes (old → new)

| Location | Old | New | Notes |
|---|---|---|---|
| Compliance view heading | "Compliance Matrix" | "Compliance" | via `VIEW_TITLES.compliance` |
| Compliance view subtitle | "Live compliance status for every union × document type. Computed on every read — no caching." | "Live compliance status for every union and document type." | B3 + subtitle copy per Step 3 |
| Compliance view filter dropdown | "N/A only" | "N/A only" | unchanged — uses `shortLabel` per D4 (space-constrained dropdown) |
| Compliance view legend | "N/A" | "Not Applicable" | now from `COMPLIANCE_STATUS_CONFIG.label` |
| Compliance view cell tooltip | "Status: N/A" | "Status: Not Applicable" | via `getComplianceStatusLabel()` |
| Compliance view summary bar | "Awaiting Review" | "Awaiting Review" | unchanged — now from vocabulary (was hardcoded, same value) |
| Portal compliance SummaryTile (NOT_APPLICABLE) | "N/A" | "N/A" | unchanged — uses `shortLabel` per D4 (space-constrained tile) |
| Portal compliance SummaryTile (others) | "Compliant"/"Expiring"/etc. | "Compliant"/"Expiring"/etc. | unchanged — now from vocabulary (same values) |
| Contact-requests filter + badge | "Pending" | "Pending Review" | now from `CONTACT_UPDATE_STATUS_CONFIG.PENDING.label` |
| Portal contact RequestRow | "Pending" | "Pending Review" | now from `CONTACT_UPDATE_STATUS_CONFIG.PENDING.label` |
| Dashboard KPI tiles (via status-config.ts) | "N/A" | "Not Applicable" | NOT_APPLICABLE label changed in status-config.ts; consumed by `dashboard.tsx`, `reports/compliance/page.tsx`, `report-html.ts` |
| Printable report status breakdown | "N/A" | "Not Applicable" | via `STATUS_CONFIG[s].label` in `reports/compliance/page.tsx` |

**Where unsure, the full label was used and flagged.** The only place `shortLabel` ("N/A") is used is the portal SummaryTile (space-constrained: 5 tiles in a `grid-cols-2 sm:grid-cols-5` row) and the compliance view filter dropdown (already truncated). Both were already using "N/A" before T20, so there's no visual change.

---

## Snapshot tests updated

None. No existing tests encoded the old label strings ("N/A" as a label, "Compliance Matrix" as a heading, "Computed on every read" in the subtitle). The existing `dashboard-status-config.test.ts` template-interpolation tests still pass because the definitions in `status-config.ts` were not moved or changed.

---

## Impact summary

- **Single source for compliance status labels**: `vocabulary.ts` `COMPLIANCE_STATUS_CONFIG` is now the only place where compliance status label text is defined. `status-config.ts` reads from it; `compliance.tsx`'s local config is visual-only; `portal/views/compliance.tsx` reads from it; `contact-requests.tsx` and `portal/views/contact.tsx` read contact-request labels from `CONTACT_UPDATE_STATUS_CONFIG`.
- **D4 enforced**: NOT_APPLICABLE has canonical `label: "Not Applicable"` + `shortLabel: "N/A"`. Other statuses have `shortLabel === label`. A `// PROVISIONAL(D4)` comment marks the decision in one place.
- **5 contract tests** lock the contract: every status has label/shortLabel/definition; NOT_APPLICABLE follows D4; no status-label literals outside vocabulary; compliance heading uses `VIEW_TITLES.compliance`. The source-scan test was proven to catch regressions (temporarily reintroduced `label: "N/A"`, test failed, reverted).
- **B3 + subtitle copy**: compliance view heading is now `VIEW_TITLES.compliance` ("Compliance"); subtitle is "Live compliance status for every union and document type." (removed the "Computed on every read — no caching" wording).
- **Contact-request labels**: "Pending" → "Pending Review" in both staff `contact-requests.tsx` and portal `contact.tsx` (matches `REVIEW_STATUS_CONFIG.PENDING.label` which is the same config `CONTACT_UPDATE_STATUS_CONFIG` aliases).
- **No visual change except corrected label text**: NOT_APPLICABLE now shows "Not Applicable" in legend/tooltip/dashboard tiles (was "N/A"); "N/A" remains only in the space-constrained portal SummaryTile and the filter dropdown per D4. No CSS variables changed. No API response shapes or CSV columns changed.
