// One-off migration: convert legacy plain-path notification linkUrls to the
// canonical format (/?view=X for staff, /portal?view=X for portal).
//
// Before this migration, the DB had 12 notifications with linkUrls like
// "/compliance" and "/tasks" (plain paths without ?view=). These caused
// silent failures when clicked — parseLinkUrl returned null (no ?view= param),
// so the click did nothing.
//
// After migration:
//   /compliance     → /?view=compliance
//   /tasks          → /?view=tasks
//   /reviews        → /?view=reviews
//   /unions         → /?view=unions
//   /portal/contact → /portal?view=contact
//   etc.
//
// Run: npx tsx /home/z/my-project/scripts/migrate-notification-links.ts

import { db } from "../src/lib/prisma";

function migrateLinkUrl(linkUrl: string): string | null {
  // Already canonical? Leave it.
  if (linkUrl.startsWith("/?view=") || linkUrl.startsWith("/portal?view=")) {
    return null; // no change needed
  }

  // Portal plain-path: /portal/contact → /portal?view=contact
  if (linkUrl.startsWith("/portal/")) {
    const view = linkUrl.slice("/portal/".length);
    return `/portal?view=${view}`;
  }

  // Staff plain-path: /compliance → /?view=compliance
  if (linkUrl.startsWith("/") && !linkUrl.includes("?")) {
    const view = linkUrl.slice(1); // remove leading /
    if (view.length > 0) {
      return `/?view=${view}`;
    }
  }

  // Anything else — log it but don't change it (needs manual review).
  return null;
}

async function main() {
  const all = await db.notification.findMany({
    where: { linkUrl: { not: null } },
    select: { id: true, linkUrl: true, title: true },
  });

  console.log(`Found ${all.length} notifications with linkUrl.\n`);

  let migrated = 0;
  let skipped = 0;
  let unchanged = 0;

  for (const n of all) {
    const newUrl = migrateLinkUrl(n.linkUrl!);
    if (newUrl === null) {
      // Already canonical or unrecognized — skip.
      if (n.linkUrl!.startsWith("/?view=") || n.linkUrl!.startsWith("/portal?view=")) {
        unchanged++;
      } else {
        skipped++;
        console.log(`  SKIP (unrecognized format): ${n.id}  linkUrl=${n.linkUrl}`);
      }
      continue;
    }

    await db.notification.update({
      where: { id: n.id },
      data: { linkUrl: newUrl },
    });
    migrated++;
    console.log(`  MIGRATED: ${n.linkUrl} → ${newUrl}  (${n.title})`);
  }

  console.log(`\n--- Summary ---`);
  console.log(`Migrated:  ${migrated}`);
  console.log(`Unchanged: ${unchanged} (already canonical)`);
  console.log(`Skipped:   ${skipped} (unrecognized format)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
