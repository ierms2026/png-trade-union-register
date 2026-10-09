// =============================================================================
// Pre-flight check: confirm no rows reference the removed REPRESENTATIVE role.
//
// Run this AGAINST STAGING AND PRODUCTION before deploying commit 973d6cd
// (the /portal dead-code deletion). The dev DB at db/custom.db has already
// been confirmed clean (0 rows). Staging/prod have NOT been checked from
// the dev environment — there is no remote DB access from here. An operator
// with access must run this script (or the SQL in
// docs/migration-remove-representative-role.md) against each environment
// before deploy.
//
// USAGE:
//   # Default: uses DATABASE_URL from the environment (same as the app).
//   DATABASE_URL=file:/path/to/staging.db npx tsx scripts/preflight-check-representative-rows.ts
//   DATABASE_URL=postgresql://user:pass@staging-host:5432/db npx tsx scripts/preflight-check-representative-rows.ts
//
//   # For a deployed Docker container (exec into the container, then run):
//   docker exec -it <container> sh -c 'DATABASE_URL=$DATABASE_URL npx tsx scripts/preflight-check-representative-rows.ts'
//
// EXIT CODES:
//   0 — clean (no rep rows; safe to deploy)
//   1 — rep rows found (run the row-handling SQL in the migration doc
//       BEFORE deploying; do NOT deploy until exit code is 0)
//   2 — could not connect to the DB (do NOT deploy — investigate first)
//
// IMPORTANT: this script uses $queryRawUnsafe so it can read rows whose
// role value is no longer in the Prisma Role enum. The typed Prisma client
// (db.user.findMany({ where: { role: "REPRESENTATIVE" } })) would throw
// "Invalid value for argument 'role'. Expected Role." before returning any
// rows — making it useless for the pre-flight check.
// =============================================================================

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type CountRow = { cnt: bigint | number };

async function main() {
  const label = process.env.DATABASE_URL || "(unset)";
  console.log(`\n=== Pre-flight check: REPRESENTATIVE role rows ===`);
  console.log(`DATABASE_URL: ${label}\n`);

  // 1. Distinct roles currently in the DB. Lets the operator eyeball
  //    what's there.
  let roles: Array<{ role: string }>;
  try {
    roles = await db.$queryRawUnsafe<{ role: string }[]>(
      "SELECT DISTINCT role FROM \"User\" UNION SELECT DISTINCT role FROM User",
    );
  } catch {
    // SQLite uses unquoted table names; the UNION above handles both
    // Postgres (quoted) and SQLite (unquoted) by failing softly on the
    // half that doesn't match. If both halves fail, the catch below
    // will surface the real error.
    roles = await db.$queryRawUnsafe<{ role: string }[]>(
      "SELECT DISTINCT role FROM User",
    );
  }
  console.log(`Distinct roles present:        ${roles.map((r) => r.role).join(", ")}`);

  // 2. User rows still on the removed role.
  const repUsers = await db.$queryRawUnsafe<CountRow[]>(
    "SELECT COUNT(*) AS cnt FROM User WHERE role = ?",
    "REPRESENTATIVE",
  );
  const repCount = Number(repUsers[0]?.cnt ?? 0);
  console.log(`User rows with role=REPRESENTATIVE: ${repCount}`);

  // 3. ContactUpdateRequest rows (any status). These are the rows the
  //    deleted /portal/contact/requests endpoint would have produced.
  //    They need no migration — there's no FK from
  //    ContactUpdateRequest.requestedById to User.role — but the count
  //    tells the operator whether the model is genuinely unused.
  let curTotal = 0;
  let curPending = 0;
  try {
    const t = await db.$queryRawUnsafe<CountRow[]>(
      "SELECT COUNT(*) AS cnt FROM ContactUpdateRequest",
    );
    curTotal = Number(t[0]?.cnt ?? 0);
    const p = await db.$queryRawUnsafe<CountRow[]>(
      "SELECT COUNT(*) AS cnt FROM ContactUpdateRequest WHERE status = ?",
      "PENDING",
    );
    curPending = Number(p[0]?.cnt ?? 0);
  } catch (e) {
    // Table may not exist on a fresh DB; treat as 0.
    console.log(`  (ContactUpdateRequest table not readable: ${(e as Error).message})`);
  }
  console.log(`ContactUpdateRequest rows (total):   ${curTotal}`);
  console.log(`ContactUpdateRequest rows (PENDING): ${curPending}`);

  console.log("");
  if (repCount > 0) {
    console.log("FAIL: this environment still has User rows with role=REPRESENTATIVE.");
    console.log("      Run the row-handling SQL in docs/migration-remove-representative-role.md");
    console.log("      (UPDATE User SET role='OFFICER' WHERE role='REPRESENTATIVE') BEFORE");
    console.log("      deploying commit 973d6cd. Do NOT deploy until this script exits 0.");
    process.exit(1);
  }
  console.log("PASS: no User rows reference the removed REPRESENTATIVE role.");
  console.log("      Safe to deploy commit 973d6cd to this environment.");
  process.exit(0);
}

main()
  .catch((e) => {
    console.error("\nERROR: could not run the pre-flight check.");
    console.error(`  ${e.message}`);
    console.error("\nDo NOT deploy commit 973d6cd until you can connect and confirm");
    console.error("0 rep rows. Investigate the DB connection first.");
    process.exit(2);
  })
  .finally(() => db.$disconnect());
