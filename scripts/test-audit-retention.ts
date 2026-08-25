// Smoke-test for the audit retention sweep.
//
// Inserts 4 test entries with manipulated createdAt timestamps:
//   - INFO, 400 days old  → should survive (within 365d window... wait, 400 > 365, should be PRUNED)
//   - INFO, 200 days old  → should survive (within 365d window)
//   - WARNING, 1100 days old → should be PRUNED (older than 3yr = 1095d)
//   - CRITICAL, 1100 days old → should SURVIVE (never pruned)
//
// Then runs the prune logic (same code as the route, called directly to
// avoid needing CRON_SECRET + server restart) and verifies the counts.
//
// Cleanup: deletes any remaining test entries at the end so the DB is
// left clean.
//
// Run: npx tsx /home/z/my-project/scripts/test-audit-retention.ts

import { db } from "../src/lib/prisma";
import { Severity } from "@prisma/client";

const RETENTION_DAYS = {
  INFO: 365,
  WARNING: 365 * 3,
};
const BATCH_SIZE = 1000;
const MAX_ITERATIONS = 500;

async function pruneSeverity(
  severity: Exclude<Severity, "CRITICAL">,
  cutoff: Date,
): Promise<number> {
  let totalDeleted = 0;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await db.auditLog.deleteMany({
      where: {
        severity,
        createdAt: { lt: cutoff },
      },
    });
    totalDeleted += result.count;
    if (result.count === 0) break;
  }
  return totalDeleted;
}

async function main() {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  // --- 1. Insert test entries with backdated createdAt --------------------
  // Prisma doesn't let you set createdAt directly on @default(now()) fields
  // during create... actually it DOES — you can override the default. Let's
  // try.
  const testEntries = [
    {
      label: "INFO 400d old (should be PRUNED, > 365d)",
      severity: Severity.INFO,
      ageDays: 400,
    },
    {
      label: "INFO 200d old (should SURVIVE, < 365d)",
      severity: Severity.INFO,
      ageDays: 200,
    },
    {
      label: "WARNING 1100d old (should be PRUNED, > 1095d)",
      severity: Severity.WARNING,
      ageDays: 1100,
    },
    {
      label: "CRITICAL 1100d old (should SURVIVE, never pruned)",
      severity: Severity.CRITICAL,
      ageDays: 1100,
    },
  ];

  console.log("=== Inserting test entries ===");
  const insertedIds: string[] = [];
  for (const t of testEntries) {
    const created = await db.auditLog.create({
      data: {
        actorId: null,
        actorName: "retention-test",
        action: "test_retention_probe",
        entityType: "Test",
        entityId: null,
        severity: t.severity,
        createdAt: new Date(now - t.ageDays * DAY),
      },
    });
    insertedIds.push(created.id);
    console.log(`  inserted ${t.severity} ${t.ageDays}d old → id=${created.id}`);
  }

  // --- 2. Run the prune logic (same as the route) -------------------------
  console.log("\n=== Running prune ===");
  const infoCutoff = new Date(now - RETENTION_DAYS.INFO * DAY);
  const warningCutoff = new Date(now - RETENTION_DAYS.WARNING * DAY);
  console.log(`  INFO cutoff:    ${infoCutoff.toISOString()}`);
  console.log(`  WARNING cutoff: ${warningCutoff.toISOString()}`);

  const infoPruned = await pruneSeverity("INFO", infoCutoff);
  const warningPruned = await pruneSeverity("WARNING", warningCutoff);
  console.log(`  pruned INFO:    ${infoPruned}`);
  console.log(`  pruned WARNING: ${warningPruned}`);
  console.log(`  pruned CRITICAL: 0 (never pruned)`);

  // --- 3. Verify the test entries ------------------------------------------
  console.log("\n=== Verifying test entries ===");
  let allPass = true;
  for (let i = 0; i < testEntries.length; i++) {
    const t = testEntries[i];
    const id = insertedIds[i];
    const found = await db.auditLog.findUnique({ where: { id } });
    const shouldSurvive =
      t.severity === "CRITICAL" ||
      (t.severity === "INFO" && t.ageDays <= RETENTION_DAYS.INFO) ||
      (t.severity === "WARNING" && t.ageDays <= RETENTION_DAYS.WARNING);

    const survived = found !== null;
    const pass = survived === shouldSurvive;
    console.log(
      `  ${pass ? "PASS" : "FAIL"}: ${t.label} → ${survived ? "survived" : "pruned"} (expected ${shouldSurvive ? "survive" : "prune"})`,
    );
    if (!pass) allPass = false;
  }

  // --- 4. Cleanup: delete any surviving test entries ----------------------
  console.log("\n=== Cleanup ===");
  const cleanup = await db.auditLog.deleteMany({
    where: { actorName: "retention-test" },
  });
  console.log(`  deleted ${cleanup.count} remaining test entries`);

  console.log(`\n=== ${allPass ? "ALL TESTS PASSED" : "SOME TESTS FAILED"} ===`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
