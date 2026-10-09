# Migration Plan: Remove `REPRESENTATIVE` Role + `/portal` Dead Code

**Decision:** D7 (round 4) — delete.
**Date:** 2026-10-09.
**Scope:** Delete the `/portal` route, `PortalShell`, portal views, the dead `/api/portal/*` stubs, the orphaned scripts, and clean up stale `REPRESENTATIVE` comment references.

---

## 1. Pre-flight check: existing rows

Before any deletion, the database was queried (via `$queryRawUnsafe`, since the Prisma client rejects the now-unknown enum value) for rows that still reference the role:

```sql
SELECT COUNT(*) FROM User WHERE role = 'REPRESENTATIVE';
SELECT DISTINCT role FROM User;
```

**Results against the dev DB at `db/custom.db` (confirmed 2026-10-09):**

| Query | Result |
| --- | --- |
| `User.role = 'REPRESENTATIVE'` | **0 rows** |
| Distinct `User.role` values | `REGISTRAR, INSPECTOR, OFFICER` |

No `User` row references the rep role. The deletion is therefore **data-safe in dev** — nothing to migrate, nothing to archive.

For other environments (staging/prod), re-run the same query before deploying. If any environment returns non-zero counts, run the **row-handling SQL in §3** before deploying this commit.

---

## 2. Schema state — what already exists vs. what this commit does

The Prisma schema's `Role` enum was already narrowed in the earlier `2f0e918` commit ("remove-representative-role: remove Representative role from the system (D7 departure)"):

```prisma
enum Role {
  REGISTRAR
  INSPECTOR
  OFFICER
}
```

`REPRESENTATIVE` is **already absent** from the enum. The earlier commit left the `/portal` route, `PortalShell`, the portal views, the `/api/portal/*` routes (reduced to 403 stubs), and stale comment references across `src/` as dead code. **This commit deletes the dead code and cleans up the stale comments.**

The Prisma client already rejects `role: "REPRESENTATIVE"` at the type layer (`Invalid value for argument 'role'. Expected Role.`), so any code path that tried to query by that role would fail at the client boundary — there is no runtime risk of accidentally reading a stale rep row through Prisma.

---

## 3. Row-handling SQL (only if a non-dev environment has rep rows)

The schema's `User.role` column is stored as `TEXT` (SQLite has no native enum type — Prisma emulates enums as `TEXT` constraints at the application layer only, not at the DB layer). This means:

- The DB itself will accept any string in the `role` column.
- The Prisma client is the only gatekeeper.
- A `User.role = 'REPRESENTATIVE'` row would still load the row but throw at the client boundary — making those users effectively unable to log in.

If a non-dev environment contains rep rows, run the following SQL **before** deploying this commit. The mapping is `REPRESENTATIVE → OFFICER` because the two roles were functionally identical for every API route that still supports union-scoped access (documents, search, tasks, union documents). Reps already had `assignedUnionId` populated, so they slot directly into the OFFICER code path.

```sql
-- 1. Convert any rep users to OFFICER (their assignedUnionId is already set,
--    and the OFFICER code path is the only union-scoped staff role).
UPDATE User
SET role = 'OFFICER'
WHERE role = 'REPRESENTATIVE';

-- 2. Audit-log the conversion (optional but recommended for traceability).
--    Run BEFORE the UPDATE if you want to capture the original role.
SELECT id, email, role, assignedUnionId, disabled
FROM User
WHERE role = 'REPRESENTATIVE';
```

After running the SQL, re-run the query in §1 to confirm zero `REPRESENTATIVE` rows remain. Then deploy this commit.

---

## 4. Why no `prisma migrate` is needed

- The `Role` enum was already changed in `prisma/schema.prisma` (commit `2f0e918`).
- The project does not use `prisma migrate` — the `prisma/` directory contains only `schema.prisma`, `seed.ts`, `seed-demo.ts`, and `generate-doc-text.ts`. There is no `migrations/` folder. The DB schema is reconciled manually (via `prisma db push` or the seed scripts).
- The schema diff in this commit is **comments only** — the `Role` enum itself is unchanged. `prisma db push` is therefore a no-op for the DB.
- The only schema-adjacent change is the comment block on the `ContactUpdateRequest` model, which clarifies that the model is now read-only on the staff side and has no producer endpoint.

If a `prisma migrate` workflow is introduced later, the migration for this change would be a one-line no-op (no DDL changes — the SQLite column is `TEXT` and the enum constraint lives only in the Prisma schema).

---

## 5. Files deleted by this commit

| Path | Purpose |
| --- | --- |
| `src/app/portal/page.tsx` | The `/portal` route entry — already bounced every authenticated user to `/`; dead code. |
| `src/components/portal/portal-shell.tsx` | `PortalShell` — no consumer after the route is deleted. |
| `src/components/portal/views/dashboard.tsx` | Rep-only dashboard view. |
| `src/components/portal/views/documents.tsx` | Rep-only documents view. |
| `src/components/portal/views/compliance.tsx` | Rep-only compliance view. |
| `src/components/portal/views/tasks.tsx` | Rep-only tasks view. |
| `src/components/portal/views/contact.tsx` | Rep-only contact-update-request view. |
| `src/app/api/portal/me/route.ts` | 403 stub. |
| `src/app/api/portal/dashboard/route.ts` | 403 stub. |
| `src/app/api/portal/documents/route.ts` | 403 stub. |
| `src/app/api/portal/compliance/route.ts` | 403 stub. |
| `src/app/api/portal/contact/route.ts` | 403 stub. |
| `src/app/api/portal/contact/requests/route.ts` | 403 stub. |
| `src/app/api/route.ts` | Next.js "Hello, world!" stub — the only unauthenticated non-`/api/auth/*` non-`/api/public/*` endpoint. Leaked nothing, but had no reason to exist. |
| `scripts/seed-demo-rep.ts` | Orphaned seed script for a demo rep user. |
| `scripts/test-portal-contact-flow.ts` | Orphaned manual test script for the portal contact flow. |

## 6. Files modified by this commit

| Path | Change |
| --- | --- |
| `prisma/schema.prisma` | Comment block on `ContactUpdateRequest` model updated to explain the model is now read-only on the staff side. |
| `tsconfig.json` | Removed the two deleted scripts from the `exclude` list. |
| `src/components/app/app-shell.tsx` | Comment updated — was "REPRESENTATIVE users are redirected to /portal before reaching here", now "The Representative role was removed (D7) — every authenticated user is staff". |
| `src/app/api/tasks/route.ts` | Comment block updated to note the role was removed and OFFICER is the only union-scoped staff role. |
| `src/app/api/documents/route.ts` | Comment — removed `+ REPRESENTATIVE` from the scoping note. |
| `src/app/api/documents/[id]/route.ts` | Comment — same. |
| `src/app/api/search/route.ts` | Comments — same. |
| `src/app/api/unions/[unionId]/documents/route.ts` | Comments — same. |
| `src/app/api/unions/[unionId]/documents/[documentId]/extract-text/route.ts` | Comment — same. |
| `src/app/api/unions/[unionId]/documents/[documentId]/versions/[versionId]/download/route.ts` | Comment — same. |
| `src/app/api/v1/unions/[unionId]/documents/route.ts` | Comment — same. |
| `src/lib/dashboard/vocabulary.ts` | Comments updated — PortalShell references now note it was removed in D7; `parsePortalLinkUrl` docstring notes it's kept because contact-requests approve/reject routes still call `portalLinkUrl()`. |
| `src/lib/__tests__/route-coverage.test.ts` | Removed the 5 `/api/portal/*` entries from the `keyRoutes` allowlist. |

## 7. Out-of-scope findings (note for follow-up)

These are NOT touched by this commit. Each is a separate decision:

1. **`portalLinkUrl` / `parsePortalLinkUrl` / `inferLinkAudience`** in `src/lib/dashboard/vocabulary.ts` are now effectively dead. The only consumer of `parsePortalLinkUrl` was `PortalShell` (deleted here). `portalLinkUrl` is still called by `/api/contact-requests/[id]/{approve,reject}/route.ts` to generate notification linkUrls — but no rep user can exist to receive them, so those notifications are unreachable. Removing these helpers + rep-targeted notification creation is a separate cleanup task (it touches the email-template audience-aware button-label logic + the dashboard-links test).

2. **`ContactUpdateRequest` model + `/api/contact-requests/*` routes + `ContactRequestsView`** are still active on the staff side (Registrar review queue), but they have **no producer endpoint** after this commit (the only POST was the deleted `/api/portal/contact/requests`). The review queue will always be empty. This is a deliberate hold — the model + routes remain so historical rows (if any exist in other environments) remain queryable, and so the Registrar UI does not break. A future task can decide whether to drop the model entirely or repurpose the review-queue UI for a different submission flow.

---

## 8. Rollback

This commit is purely deletions + comment edits. To roll back:

1. `git revert <commit>` — restores all deleted files and reverts all comment edits.
2. Re-run `npx prisma db push` (no-op — schema enum unchanged).
3. Restart the dev server.

No data migration to reverse — no rows were changed.
