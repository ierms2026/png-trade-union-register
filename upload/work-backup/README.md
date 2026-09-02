# Work Backup & Restore

The platform's session-rehydration process restores the workspace from a
snapshot taken before the conversation started. This wipes all source code
changes and git commits.

This directory (`upload/work-backup/`) survives the snapshot because it lives
under `upload/`, which is outside the snapshot path. Use these scripts to
back up your work at the end of a session and restore it at the start of the
next one.

## Commands

### Back up (run at the end of every work batch)

```bash
npx tsx upload/work-backup/scripts/backup-work.ts
# or via the symlink:
npx tsx scripts/backup-work.ts
```

Copies all source files (`src/`, `prisma/schema.prisma`, `.env`, `package.json`)
into `upload/work-backup/src-tree/`, plus a `MANIFEST.json` with SHA-256
checksums for verification on restore.

### Restore (run at the start of every session)

```bash
npx tsx upload/work-backup/scripts/restore-work.ts
# or via the symlink:
npx tsx scripts/restore-work.ts
```

Reads `MANIFEST.json`, copies each file back into the source tree (skipping
any that already match), runs `prisma db push` + `prisma generate` to apply
the restored schema, and restarts the dev server.

## What survives vs what doesn't

| Component | Survives session restart? |
|-----------|----------------------------|
| `db/custom.db` (data) | ✅ Yes — outside snapshot path |
| `upload/` directory | ✅ Yes — outside snapshot path |
| `upload/work-backup/` (these backups) | ✅ Yes |
| Source files in `src/` | ❌ No — restored from snapshot |
| `.env` | ❌ No — restored from snapshot |
| `prisma/schema.prisma` | ❌ No — restored from snapshot |
| Git commits in `.git/` | ❌ No — restored from snapshot |

## Workflow

1. **End of a work batch:** ask the assistant to "back up the work" — they
   run `backup-work.ts`.
2. **Start of next session:** ask the assistant to "restore the work from
   backup" — they run `restore-work.ts`. The source tree, `.env`, and Prisma
   schema come back in ~10 seconds.
3. The dev server restarts automatically (the restore script attempts to
   restart it; if that fails, run `bun run dev` manually).

## Verification

The restore script verifies each file's SHA-256 against the manifest before
copying, so a corrupted backup will be detected. Files that already match
the backup are skipped (idempotent restore).

## What's NOT backed up

- `node_modules/` — reinstalled by `bun install` (package.json IS backed up)
- `.next/` — build cache, regenerated on dev server start
- `.git/` — git history is lost on snapshot revert; cannot be backed up
  here because the snapshot also restores `.git/`
- `db/custom.db` — survives anyway (outside snapshot path)
- `storage/` — document files; survives anyway (outside snapshot path)

## Limitations

- Git commits made during the session are **lost**. The backup only
  preserves the source tree, not git history.
- The dev server may briefly lock files during hot-reload. The backup
  script skips locked files rather than failing, so a backup might miss
  1-2 files. Re-run the backup when the dev server is stopped for a
  complete snapshot.
