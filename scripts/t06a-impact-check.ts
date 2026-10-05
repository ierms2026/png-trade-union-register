// T06a impact check: report dashboard counts before vs after.
// Run: npx tsx scripts/t06a-impact-check.ts

import { db } from "../src/lib/prisma";
import { fetchMatrixData, buildComplianceMatrix } from "../src/lib/compliance/matrix";
import { tallyStatuses, computeRateFromCounts } from "../src/lib/dashboard/metrics";

async function main() {
  const data = await fetchMatrixData();
  const matrix = buildComplianceMatrix(data);
  const allCells = matrix.unions.flatMap((row) => row.scores);

  // AFTER (new code): uses tallyStatuses + computeRateFromCounts
  const countsAfter = tallyStatuses(allCells);
  const rateAfter = computeRateFromCounts(countsAfter);

  // BEFORE (old code): manual switch that omitted AWAITING_REVIEW
  let compliant = 0, expiring = 0, overdue = 0, missing = 0, notApplicable = 0;
  for (const cell of allCells) {
    switch (cell.status) {
      case "COMPLIANT": compliant++; break;
      case "EXPIRING": expiring++; break;
      case "OVERDUE": overdue++; break;
      case "MISSING": missing++; break;
      case "NOT_APPLICABLE": notApplicable++; break;
      // AWAITING_REVIEW: NO CASE — silently dropped
    }
  }
  const applicableBefore = compliant + expiring + overdue + missing;
  const overallRateBefore = applicableBefore === 0 ? 0 : Math.round((compliant / applicableBefore) * 100);

  console.log("=== T06a Impact Check ===\n");
  console.log("Status          BEFORE (old)    AFTER (new)");
  console.log("───────────────  ────────────    ───────────");
  console.log(`COMPLIANT         ${compliant}              ${countsAfter.COMPLIANT}`);
  console.log(`EXPIRING          ${expiring}               ${countsAfter.EXPIRING}`);
  console.log(`OVERDUE           ${overdue}               ${countsAfter.OVERDUE}`);
  console.log(`AWAITING_REVIEW   (not counted)     ${countsAfter.AWAITING_REVIEW}`);
  console.log(`MISSING           ${missing}              ${countsAfter.MISSING}`);
  console.log(`NOT_APPLICABLE    ${notApplicable}              ${countsAfter.NOT_APPLICABLE}`);
  console.log("");
  console.log(`Applicable (denom) ${applicableBefore}              ${rateAfter.denominator}`);
  console.log(`Overall rate       ${overallRateBefore}%              ${rateAfter.percentage}%`);
  console.log("");
  if (countsAfter.AWAITING_REVIEW > 0) {
    console.log(`⚠ ${countsAfter.AWAITING_REVIEW} AWAITING_REVIEW cells were silently dropped before.`);
    console.log(`  They were counted as neither MISSING nor AWAITING_REVIEW — just invisible.`);
    console.log(`  The denominator was ${applicableBefore} (undercounted by ${countsAfter.AWAITING_REVIEW}).`);
    console.log(`  The rate was ${overallRateBefore}% (inflated because the denominator was too small).`);
    console.log(`  New rate: ${rateAfter.percentage}% (denominator includes AWAITING_REVIEW).`);
  } else {
    console.log("No AWAITING_REVIEW cells in the current data — no numeric change, but the code is now correct.");
  }

  await db.$disconnect();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
