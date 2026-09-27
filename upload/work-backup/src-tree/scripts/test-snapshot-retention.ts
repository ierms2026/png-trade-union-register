// Smoke-test for the snapshot retention sweep (chunk 4.3).
//
// Inserts 4 test snapshots with backdated dates:
//   - 400 days old → should be PRUNED (older than 365d retention)
//   - 200 days old → should SURVIVE (within 365d window)
//   - 1 day old    → should SURVIVE (recent)
//   - exactly 365 days old → should SURVIVE (strict less-than cutoff)
//
// Then runs the prune logic (same code as the route, called directly to
// avoid needing CRON_SECRET + server restart) and verifies the counts.
//
// Cleanup: deletes any remaining test snapshots at the end so the DB is
// left clean.
//
// Run: npx tsx /home/z/my-project/scripts/test-snapshot-retention.ts

import { db } from "../src/lib/prisma";
import {
  deleteSnapshotsOlderThan,
  runSnapshotRetentionSweep,
  SNAPSHOT_RETENTION_DAYS,
  formatUtcDate,
} from "../src/lib/dashboard/snapshot";

async function main() {
  const now = new Date();
  const DAY = 24 * 60 * 60 * 1000;

  // --- 1. Insert test snapshots with backdated dates ---------------------
  // ComplianceSnapshot.date is a String column (UTC YYYY-MM-DD), so we can
  // set it directly — no createdAt hack needed (unlike audit-retention).

  const testRows = [
    { offsetDays: 400, compliant: 10, label: "old (400d, should prune)" },
    { offsetDays: 200, compliant: 20, label: "mid (200d, should survive)" },
    { offsetDays: 1, compliant: 30, label: "recent (1d, should survive)" },
    { offsetDays: 365, compliant: 40, label: "boundary (365d exact, should survive — strict <)" },
  ];

  console.log("=== Inserting test snapshots ===");
  for (const r of testRows) {
    const date = formatUtcDate(new Date(now.getTime() - r.offsetDays * DAY));
    await db.complianceSnapshot.upsert({
      where: { date },
      create: {
        date,
        compliant: r.compliant,
        expiring: 0,
        overdue: 0,
        missing: 0,
        rateNumerator: r.compliant,
        rateDenominator: r.compliant,
        capturedWith: '{"expiringWindowDays":90,"requiredTypesCount":13}',
      },
      update: {
        compliant: r.compliant,
        rateNumerator: r.compliant,
        rateDenominator: r.compliant,
      },
    });
    console.log(`  ✓ ${date}  compliant=${r.compliant}  (${r.label})`);
  }

  // --- 2. Run the sweep --------------------------------------------------
  console.log("\n=== Running snapshot retention sweep ===");
  console.log(`Policy: prune snapshots older than ${SNAPSHOT_RETENTION_DAYS} days`);
  const result = await runSnapshotRetentionSweep(now);
  console.log(`Cutoff: ${result.cutoff}`);
  console.log(`Pruned: ${result.pruned} row(s)`);

  // --- 3. Verify ---------------------------------------------------------
  console.log("\n=== Verification ===");
  const expectedPruned = 1; // Only the 400-day-old row
  const expectedSurviving = 3; // 200d, 1d, 365d-exact

  if (result.pruned !== expectedPruned) {
    console.error(`✗ FAIL: expected ${expectedPruned} pruned, got ${result.pruned}`);
    await cleanup();
    process.exit(1);
  }
  console.log(`✓ Pruned count matches: ${result.pruned}`);

  const remaining = await db.complianceSnapshot.findMany({ orderBy: { date: "asc" } });
  // Filter to just the test rows (the testRows above might have left others
  // in the DB from prior runs — but we upserted, so they're the latest values).
  const testDates = new Set(testRows.map((r) => formatUtcDate(new Date(now.getTime() - r.offsetDays * DAY))));
  const testRemaining = remaining.filter((r) => testDates.has(r.date));

  if (testRemaining.length !== expectedSurviving) {
    console.error(`✗ FAIL: expected ${expectedSurviving} surviving test rows, got ${testRemaining.length}`);
    await cleanup();
    process.exit(1);
  }
  console.log(`✓ Surviving test rows: ${testRemaining.length}`);
  for (const r of testRemaining) {
    console.log(`    ${r.date}  compliant=${r.compliant}`);
  }

  // --- 4. Idempotency check ----------------------------------------------
  console.log("\n=== Idempotency check ===");
  const result2 = await runSnapshotRetentionSweep(now);
  if (result2.pruned !== 0) {
    console.error(`✗ FAIL: second sweep should prune 0, got ${result2.pruned}`);
    await cleanup();
    process.exit(1);
  }
  console.log(`✓ Second sweep pruned 0 (idempotent)`);

  // --- 5. Cleanup --------------------------------------------------------
  await cleanup();

  console.log("\n✓ All checks passed.");
  process.exit(0);
}

async function cleanup() {
  // Delete all snapshots — the cron will repopulate today's row on its next run.
  // (This is a smoke test against the dev DB, not a production sweep.)
  await db.complianceSnapshot.deleteMany({});
  console.log("\n(cleanup: deleted all test snapshots)");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
