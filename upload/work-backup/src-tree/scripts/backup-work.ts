#!/usr/bin/env node
// =============================================================================
// scripts/backup-work.ts — convenience wrapper.
//
// The REAL script lives at upload/work-backup/scripts/backup-work.ts (which
// is outside the snapshot path and survives session rehydration). This file
// is just a shorter path so users can type:
//
//   npx tsx scripts/backup-work.ts
//
// instead of the longer canonical path. The canonical script calls its
// main() at module load, so importing it is sufficient to run the backup.
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
//   every session revert. But the backup script itself (run via
//   upload/work-backup/scripts/backup-work.ts) captures the canonical
//   script's content into the manifest, and restore-work.ts writes it
//   back to scripts/backup-work.ts as a real file (not a wrapper) on the
//   next restore. So after the first restore, both paths work — the
//   canonical path because it always did, and scripts/backup-work.ts
//   because it now contains the actual script content.
// =============================================================================

import "../upload/work-backup/scripts/backup-work.ts";
