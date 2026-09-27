// Mark all existing documents as APPROVED so the system starts in a clean
// state (existing seed data is pre-review-workflow, so it should be treated
// as already-approved). New uploads will go through the PENDING flow.
// Run: npx tsx scripts/seed-approved-reviews.ts

import { db } from "../src/lib/prisma";
import { ReviewStatus } from "@prisma/client";

async function main() {
  const result = await db.document.updateMany({
    where: { reviewStatus: ReviewStatus.PENDING },
    data: {
      reviewStatus: ReviewStatus.APPROVED,
      reviewedAt: new Date(),
      reviewedById: null, // system migration — no specific reviewer
    },
  });
  console.log(`Marked ${result.count} existing documents as APPROVED (clean baseline).`);

  // Verify
  const counts = await db.document.groupBy({
    by: ["reviewStatus"],
    _count: { _all: true },
  });
  console.log("Current review status distribution:");
  for (const c of counts) {
    console.log(`  ${c.reviewStatus}: ${c._count._all}`);
  }
}

main().catch(console.error).finally(() => db.$disconnect());
