// One-off: scan the DB for notifications with non-canonical linkUrl values.
// Run: npx tsx /home/z/my-project/scripts/check-notification-links.ts

import { db } from "../src/lib/prisma";

async function main() {
  const all = await db.notification.findMany({
    where: { linkUrl: { not: null } },
    select: { id: true, linkUrl: true, title: true, createdAt: true },
  });

  console.log(`Total notifications with linkUrl: ${all.length}\n`);

  // Categorize by format
  type NotifRow = { id: string; linkUrl: string | null; title: string; createdAt: Date };
  const canonical: NotifRow[] = []; // /?view=X or /portal?view=X
  const plainPath: NotifRow[] = []; // /reviews, /unions, etc. (no ?view=)
  const other: NotifRow[] = []; // anything else

  for (const n of all) {
    const url = n.linkUrl!;
    if (url.startsWith("/?view=") || url.startsWith("/portal?view=")) {
      canonical.push(n);
    } else if (/^\/[a-z]/.test(url) && !url.includes("?view=")) {
      plainPath.push(n);
    } else {
      other.push(n);
    }
  }

  console.log(`Canonical format (/?view=X or /portal?view=X): ${canonical.length}`);
  console.log(`Plain path (no ?view=, e.g. /reviews):         ${plainPath.length}`);
  console.log(`Other:                                          ${other.length}\n`);

  if (plainPath.length > 0) {
    console.log("--- Plain-path linkUrls (need migration) ---");
    for (const n of plainPath.slice(0, 20)) {
      console.log(`  ${n.id}  linkUrl=${n.linkUrl}  title="${n.title}"`);
    }
    if (plainPath.length > 20) console.log(`  ... and ${plainPath.length - 20} more`);
    console.log();
  }

  if (other.length > 0) {
    console.log("--- Other linkUrls (need investigation) ---");
    for (const n of other.slice(0, 20)) {
      console.log(`  ${n.id}  linkUrl=${n.linkUrl}  title="${n.title}"`);
    }
    if (other.length > 20) console.log(`  ... and ${other.length - 20} more`);
    console.log();
  }

  if (plainPath.length === 0 && other.length === 0) {
    console.log("✓ All notification linkUrls are in canonical format. No migration needed.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
