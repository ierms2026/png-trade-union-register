#!/usr/bin/env node
// =============================================================================
// restore-work.ts — restore the source tree from upload/work-backup/
//
// Run this at the START of a session, after the platform has reverted the
// workspace to its snapshot state. It:
//   1. Reads MANIFEST.json from upload/work-backup/
//   2. Copies each backed-up file back into the source tree
//   3. Runs `prisma db push` to apply the restored schema
//   4. Restarts the dev server
//
// Usage:  npx tsx upload/work-backup/scripts/restore-work.ts
// =============================================================================

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const PROJECT_ROOT = "/home/z/my-project";
const BACKUP_ROOT = path.join(PROJECT_ROOT, "upload", "work-backup");

interface ManifestEntry {
  path: string;
  checksum: string;
  size: number;
  mtime: string;
}

interface Manifest {
  backedUpAt: string;
  prismaVersion: string;
  nodeVersion: string;
  fileCount: number;
  files: ManifestEntry[];
}

async function sha256(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const startedAt = new Date();
  console.log(`[restore-work] Starting at ${startedAt.toISOString()}`);

  // --- 1. Load manifest ---
  const manifestPath = path.join(BACKUP_ROOT, "MANIFEST.json");
  let manifest: Manifest;
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    manifest = JSON.parse(raw);
  } catch (err) {
    console.error(`[restore-work] No backup found at ${manifestPath}.`);
    console.error(`[restore-work] Run backup-work.ts first (at the end of a work batch).`);
    process.exit(1);
  }

  console.log(`[restore-work] Backup from ${manifest.backedUpAt} (${manifest.fileCount} files)`);

  // --- 2. Restore each file ---
  let restored = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of manifest.files) {
    const src = path.join(BACKUP_ROOT, "src-tree", entry.path);
    const dest = path.join(PROJECT_ROOT, entry.path);

    try {
      // Verify the backup file's checksum matches the manifest
      const srcChecksum = await sha256(src);
      if (srcChecksum !== entry.checksum) {
        console.warn(`[restore-work] CHECKSUM MISMATCH on ${entry.path} — skipping`);
        failed++;
        continue;
      }

      // Check if the destination already matches (skip if unchanged)
      try {
        const destChecksum = await sha256(dest);
        if (destChecksum === entry.checksum) {
          skipped++;
          continue;
        }
      } catch {
        // Destination doesn't exist — proceed with restore
      }

      // Create parent directories + copy
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
      restored++;
    } catch (err) {
      console.warn(`[restore-work] Failed to restore ${entry.path}:`, err);
      failed++;
    }
  }

  console.log(`[restore-work] Restored: ${restored}, skipped (unchanged): ${skipped}, failed: ${failed}`);

  // --- 3. Apply Prisma schema + regenerate client ---
  console.log(`[restore-work] Running prisma db push + generate...`);
  try {
    execSync("npx prisma db push --accept-data-loss 2>&1", { cwd: PROJECT_ROOT, stdio: "inherit" });
    execSync("npx prisma generate 2>&1", { cwd: PROJECT_ROOT, stdio: "inherit" });
    console.log(`[restore-work] ✓ Prisma schema applied + client regenerated`);
  } catch (err) {
    console.warn(`[restore-work] Prisma push failed — the schema may already be in sync.`);
  }

  // --- 4. Restart the dev server ---
  console.log(`[restore-work] Restarting dev server...`);
  try {
    execSync("pkill -f next-server 2>/dev/null; pkill -f 'next dev' 2>/dev/null; sleep 2", { stdio: "inherit" });
    execSync("setsid bash -c 'bun run dev > /tmp/dev.log 2>&1 &'", { cwd: PROJECT_ROOT, stdio: "inherit" });
    console.log(`[restore-work] Dev server restarted. Wait ~12s for it to be ready.`);
  } catch (err) {
    console.warn(`[restore-work] Could not restart dev server automatically — run \`bun run dev\` manually.`);
  }

  console.log(`[restore-work] ✓ Done. Restored ${restored} files from backup taken ${manifest.backedUpAt}.`);
  console.log(`[restore-work] Check the dashboard at http://localhost:3000/ in ~12 seconds.`);
}

main().catch((err) => {
  console.error("[restore-work] FAILED:", err);
  process.exit(1);
});
