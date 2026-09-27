#!/usr/bin/env node
// =============================================================================
// backup-work.ts — snapshot the current source tree into upload/work-backup/
//
// Run this at the end of every work batch. It copies:
//   - src/**/* (all source files)
//   - prisma/**/* (schema, seed scripts, text generators)
//   - scripts/**/* (backfill, smoke tests, PDF generators, cron.sh)
//   - .env (so custom env vars survive)
//   - package.json
//   - A MANIFEST.json listing every backed-up file + its SHA-256 + mtime
//
// The backup lives in upload/work-backup/ which is OUTSIDE the snapshot path
// and survives session rehydration. Restore with restore-work.ts.
//
// Usage:  npx tsx upload/work-backup/scripts/backup-work.ts
// =============================================================================

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PROJECT_ROOT = "/home/z/my-project";
const BACKUP_ROOT = path.join(PROJECT_ROOT, "upload", "work-backup");
const SOURCE_DIRS = ["src", "prisma", "scripts"];
const EXTRA_FILES = [".env", "package.json"];

interface ManifestEntry {
  path: string;          // relative to PROJECT_ROOT, e.g. "src/lib/auth/constants.ts"
  checksum: string;       // SHA-256 hex
  size: number;
  mtime: string;          // ISO 8601
}

async function walk(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    console.warn(`[backup-work] Could not read directory ${dir}:`, err);
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Skip node_modules, .next, .git — they're huge and not source.
      // Also skip other build/dist directories.
      if (e.name === "node_modules" || e.name === ".next" || e.name === ".git" || e.name === "dist" || e.name === "build") continue;
      out.push(...await walk(full));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
}

async function sha256(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function backupFile(absPath: string, relPath: string): Promise<ManifestEntry | null> {
  try {
    const stat = await fs.stat(absPath);
    const checksum = await sha256(absPath);
    const dest = path.join(BACKUP_ROOT, "src-tree", relPath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(absPath, dest);
    return {
      path: relPath,
      checksum,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
    };
  } catch (err) {
    // File might be transiently unavailable (dev server hot-reload, etc.)
    // — skip it rather than failing the whole backup.
    console.warn(`[backup-work] Skipping ${relPath}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function main() {
  const startedAt = new Date();
  console.log(`[backup-work] Starting at ${startedAt.toISOString()}`);

  // Clear the previous backup's source tree (keep the scripts/ dir)
  const srcTreeBackup = path.join(BACKUP_ROOT, "src-tree");
  try {
    await fs.rm(srcTreeBackup, { recursive: true, force: true });
  } catch { /* ok if it doesn't exist */ }
  await fs.mkdir(srcTreeBackup, { recursive: true });

  const manifest: ManifestEntry[] = [];

  // Back up the source directories (src/)
  for (const dir of SOURCE_DIRS) {
    const absDir = path.join(PROJECT_ROOT, dir);
    const files = await walk(absDir);
    for (const f of files) {
      const rel = path.relative(PROJECT_ROOT, f);
      const entry = await backupFile(f, rel);
      if (entry) manifest.push(entry);
    }
  }

  // Back up extra individual files
  for (const rel of EXTRA_FILES) {
    const abs = path.join(PROJECT_ROOT, rel);
    const entry = await backupFile(abs, rel);
    if (entry) manifest.push(entry);
  }

  // Write the manifest
  const manifestPath = path.join(BACKUP_ROOT, "MANIFEST.json");
  const manifestContent = {
    backedUpAt: startedAt.toISOString(),
    prismaVersion: "6.19.2",
    nodeVersion: process.version,
    fileCount: manifest.length,
    files: manifest,
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifestContent, null, 2));

  // Also write a small restore-log stub so restore-work.ts knows the format
  console.log(`[backup-work] Backed up ${manifest.length} files to ${BACKUP_ROOT}`);
  console.log(`[backup-work] Manifest: ${manifestPath}`);
  console.log(`[backup-work] To restore: npx tsx upload/work-backup/scripts/restore-work.ts`);
}

main().catch((err) => {
  console.error("[backup-work] FAILED:", err);
  process.exit(1);
});
