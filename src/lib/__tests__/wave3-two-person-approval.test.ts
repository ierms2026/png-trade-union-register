import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================================
// Wave 3 / Item 1: Two-person approval workflow for document review.
//
// Audit finding: a single Registrar could finalize document approval with
// one click. For irreversible actions on legal documents (Constitution,
// Financial Return, etc.), this is too much power for one person — a
// second Registrar should confirm.
//
// Fix:
//   1. Schema: added `firstApprovedById` + `firstApprovedAt` to Document.
//      The document STAYS in reviewStatus = PENDING after first approval;
//      the state "firstApprovedAt != null + reviewStatus = PENDING" IS the
//      "awaiting second approval" state. (We deliberately didn't extend
//      the ReviewStatus enum to avoid touching every status check.)
//   2. /api/reviews/[documentId]/approve now has TWO branches:
//      - First approval: sets firstApprovedAt + firstApprovedById. Document
//        stays PENDING. Notifies all OTHER Registrars.
//      - Second approval: only a DIFFERENT Registrar can finalize. Sets
//        reviewStatus = APPROVED + reviewedAt + reviewedById.
//   3. /api/reviews/[documentId]/withdraw (NEW) — first approver can take
//      back their first approval.
//   4. /api/reviews/[documentId]/reject — clears firstApprovedAt +
//      firstApprovedById (cancels the pending two-person workflow).
//   5. /api/reviews GET — returns two buckets: `pending` + `awaitingSecondApproval`.
//   6. ReviewsView — renders two sections with yellow badges + Withdraw button.
//   7. DocumentDetailView — yellow "Awaiting 2nd approval" badge in the header.
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");
const SCHEMA_PATH = resolve(SRC_ROOT, "prisma/schema.prisma");
const APPROVE_API = resolve(SRC_ROOT, "src/app/api/reviews/[documentId]/approve/route.ts");
const REJECT_API = resolve(SRC_ROOT, "src/app/api/reviews/[documentId]/reject/route.ts");
const WITHDRAW_API = resolve(SRC_ROOT, "src/app/api/reviews/[documentId]/withdraw/route.ts");
const REVIEWS_API = resolve(SRC_ROOT, "src/app/api/reviews/route.ts");
const REVIEWS_VIEW = resolve(SRC_ROOT, "src/components/app/views/reviews.tsx");
const DOC_DETAIL_VIEW = resolve(SRC_ROOT, "src/components/app/views/document-detail.tsx");
const PAGE_VIEW = resolve(SRC_ROOT, "src/app/page.tsx");

describe("Wave 3 / Item 1: schema — Document has two-person approval fields", () => {
  const schema = readFileSync(SCHEMA_PATH, "utf-8");

  it("Document model has firstApprovedById field", () => {
    expect(schema).toMatch(/firstApprovedById\s+String\?/);
  });

  it("Document model has firstApprovedAt field", () => {
    expect(schema).toMatch(/firstApprovedAt\s+DateTime\?/);
  });

  it("Document model has firstApprovedBy relation to User (named relation)", () => {
    // Prisma requires named relations when there are multiple FKs to the
    // same model. Document already has reviewedBy → User, so the new
    // firstApprovedBy must use a named relation to disambiguate.
    expect(schema).toMatch(/firstApprovedBy\s+User\?\s+@relation\("DocumentFirstApprover"/);
  });

  it("User model has the back-relation firstApprovedDocuments", () => {
    expect(schema).toMatch(/firstApprovedDocuments\s+Document\[\]\s+@relation\("DocumentFirstApprover"\)/);
  });

  it("Document model does NOT add a new ReviewStatus enum value (PENDING_SECOND_APPROVAL)", () => {
    // We deliberately didn't extend the enum — the "awaiting second approval"
    // state is represented as `firstApprovedAt != null && reviewStatus === "PENDING"`.
    // This avoids touching every status check across the codebase.
    const reviewStatusBlock = schema.match(/enum ReviewStatus \{[\s\S]*?\}/);
    expect(reviewStatusBlock, "ReviewStatus enum must exist").not.toBeNull();
    expect(reviewStatusBlock![0]).not.toContain("PENDING_SECOND_APPROVAL");
    expect(reviewStatusBlock![0]).toContain("PENDING");
    expect(reviewStatusBlock![0]).toContain("APPROVED");
    expect(reviewStatusBlock![0]).toContain("REJECTED");
  });
});

describe("Wave 3 / Item 1: approve API — two-person workflow state machine", () => {
  const src = readFileSync(APPROVE_API, "utf-8");

  it("rejects OFFICER role with 403 (REGISTRAR only)", () => {
    expect(src).toMatch(/user\.role\s*!==\s*Role\.REGISTRAR/);
    expect(src).toMatch(/Only Registrars can approve/);
  });

  it("Branch 1: FIRST APPROVAL — sets firstApprovedAt + firstApprovedById, keeps PENDING", () => {
    expect(src).toMatch(/firstApprovedAt:\s*null/);
    expect(src).toMatch(/firstApprovedById:\s*user\.id/);
    expect(src).toMatch(/firstApprovedAt:\s*now/);
  });

  it("Branch 1: uses updateMany with where.firstApprovedAt = null (race-safe)", () => {
    // Only updates if firstApprovedAt is still null. If two Registrars POST
    // concurrently, only one wins; the other gets count=0 + 409.
    expect(src).toMatch(/where:\s*\{[\s\S]*?id:\s*documentId[\s\S]*?reviewStatus:\s*"PENDING"[\s\S]*?firstApprovedAt:\s*null/);
  });

  it("Branch 1: audit action is document_review_first_approve", () => {
    expect(src).toMatch(/action:\s*"document_review_first_approve"/);
  });

  it("Branch 1: notifies all OTHER Registrars (excluding the caller)", () => {
    expect(src).toMatch(/createNotificationForUsers/);
    expect(src).toMatch(/role:\s*Role\.REGISTRAR/);
    expect(src).toMatch(/disabled:\s*false/);
    expect(src).toMatch(/id:\s*\{\s*not:\s*user\.id\s*\}/);
  });

  it("Branch 1: returns stage: 'first_approval' in the response", () => {
    expect(src).toMatch(/stage:\s*"first_approval"/);
  });

  it("Branch 2: SECOND APPROVAL — different Registrar finalizes", () => {
    expect(src).toMatch(/stage:\s*"second_approval"/);
    expect(src).toMatch(/reviewStatus:\s*ReviewStatus\.APPROVED/);
    expect(src).toMatch(/reviewedById:\s*user\.id/);
  });

  it("Branch 2: uses updateMany with firstApprovedById: { not: user.id } (race-safe)", () => {
    // Ensures the second approver is DIFFERENT from the first — atomic check.
    expect(src).toMatch(/firstApprovedById:\s*\{\s*not:\s*user\.id\s*\}/);
  });

  it("Branch 3: REJECT — same person cannot second their own approval (400)", () => {
    expect(src).toMatch(/firstApprovedById\s*===\s*user\.id/);
    expect(src).toMatch(/different Registrar must give the second approval/);
    expect(src).toMatch(/status:\s*400/);
  });

  it("preserves the existing notification to the uploading Officer on second approval", () => {
    expect(src).toMatch(/review:approved:/);
  });
});

describe("Wave 3 / Item 1: withdraw API — first approver can take back first approval", () => {
  it("endpoint file exists at src/app/api/reviews/[documentId]/withdraw/route.ts", () => {
    expect(existsSync(WITHDRAW_API)).toBe(true);
  });

  const src = readFileSync(WITHDRAW_API, "utf-8");

  it("rejects non-REGISTRAR with 403", () => {
    expect(src).toMatch(/Only Registrars can withdraw approvals/);
    expect(src).toMatch(/status:\s*403/);
  });

  it("rejects users who are NOT the first approver (403)", () => {
    expect(src).toMatch(/firstApprovedById\s*!==\s*user\.id/);
    expect(src).toMatch(/Only the Registrar who gave first approval can withdraw it/);
  });

  it("rejects withdrawal after the document is finalized (409)", () => {
    // Can only withdraw while reviewStatus === "PENDING" (before second approval).
    expect(src).toMatch(/reviewStatus\s*!==\s*"PENDING"/);
    expect(src).toMatch(/already been finalized/);
    expect(src).toMatch(/status:\s*409/);
  });

  it("uses race-safe updateMany with firstApprovedById = user.id", () => {
    expect(src).toMatch(/where:\s*\{[\s\S]*?id:\s*documentId[\s\S]*?reviewStatus:\s*"PENDING"[\s\S]*?firstApprovedById:\s*user\.id/);
  });

  it("clears firstApprovedById + firstApprovedAt on withdraw", () => {
    expect(src).toMatch(/firstApprovedById:\s*null/);
    expect(src).toMatch(/firstApprovedAt:\s*null/);
  });

  it("audit action is document_review_withdraw_first_approval", () => {
    expect(src).toMatch(/action:\s*"document_review_withdraw_first_approval"/);
  });

  it("does NOT notify anyone on withdraw (silent revert)", () => {
    // Withdraw is a benign action — no notification needed. The stale
    // "second approval needed" notification other Registrars received is
    // not retracted (we don't try to retract it).
    expect(src).not.toMatch(/createNotification/);
  });
});

describe("Wave 3 / Item 1: reject API — clears two-person approval state", () => {
  const src = readFileSync(REJECT_API, "utf-8");

  it("reject API clears firstApprovedById + firstApprovedAt (cancels pending workflow)", () => {
    expect(src).toMatch(/firstApprovedById:\s*null/);
    expect(src).toMatch(/firstApprovedAt:\s*null/);
  });

  it("reject API captures first-approval state in the audit beforeJson", () => {
    expect(src).toMatch(/firstApprovedAt:\s*existing\.firstApprovedAt/);
    expect(src).toMatch(/firstApprovedById:\s*existing\.firstApprovedById/);
  });
});

describe("Wave 3 / Item 1: /api/reviews GET — returns two buckets", () => {
  const src = readFileSync(REVIEWS_API, "utf-8");

  it("returns both `pending` and `awaitingSecondApproval` arrays", () => {
    expect(src).toMatch(/awaitingSecondApproval/);
    expect(src).toMatch(/return NextResponse\.json\(\{\s*pending,\s*awaitingSecondApproval\s*\}\)/);
  });

  it("each item includes firstApprovedById + firstApprovedAt + firstApproverEmail", () => {
    expect(src).toMatch(/firstApprovedById/);
    expect(src).toMatch(/firstApprovedAt/);
    expect(src).toMatch(/firstApproverEmail/);
  });

  it("splits items by firstApprovedAt != null", () => {
    // Items with first approval go to awaitingSecondApproval; others to pending.
    expect(src).toMatch(/if\s*\(doc\.firstApprovedAt\s*!==\s*null\)/);
    expect(src).toMatch(/awaitingSecondApproval\.push\(item\)/);
    expect(src).toMatch(/pending\.push\(item\)/);
  });

  it("uses a batched user lookup (no N+1 for first-approver emails)", () => {
    expect(src).toMatch(/firstApproverIds/);
    expect(src).toMatch(/db\.user\.findMany/);
    expect(src).toMatch(/id:\s*\{\s*in:\s*allUserIds\s*\}/);
  });
});

describe("Wave 3 / Item 1: ReviewsView — two-bucket UI + Withdraw + yellow badge", () => {
  const src = readFileSync(REVIEWS_VIEW, "utf-8");

  it("view accepts a user prop with id + role (for the Withdraw guard)", () => {
    expect(src).toMatch(/user\?:\s*\{\s*id:\s*string;\s*role:\s*string\s*\}/);
  });

  it("view fetches the two-bucket response (ReviewsResponse interface)", () => {
    expect(src).toMatch(/interface\s+ReviewsResponse\s*\{/);
    expect(src).toMatch(/useFetch<ReviewsResponse>/);
  });

  it("view renders an 'Awaiting Second Approval' section with a count badge", () => {
    expect(src).toMatch(/Awaiting Second Approval/);
  });

  it("view renders a 'Pending First Review' section with a count badge", () => {
    expect(src).toMatch(/Pending First Review/);
  });

  it("view shows the 'Awaiting second approval' state ABOVE 'Pending First Review'", () => {
    // The awaiting bucket needs attention from a different Registrar — show
    // it first so it's not buried below the pending queue.
    // We use the <h2> rendering (not the comment block) to verify the order.
    const awaitingHeadingIdx = src.indexOf(">Awaiting Second Approval<");
    const pendingHeadingIdx = src.indexOf(">Pending First Review<");
    expect(awaitingHeadingIdx, "Awaiting Second Approval h2 must exist").toBeGreaterThan(-1);
    expect(pendingHeadingIdx, "Pending First Review h2 must exist").toBeGreaterThan(-1);
    expect(awaitingHeadingIdx).toBeLessThan(pendingHeadingIdx);
  });

  it("view shows a Withdraw button (only to the first approver)", () => {
    expect(src).toMatch(/Withdraw/);
    expect(src).toMatch(/isCurrentUserFirstApprover/);
  });

  it("view shows 'Confirm Approval' (not 'Approve') for the second approver", () => {
    // Different label makes it clear this is the FINALIZING click, not the
    // first approval. Reduces the chance of a misclick.
    expect(src).toMatch(/Confirm Approval/);
  });

  it("view shows the yellow 'Awaiting 2nd approval' badge with ShieldCheck icon", () => {
    expect(src).toMatch(/Awaiting 2nd approval/);
    expect(src).toMatch(/ShieldCheck/);
    expect(src).toMatch(/bg-amber-100 text-amber-800/);
  });

  it("view differentiates the toast message for first vs second approval", () => {
    expect(src).toMatch(/result\.stage\s*===\s*"first_approval"/);
    expect(src).toMatch(/First approval recorded/);
  });

  it("view shows 'First approved by X' line on awaiting-second-approval cards", () => {
    expect(src).toMatch(/First approved by/);
    expect(src).toMatch(/firstApproverEmail/);
  });

  it("view calls the withdraw API endpoint", () => {
    expect(src).toMatch(/\/api\/reviews\/\$\{documentId\}\/withdraw/);
  });

  it("page.tsx passes user prop to ReviewsView", () => {
    const pageSrc = readFileSync(PAGE_VIEW, "utf-8");
    expect(pageSrc).toMatch(/<ReviewsView[^>]*user=\{currentUser\}/);
  });
});

describe("Wave 3 / Item 1: document-detail view — yellow badge in header", () => {
  const src = readFileSync(DOC_DETAIL_VIEW, "utf-8");

  it("DocumentDetail interface includes firstApprovedAt field", () => {
    expect(src).toMatch(/firstApprovedAt:\s*string\s*\|\s*null/);
  });

  it("document header shows yellow 'Awaiting 2nd approval' badge when firstApprovedAt + PENDING", () => {
    expect(src).toMatch(/doc\.firstApprovedAt\s*&&\s*doc\.reviewStatus\s*===\s*"PENDING"/);
    expect(src).toMatch(/Awaiting 2nd approval/);
  });

  it("formatAuditAction includes the new two-person workflow actions", () => {
    expect(src).toMatch(/document_review_first_approve:\s*"First approval given"/);
    expect(src).toMatch(/document_review_withdraw_first_approval:\s*"First approval withdrawn"/);
  });
});
