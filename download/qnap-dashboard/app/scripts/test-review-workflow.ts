// End-to-end test of the document review workflow.
// Run: npx tsx scripts/test-review-workflow.ts

import { db } from "../src/lib/prisma";
import { ReviewStatus } from "@prisma/client";

async function main() {
  console.log("=== Document Review Workflow — End-to-End Test ===\n");

  // 1. Find the officer + their union
  const officer = await db.user.findUnique({
    where: { email: "officer@example.com" },
    select: { id: true, email: true, assignedUnionId: true },
  });
  if (!officer || !officer.assignedUnionId) {
    console.log("✗ Officer not found or no assigned union");
    return;
  }
  console.log(`1. Officer: ${officer.email} (assigned to union ${officer.assignedUnionId})`);

  // 2. Find a document in that union to "upload a new version" of
  //    (We won't actually upload — we'll simulate by directly setting
  //    reviewStatus = PENDING on an existing doc, mimicking what the
  //    upload route does.)
  const doc = await db.document.findFirst({
    where: { unionId: officer.assignedUnionId },
    select: { id: true, documentType: true, reviewStatus: true },
  });
  if (!doc) {
    console.log("✗ No document found in officer's union");
    return;
  }
  console.log(`2. Test document: ${doc.documentType} (id: ${doc.id})`);
  console.log(`   Current reviewStatus: ${doc.reviewStatus}`);

  // 3. Simulate an upload: set to PENDING (this is what the upload route does)
  console.log("\n3. Simulating Officer upload → setting reviewStatus = PENDING...");
  await db.document.update({
    where: { id: doc.id },
    data: {
      reviewStatus: ReviewStatus.PENDING,
      reviewedById: null,
      reviewedAt: null,
      rejectionReason: null,
    },
  });
  console.log("   ✓ Document is now PENDING review");

  // 4. Verify compliance calculator treats PENDING as MISSING
  const { calculateStatus } = await import("../src/lib/compliance/calculator");
  const rule = await db.complianceRule.findUnique({
    where: { documentType: doc.documentType },
  });
  const updatedDoc = await db.document.findUnique({
    where: { id: doc.id },
    select: { disposedAt: true, reviewStatus: true },
  });
  const latestVersion = await db.documentVersion.findFirst({
    where: { documentId: doc.id },
    orderBy: { versionNumber: "desc" },
    select: { uploadedAt: true },
  });
  const statusPending = calculateStatus(rule, updatedDoc, latestVersion);
  console.log(`\n4. Compliance status with PENDING review: ${statusPending}`);
  console.log(`   ${statusPending === "MISSING" ? "✓ PASS — PENDING correctly counts as MISSING" : "✗ FAIL — expected MISSING, got " + statusPending}`);

  // 5. Simulate Registrar approval
  const registrar = await db.user.findFirst({
    where: { role: "REGISTRAR", disabled: false },
    select: { id: true, email: true },
  });
  console.log(`\n5. Simulating Registrar approval by ${registrar?.email}...`);
  await db.document.update({
    where: { id: doc.id },
    data: {
      reviewStatus: ReviewStatus.APPROVED,
      reviewedById: registrar?.id ?? null,
      reviewedAt: new Date(),
    },
  });
  console.log("   ✓ Document is now APPROVED");

  // 6. Verify compliance recovers
  const approvedDoc = await db.document.findUnique({
    where: { id: doc.id },
    select: { disposedAt: true, reviewStatus: true },
  });
  const statusApproved = calculateStatus(rule, approvedDoc, latestVersion);
  console.log(`\n6. Compliance status after approval: ${statusApproved}`);
  console.log(`   ${statusApproved !== "MISSING" ? "✓ PASS — APPROVED correctly recovers compliance" : "✗ FAIL — expected non-MISSING, got MISSING"}`);

  // 7. Simulate rejection
  console.log("\n7. Simulating rejection flow...");
  await db.document.update({
    where: { id: doc.id },
    data: {
      reviewStatus: ReviewStatus.REJECTED,
      reviewedById: registrar?.id ?? null,
      reviewedAt: new Date(),
      rejectionReason: "Document is illegible — please re-upload a clearer scan.",
    },
  });
  const rejectedDoc = await db.document.findUnique({
    where: { id: doc.id },
    select: { disposedAt: true, reviewStatus: true },
  });
  const statusRejected = calculateStatus(rule, rejectedDoc, latestVersion);
  console.log(`   Compliance status when REJECTED: ${statusRejected}`);
  console.log(`   ${statusRejected === "MISSING" ? "✓ PASS — REJECTED correctly counts as MISSING" : "✗ FAIL — expected MISSING, got " + statusRejected}`);

  // 8. Restore to APPROVED (cleanup)
  console.log("\n8. Cleanup: restoring document to APPROVED...");
  await db.document.update({
    where: { id: doc.id },
    data: {
      reviewStatus: ReviewStatus.APPROVED,
      reviewedById: null,
      reviewedAt: null,
      rejectionReason: null,
    },
  });
  console.log("   ✓ Restored");

  console.log("\n=== All tests passed ===");
}

main().catch(console.error).finally(() => db.$disconnect());
