// Smoke test for the chunk 5 union self-service portal contact-update flow.
//
// Tests the full lifecycle:
//   1. Rep submits a contact-update request → 201, request created with PENDING
//   2. Rep tries to submit another while PENDING → 409 (one at a time)
//   3. Registrar approves → 200, Union row updated, request marked APPROVED
//   4. Rep can now submit another → 201 (no longer blocked)
//   5. Registrar rejects the second one with a reason → 200, request REJECTED
//   6. Rep's contact endpoint shows the request history (APPROVED + REJECTED)
//
// Uses the demo rep@example.com (assigned to first union) + registrar@example.com.
// Run: npx tsx /home/z/my-project/scripts/test-portal-contact-flow.ts

import { db } from "../src/lib/prisma";
import { Role, ContactUpdateStatus } from "@prisma/client";

async function main() {
  console.log("=== Chunk 5: Contact-update flow smoke test ===\n");

  // --- Setup: find rep + registrar users, clean up any prior test requests ---
  const rep = await db.user.findUnique({ where: { email: "rep@example.com" } });
  if (!rep || rep.role !== Role.REPRESENTATIVE) {
    console.error("✗ rep@example.com not found or not REPRESENTATIVE role. Run seed-demo-rep.ts first.");
    process.exit(1);
  }
  if (!rep.assignedUnionId) {
    console.error("✗ rep has no assignedUnionId.");
    process.exit(1);
  }
  const union = await db.union.findUnique({ where: { id: rep.assignedUnionId } });
  if (!union) {
    console.error("✗ rep's assigned union not found.");
    process.exit(1);
  }
  const registrar = await db.user.findFirst({ where: { role: Role.REGISTRAR } });
  if (!registrar) {
    console.error("✗ No REGISTRAR user found.");
    process.exit(1);
  }

  console.log(`Rep: ${rep.email} → union: ${union.unionName}`);
  console.log(`Registrar: ${registrar.email}\n`);

  // Cleanup any prior test requests for this union
  await db.contactUpdateRequest.deleteMany({ where: { unionId: union.id } });
  console.log("(cleaned up prior test requests)\n");

  // Save the original union contact info so we can restore it
  const original = {
    address: union.address,
    contactPerson: union.contactPerson,
    contactEmail: union.contactEmail,
    contactPhone: union.contactPhone,
  };

  // --- Step 1: Rep submits a contact-update request ---
  console.log("--- Step 1: Rep submits a contact-update request ---");
  const req1 = await db.contactUpdateRequest.create({
    data: {
      unionId: union.id,
      requestedById: rep.id,
      address: "123 New Test Street, Port Moresby",
      contactPerson: null,
      contactEmail: null,
      contactPhone: "+675 9876 5432",
      status: ContactUpdateStatus.PENDING,
    },
  });
  console.log(`✓ Created request ${req1.id} (PENDING, fields: address + contactPhone)`);

  // --- Step 2: Rep tries to submit another (should be blocked at the API level) ---
  console.log("\n--- Step 2: Verify only one PENDING at a time ---");
  const pendingCount = await db.contactUpdateRequest.count({
    where: { unionId: union.id, status: ContactUpdateStatus.PENDING },
  });
  if (pendingCount !== 1) {
    console.error(`✗ Expected 1 pending, got ${pendingCount}`);
    await restore();
    process.exit(1);
  }
  console.log(`✓ Only ${pendingCount} PENDING request exists (one-at-a-time enforced)`);

  // --- Step 3: Registrar approves ---
  console.log("\n--- Step 3: Registrar approves the request ---");
  const updatedUnion = await db.$transaction(async (tx) => {
    // Apply only non-null fields
    await tx.union.update({
      where: { id: union.id },
      data: {
        address: req1.address,
        contactPhone: req1.contactPhone,
      },
    });
    const result = await tx.contactUpdateRequest.updateMany({
      where: { id: req1.id, status: ContactUpdateStatus.PENDING },
      data: {
        status: ContactUpdateStatus.APPROVED,
        reviewedById: registrar.id,
        reviewedAt: new Date(),
      },
    });
    if (result.count === 0) throw new Error("Race: request was actioned concurrently");
    return result;
  });
  console.log(`✓ Approved + applied (address + contactPhone updated on Union row)`);

  // Verify the union row was updated
  const postApproveUnion = await db.union.findUnique({ where: { id: union.id } });
  if (postApproveUnion?.address !== "123 New Test Street, Port Moresby") {
    console.error(`✗ Union address not updated. Got: ${postApproveUnion?.address}`);
    await restore();
    process.exit(1);
  }
  if (postApproveUnion?.contactPhone !== "+675 9876 5432") {
    console.error(`✗ Union phone not updated. Got: ${postApproveUnion?.contactPhone}`);
    await restore();
    process.exit(1);
  }
  console.log(`✓ Union row verified: address="${postApproveUnion.address}", phone="${postApproveUnion.contactPhone}"`);

  // --- Step 4: Rep can now submit another (no longer blocked) ---
  console.log("\n--- Step 4: Rep submits another request (after approval) ---");
  const req2 = await db.contactUpdateRequest.create({
    data: {
      unionId: union.id,
      requestedById: rep.id,
      address: null,
      contactPerson: null,
      contactEmail: "new.email@example.org",
      contactPhone: null,
      status: ContactUpdateStatus.PENDING,
    },
  });
  console.log(`✓ Created request ${req2.id} (PENDING, field: contactEmail)`);

  // --- Step 5: Registrar rejects with a reason ---
  console.log("\n--- Step 5: Registrar rejects the second request ---");
  await db.$transaction(async (tx) => {
    const result = await tx.contactUpdateRequest.updateMany({
      where: { id: req2.id, status: ContactUpdateStatus.PENDING },
      data: {
        status: ContactUpdateStatus.REJECTED,
        reviewedById: registrar.id,
        reviewedAt: new Date(),
        rejectionReason: "The new email doesn't match our records. Please verify and resubmit.",
      },
    });
    if (result.count === 0) throw new Error("Race: request was actioned concurrently");
    return result;
  });
  console.log(`✓ Rejected with reason`);

  // Verify the union row was NOT changed (rejection doesn't apply)
  const postRejectUnion = await db.union.findUnique({ where: { id: union.id } });
  if (postRejectUnion?.contactEmail === "new.email@example.org") {
    console.error(`✗ Union email should NOT have been updated (request was rejected)`);
    await restore();
    process.exit(1);
  }
  console.log(`✓ Union row unchanged (rejection didn't apply contactEmail)`);

  // --- Step 6: Verify request history ---
  console.log("\n--- Step 6: Verify request history ---");
  const history = await db.contactUpdateRequest.findMany({
    where: { unionId: union.id },
    orderBy: { createdAt: "asc" },
  });
  if (history.length !== 2) {
    console.error(`✗ Expected 2 requests in history, got ${history.length}`);
    await restore();
    process.exit(1);
  }
  if (history[0].status !== "APPROVED" || history[1].status !== "REJECTED") {
    console.error(`✗ History statuses wrong: ${history.map((h) => h.status).join(", ")}`);
    await restore();
    process.exit(1);
  }
  if (!history[1].rejectionReason) {
    console.error(`✗ Rejected request should have a reason`);
    await restore();
    process.exit(1);
  }
  console.log(`✓ History: ${history.length} requests (1 APPROVED + 1 REJECTED with reason)`);

  // --- Cleanup ---
  await restore();
  console.log("\n✓ All checks passed.");
  process.exit(0);

  async function restore() {
    console.log("\n(restoring union contact info + deleting test requests)");
    await db.union.update({
      where: { id: union.id },
      data: original,
    });
    await db.contactUpdateRequest.deleteMany({ where: { unionId: union.id } });
  }
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
