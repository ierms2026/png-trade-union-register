#!/usr/bin/env node
// =============================================================================
// scripts/restore-work.ts — convenience wrapper.
//
// The REAL script lives at upload/work-backup/scripts/restore-work.ts (which
// is outside the snapshot path and survives session rehydration). This file
// is just a shorter path so users can type:
//
//   npx tsx scripts/restore-work.ts
//
// instead of the longer canonical path. The canonical script calls its
// main() at module load, so importing it is sufficient to run the restore.
//
// WHY A WRAPPER INSTEAD OF A SYMLINK:
//   The build environment doesn't allow creating symlinks via the tooling,
//   and a wrapper achieves the same UX (one short command) without that
//   limitation. The canonical script is the source of truth — edit there,
//   not here. If the canonical script's path ever changes, update the
//   import path below.
//
// WHAT HAPPENS ON SESSION REVERT:
//   scripts/ is inside the snapshot path, so this wrapper gets wiped on
//   every session revert. But the backup script captures the canonical
//   script's content into the manifest (it follows the import), and
//   restore-work.ts writes that content back to scripts/restore-work.ts
//   as a real file (not a wrapper) on the next restore. So after the
//   first restore, both paths work — the canonical path because it
//   always did, and scripts/restore-work.ts because it now contains the
//   actual script content.
//
// USAGE NOTE:
//   At the very start of a fresh session (after the platform has reverted
//   the workspace), this wrapper does NOT yet exist — the snapshot wiped
//   it. Use the canonical path for that first restore:
//
//     npx tsx upload/work-backup/scripts/restore-work.ts
//
//   That restore writes scripts/restore-work.ts back as a real file with
//   the canonical content, so subsequent restores within the same session
//   can use the shorter `npx tsx scripts/restore-work.ts` path.
// =============================================================================

import "../upload/work-backup/scripts/restore-work.ts";
