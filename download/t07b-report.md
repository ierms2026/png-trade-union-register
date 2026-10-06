# T07b: Verify Claims from Session B Report — Report

**Task:** T07b  
**Status:** done  
**Date:** 2026-10-05  

---

## Files changed

None (read-only task — no source edits)

---

## Verification

n/a (read-only task)

---

## Defaults relied on

none (`docs/decisions-and-defaults.md` not found)

---

## Deviations from task

`docs/decisions-and-defaults.md` does not exist; proceeded since task is read-only.

---

## Out-of-scope findings

None

---

## Item 1: `export/unions/route.ts:36` — `_count` on array

### Code at L20-36

```typescript
const unions = await db.union.findMany({
  ...
  select: {
    id: true, unionName: true, registrationNo: true, ...
    documents: { select: { _count: true } },   // L27
  },
});

const rows = unions.map((u) => ({
  ...
  "Documents": u.documents._count,   // L36
  ...
}));
```

### What it does

The Prisma query at L27 uses `documents: { select: { _count: true } }` which returns `documents` as an **array** of objects, each containing `{ _count: { versions, legalHolds, dispositionRequests } }`. It does NOT return a scalar count. The code at L36 reads `u.documents._count` — accessing `._count` on the array, which is `undefined`.

### Runtime evidence (seed data, 6 unions)

```
East Sepik Fisherfolk Cooperative: undefined
Highlands Coffee Growers Association: undefined
New Ireland Mining Employees Union: undefined
```

The "Documents" column in the CSV contains `undefined` for every row. The total documents sum is `NaN`.

### Verdict: wrong output

The CSV's "Documents" column is `undefined` for all rows.

### Minimal fix (not applied)

```typescript
// L23-28: change to
select: {
  id: true, unionName: true, registrationNo: true, fileNumber: true,
  status: true, address: true, contactPerson: true, contactEmail: true,
  contactPhone: true, remarks: true, createdAt: true,
  _count: { select: { documents: true } },
},

// L36: change to
"Documents": u._count.documents,
```

---

## Item 2: `cron/compliance-digest/route.ts` — `DigestItem` scope

### Confirmed from code

`DigestItem` is declared as a local interface INSIDE the `GET` function at L49-54:

```typescript
// L49-54 (inside GET)
interface DigestItem {
  unionName: string;
  documentType: string;
  daysUntilExpiry: number;
  expiryDate: string;
}
```

It's used at MODULE scope in `DigestEmailParams` (L211-213) and `renderDigestEmail` (L223):

```typescript
// L207-213 (module scope)
interface DigestEmailParams {
  ...
  overdue: DigestItem[];      // L211
  expiring30: DigestItem[];   // L212
  expiring90: DigestItem[];   // L213
}
```

### Runtime behavior

TypeScript types are erased at runtime. `DigestItem` is only a type (not a value), so it produces no runtime code. The `renderDigestEmail` function at L216 accepts `params` and accesses `params.overdue`, `params.expiring30`, etc. as plain JavaScript objects — no type check occurs. The function works correctly at runtime because the objects passed to it (built at L74-78 inside `GET`) have the correct shape.

### Verdict: works at runtime; types are erased

The minimal fix is to move the `interface DigestItem { ... }` declaration from inside `GET` (L49) to module scope (before `DigestEmailParams` at L207). This is a pure move — no code changes, just the interface declaration.

---

## Item 3: `tasks/route.ts:~L195` and `unions/route.ts:~L201` — data construction

### `tasks/route.ts` (L132-193)

The `data` object is built as an **explicit allowlist** — not spread from the request body:

```typescript
// L132-141
const data: Record<string, unknown> = {
  title: body.title.trim(),
  description: typeof body.description === "string" ? body.description.trim() : null,
  priority: typeof body.priority === "string" && body.priority.trim().length > 0
    ? body.priority.trim() : "NORMAL",
  createdById: user.id,    // ← server-set, not from body
};
```

Then `dueDate`, `unionId`, and `assigneeId` are added conditionally with validation (L143-192). `createdById` is always set to `user.id` (the authenticated user), not from the request body. `status` is NOT set — new tasks default to `PENDING` via the Prisma schema (`@default(PENDING)`).

### Security assessment (tasks)

A caller CANNOT set `status`, `createdById`, `id`, `createdAt`, or `updatedAt` — these are not in the allowlist. `assigneeId` is validated (must be an active user for Registrars; must be self/null for Officers). `unionId` is validated (must exist for Registrars; locked to assigned union for Officers). **No mass-assignment vulnerability.**

### `unions/route.ts` (L181-198)

Same pattern — explicit allowlist:

```typescript
// L181-185
const data: Record<string, unknown> = {
  unionName: body.unionName.trim(),
  registrationNo: body.registrationNo.trim(),
  status,    // ← validated against UnionStatus enum at L170-178
};

// L188-197: optional string fields from a fixed list
const optionalFields = ["fileNumber", "address", "contactPerson", "contactEmail", "contactPhone", "remarks"];
for (const field of optionalFields) {
  data[field] = typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
```

### Security assessment (unions)

A caller CANNOT set `id`, `createdAt`, `updatedAt`, or any field not in the allowlist. `status` is validated against the `UnionStatus` enum. **No mass-assignment vulnerability.**

The `Record<string, unknown>` type annotation is the cause of the tsc error (Prisma wants a specific `TaskCreateInput`/`UnionCreateInput` type), but the runtime behavior is correct — the object only contains allowed fields.

---

## Item 4: User-visible internal strings

`grep -rniE "no caching|computed on every read|NEXT_PUBLIC_RETENTION_ENABLED" src/` — 7 hits:

| File | Line | String | User-visible? |
|---|---|---|---|
| `src/components/app/views/compliance.tsx` | L172 | `"Live compliance status for every union × document type. Computed on every read — no caching."` | **Yes** — rendered as a subtitle (`<p className="text-sm text-muted-foreground">`) directly below the "Compliance Matrix" heading. Visible to all staff who view the Compliance page. |
| `src/lib/retention-flag.ts` | L5 | `// When NEXT_PUBLIC_RETENTION_ENABLED is not set...` | No — comment |
| `src/lib/retention-flag.ts` | L11 | `// When NEXT_PUBLIC_RETENTION_ENABLED=true...` | No — comment |
| `src/lib/retention-flag.ts` | L27 | `// To enable: set NEXT_PUBLIC_RETENTION_ENABLED=true in .env` | No — comment |
| `src/lib/retention-flag.ts` | L33 | `* Reads NEXT_PUBLIC_RETENTION_ENABLED...` | No — JSDoc comment |
| `src/lib/retention-flag.ts` | L37 | `return process.env.NEXT_PUBLIC_RETENTION_ENABLED === "true";` | No — code (server-side only; the env var name is not rendered) |
| `src/lib/retention-flag.ts` | L47 | `"The retention workflow is not enabled. Set NEXT_PUBLIC_RETENTION_ENABLED=true to enable it."` | **Yes** — returned in the JSON body of API responses (`{ error: RETENTION_DISABLED_MESSAGE }`) when the retention flag is off. Visible to any caller (staff browser toast or API key consumer) who hits a retention endpoint. |

### Summary

2 user-visible strings:

1. **`"Computed on every read — no caching"`** in the Compliance view subtitle — developer-facing phrase shown to non-technical staff. Confirmed from Session B's T04-C report.
2. **`"Set NEXT_PUBLIC_RETENTION_ENABLED=true to enable it"`** in the retention API error — exposes an env var name to API consumers. Confirmed from Session A's T01 report.

Session B's T04-C report was correct that no UI strings mention env vars in `src/components/` — the retention error string is in `src/lib/retention-flag.ts`, not in a component. But it IS user-visible via the API response body.

---

## Item 5: API validation messages — UI surfacing

### Table: routes and UI surfacing

| Route | File | Error messages | Surfaced in UI? | How? |
|---|---|---|---|---|
| `POST /api/tasks` | `tasks/route.ts` | `"Field 'title' is required."` | **No** (client-side check first) | UI validates client-side (`toast.error("Title is required.")` at `tasks.tsx:322`). If bypassed, caught by `toast.error(data.error || ...)` at `tasks.tsx:274`. |
| `PATCH /api/tasks/[id]` | `tasks/[id]/route.ts` | `"Field 'status' must be one of: PENDING, IN_PROGRESS, COMPLETED, CANCELLED."` etc. | **Yes** | `toast.error(data.error || "Failed to update status.")` at `tasks.tsx:162`. Raw enum values shown in toast. |
| `POST /api/users` | `users/route.ts` | `"Field 'role' must be one of: REGISTRAR, INSPECTOR, OFFICER, REPRESENTATIVE."` etc. | **Yes** | `toast.error(data.error || "Failed to create user.")` at `users.tsx:274`. Raw enum values shown. |
| `PUT /api/users/[id]` | `users/[id]/route.ts` | `"Field 'role' must be one of: REGISTRAR, INSPECTOR, OFFICER."` etc. | **Yes** | `toast.error(data.error || ...)` at `users.tsx:125`. |
| `POST /api/portal/contact/requests` | `portal/contact/requests/route.ts` | `` `Field '${field}' must be a string or null.` `` | **Yes** | `toast.error(data.error || "Failed to submit update request.")` at `portal/views/contact.tsx:289`. |
| `PUT /api/compliance/rules/[id]` | `compliance/rules/[id]/route.ts` | `"Field 'required' must be a boolean."` etc. | **Yes** | `toast.error(data.error || "Failed to save rule.")` at `configure-rules.tsx:219`. |
| `POST /api/compliance/rules/preview` | `compliance/rules/preview/route.ts` | `"Field 'ruleId' is required and must be a string."` etc. | **Yes** | `toast.error(data.error || "Preview failed.")` at `configure-rules.tsx:190`. |
| `POST /api/api-keys` | `api-keys/route.ts` | `"Field 'name' is required..."` etc. | **Yes** (but client-side first) | UI validates client-side (`toast.error("Name is required.")` at L199). If bypassed: `toast.error(data.error || "Failed to create key.")` at `api-keys.tsx:224`. |

### Summary

All API validation error messages are surfaced to users via `toast.error(data.error || ...)` patterns. The `data.error` fallback means the raw server message (including field names and enum values) is displayed in the toast. Some routes have client-side validation that fires first (tasks, api-keys), but the server message is still shown if the client check is bypassed.

### Contact-update status labels

`vocabulary.ts` defines `CONTACT_UPDATE_STATUS_CONFIG = REVIEW_STATUS_CONFIG` (L185), which uses:
- PENDING → `"Pending Review"`
- APPROVED → `"Approved"`
- REJECTED → `"Rejected"`

But the UI components define their **own local labels** that **do not match**:

| Location | PENDING label | APPROVED label | REJECTED label | Matches vocabulary.ts? |
|---|---|---|---|---|
| `vocabulary.ts` (REVIEW_STATUS_CONFIG) | "Pending Review" | "Approved" | "Rejected" | — (canonical) |
| `contact-requests.tsx:60-62` (STATUS_FILTERS) | "Pending" | "Approved" | "Rejected" | **No** — PENDING says "Pending" not "Pending Review" |
| `contact-requests.tsx:226-228` (local config) | "Pending" | "Approved" | "Rejected" | **No** — same drift |
| `portal/views/contact.tsx:178-188` (local config) | "Pending" | "Approved" | "Rejected" | **No** — same drift |

### Verdict

The contact-update status labels drift from vocabulary.ts. The canonical label is "Pending Review" but all three local copies say "Pending". The `CONTACT_UPDATE_STATUS_CONFIG` export exists in vocabulary.ts but is not used by either component.
