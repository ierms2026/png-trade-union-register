// =============================================================================
// step8-officer-null-union-test.ts — verify an Officer with null
// assignedUnionId sees NO data (D17 fail-closed).
//
// Creates a temporary Officer with no assigned union, logs in, hits every
// scoped endpoint, and prints the response. Every scoped endpoint must
// return either:
//   - 403 / { error: "Forbidden..." }, OR
//   - 200 with an EMPTY data set (e.g. { unions: [], tasks: [] }), OR
//   - 404 (for the reports/compliance page — notFound()).
//
// It must NOT return other unions' data.
// =============================================================================

import { db } from "../src/lib/prisma";
import bcrypt from "bcryptjs";

const BASE = "http://localhost:3000";
const TEST_EMAIL = `officer-null-union-test@example.com`;
import { requireDemoPassword } from "../src/lib/security/require-demo-password";
const TEST_PASSWORD = requireDemoPassword();

async function main() {
  // --- 1. Create a temporary Officer with no assigned union ---
  console.log("\n=== 1. Create Officer with assignedUnionId = null ===");
  // Clean up any previous run
  await db.user.deleteMany({ where: { email: TEST_EMAIL } }).catch(() => {});
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  const user = await db.user.create({
    data: {
      email: TEST_EMAIL,
      passwordHash,
      role: "OFFICER",
      assignedUnionId: null,
      twoFactorEnabled: false,
    },
  });
  console.log(`  Created user: ${user.email} (id=${user.id})`);
  console.log(`  assignedUnionId: ${user.assignedUnionId}`);

  try {
    // --- 2. Log in (get session cookie) ---
    console.log("\n=== 2. Log in ===");
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const loginBody = await loginRes.json();
    console.log(`  Login status: ${loginRes.status}`);
    if (!loginRes.ok || !loginBody.user) {
      console.log("  LOGIN FAILED:", JSON.stringify(loginBody));
      process.exit(1);
    }
    console.log(`  Logged in as: ${loginBody.user.email} (role=${loginBody.user.role}, assignedUnionId=${loginBody.user.assignedUnionId})`);
    // Extract the session cookie for subsequent requests
    const setCookie = loginRes.headers.get("set-cookie");
    const cookie = setCookie ? setCookie.split(";")[0] : "";
    console.log(`  Cookie: ${cookie.substring(0, 40)}...`);

    // --- 3. Hit every scoped endpoint ---
    console.log("\n=== 3. Hit scoped endpoints (must return nothing) ===");

    const endpoints = [
      { name: "GET /api/dashboard/stats", url: "/api/dashboard/stats" },
      { name: "GET /api/dashboard/activity", url: "/api/dashboard/activity" },
      { name: "GET /api/compliance", url: "/api/compliance" },
      { name: "GET /api/calendar", url: "/api/calendar" },
      { name: "GET /api/tasks", url: "/api/tasks" },
      { name: "GET /api/retention", url: "/api/retention" },
      { name: "GET /api/dashboard/document-types", url: "/api/dashboard/document-types" },
      { name: "GET /api/dashboard/trend", url: "/api/dashboard/trend" },
    ];

    let allPass = true;
    for (const ep of endpoints) {
      const res = await fetch(`${BASE}${ep.url}`, {
        headers: { Cookie: cookie },
      });
      const status = res.status;
      const text = await res.text();
      const bodyPreview = text.length > 300 ? text.slice(0, 300) + "..." : text;

      // Determine pass/fail: 403 is pass (explicit forbid). 200 with empty
      // data is pass. 200 with non-empty data containing union names is FAIL.
      let pass = false;
      let reason = "";
      if (status === 403) {
        pass = true;
        reason = "403 Forbidden (fail-closed)";
      } else if (status === 200) {
        // Check if the body contains any union data
        const lower = text.toLowerCase();
        const hasUnionData =
          lower.includes("papua maritime") ||
          lower.includes("highlands coffee") ||
          lower.includes("port moresby teachers") ||
          lower.includes("new ireland mining") ||
          lower.includes("east sepik") ||
          lower.includes("southern highlands energy");
        if (hasUnionData) {
          pass = false;
          reason = "FAIL — 200 with other unions' data!";
        } else {
          pass = true;
          reason = "200 with empty/no union data";
        }
      } else if (status === 404) {
        pass = true;
        reason = "404 Not Found (fail-closed via notFound)";
      } else {
        pass = false;
        reason = `Unexpected status ${status}`;
      }
      if (!pass) allPass = false;
      console.log(`\n  ${pass ? "PASS" : "FAIL"} ${ep.name}`);
      console.log(`    status: ${status}`);
      console.log(`    reason: ${reason}`);
      console.log(`    body:   ${bodyPreview}`);
    }

    // --- 4. Hit the reports/compliance page (server-rendered) ---
    console.log("\n=== 4. Hit /reports/compliance (server-rendered page) ===");
    const reportRes = await fetch(`${BASE}/reports/compliance`, {
      headers: { Cookie: cookie },
    });
    const reportText = await reportRes.text();
    const reportPreview = reportText.length > 200 ? reportText.slice(0, 200) + "..." : reportText;
    const reportHasUnionData =
      reportText.includes("Papua Maritime") ||
      reportText.includes("Highlands Coffee") ||
      reportText.includes("Port Moresby Teachers");
    let reportPass = false;
    let reportReason = "";
    if (reportRes.status === 404) {
      reportPass = true;
      reportReason = "404 (notFound — fail-closed)";
    } else if (reportRes.status === 200 && !reportHasUnionData) {
      reportPass = true;
      reportReason = "200 with no union data";
    } else if (reportRes.status === 200 && reportHasUnionData) {
      reportPass = false;
      reportReason = "FAIL — page rendered with other unions' data!";
    } else {
      reportPass = false;
      reportReason = `Unexpected status ${reportRes.status}`;
    }
    if (!reportPass) allPass = false;
    console.log(`  ${reportPass ? "PASS" : "FAIL"} /reports/compliance`);
    console.log(`    status: ${reportRes.status}`);
    console.log(`    reason: ${reportReason}`);
    console.log(`    body:   ${reportPreview}`);

    // --- 5. Summary ---
    console.log("\n=== 5. SUMMARY ===");
    console.log(`  Overall: ${allPass ? "PASS — Officer with null union sees NO data" : "FAIL — data leaked to unassigned Officer"}`);
    process.exit(allPass ? 0 : 1);
  } finally {
    // --- Cleanup: delete the test user ---
    await db.user.deleteMany({ where: { email: TEST_EMAIL } }).catch(() => {});
    console.log("\n  (cleaned up test user)");
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
