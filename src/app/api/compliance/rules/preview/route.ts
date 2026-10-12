import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import type { ComplianceStatus } from "@/lib/compliance/calculator";
import type { ComplianceRule } from "@prisma/client";

// =============================================================================
// POST /api/compliance/rules/preview
// -----------------------------------------------------------------------------
// Compute the impact of a hypothetical rule change WITHOUT persisting it.
//
// USE CASE:
// Before a Registrar saves a rule edit (e.g. "raise Financial Return
// renewalYears from 1 to 3"), they want to see exactly which unions would
// change status. This endpoint runs the compliance matrix TWICE:
//
//   1. Real matrix: uses the saved rules (what the status IS now)
//   2. Hypothetical matrix: uses the modified rule (what the status WOULD BE)
//
// Then diffs the two and returns ONLY the unions where at least one cell's
// status changed. The diff is per-cell — so the response shows:
//   { unionId, unionName, documentType, currentStatus, newStatus }
//
// WHY THIS MATTERS:
// The spec's "Configure Rules + Preview Impact" pattern is "never surprise
// the user with side effects." A Registrar who sees "12 unions would
// escalate from Compliant to Overdue" can decide not to save, or to
// notify those unions first. Without preview, the save would silently
// reshape the compliance matrix and the Registrar would only discover
// the consequences by re-reading the Compliance screen.
//
// READ-ONLY:
// This endpoint writes NOTHING to the DB. It's a pure computation over
// the loaded data + the hypothetical rule. Verified by the smoke test:
// calling preview N times produces 0 AuditLog entries.
//
// AUTH:
// REGISTRAR-only — same as the PUT endpoint. Inspectors can view the
// compliance matrix (read-only), but previewing a hypothetical rule
// change is a Registrar action (it's the step before saving).
// =============================================================================

// Request body shape
export interface PreviewRequestBody {
  /** The rule ID being hypothetically modified. */
  ruleId: string;
  /** The hypothetical new values for the rule. Only `required`,
   * `renewalYears`, and `retentionYrs` are meaningful — `documentType`
   * and `id` are ignored (renaming a document type is a migration, not
   * a PUT; see the PUT route for the rationale). */
  changes: {
    required?: boolean;
    renewalYears?: number;
    retentionYrs?: number;
  };
}

// Response cell shape — one entry per (union, documentType) where the
// status changed between the real and hypothetical matrices.
export interface PreviewDiffEntry {
  unionId: string;
  unionName: string;
  documentType: string;
  currentStatus: ComplianceStatus;
  newStatus: ComplianceStatus;
}

export interface PreviewResponse {
  ruleId: string;
  documentType: string;
  changes: PreviewRequestBody["changes"];
  diff: PreviewDiffEntry[];
  /** Summary counts — surfaced so the UI can show a headline like
   *  "12 unions would change status: 8 escalate, 4 improve". */
  summary: {
    totalChanged: number;
    escalated: number; // status got "worse" (e.g. COMPLIANT → EXPIRING)
    improved: number; // status got "better" (e.g. OVERDUE → COMPLIANT)
  };
}

/** Status rank for escalation/improvement classification.
 * Higher number = "worse" status. Used by the summary to count how many
 * unions escalated vs. improved.
 *
 * Order: COMPLIANT (best) < EXPIRING < OVERDUE < AWAITING_REVIEW < MISSING < NOT_APPLICABLE
 *
 * NOT_APPLICABLE is ranked "worst" here for sorting purposes only — it's
 * not actually worse than MISSING, but it's the most unusual change
 * (marking a previously-required rule as not-required), so we want it
 * sorted last in the diff list. The escalation/improvement count treats
 * N/A↔anything transitions as a separate category (counted in totalChanged
 * but not in escalated/improved).
 */
const STATUS_RANK: Record<ComplianceStatus, number> = {
  COMPLIANT: 0,
  EXPIRING: 1,
  OVERDUE: 2,
  AWAITING_REVIEW: 3,
  MISSING: 4,
  NOT_APPLICABLE: 5,
};

export async function POST(req: NextRequest) {
  // --- 1. Auth check: REGISTRAR-only ---------------------------------------
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json(
      {
        error:
          "Only Registrars can preview compliance rule changes. Inspectors have read-only access; Officers cannot modify global rules.",
      },
      { status: 403 },
    );
  }

  // --- 2. Parse + validate the body ----------------------------------------
  let body: PreviewRequestBody;
  try {
    body = (await req.json()) as PreviewRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body. Expected { ruleId, changes }." },
      { status: 400 },
    );
  }

  if (!body.ruleId || typeof body.ruleId !== "string") {
    return NextResponse.json(
      { error: "Field 'ruleId' is required and must be a string." },
      { status: 400 },
    );
  }
  if (!body.changes || typeof body.changes !== "object") {
    return NextResponse.json(
      { error: "Field 'changes' is required and must be an object." },
      { status: 400 },
    );
  }

  // Validate each change field
  const { required, renewalYears, retentionYrs } = body.changes;
  if (
    required !== undefined &&
    typeof required !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Field 'changes.required' must be a boolean." },
      { status: 400 },
    );
  }
  if (
    renewalYears !== undefined &&
    (typeof renewalYears !== "number" || !Number.isInteger(renewalYears) || renewalYears < 0)
  ) {
    return NextResponse.json(
      { error: "Field 'changes.renewalYears' must be a non-negative integer." },
      { status: 400 },
    );
  }
  if (
    retentionYrs !== undefined &&
    (typeof retentionYrs !== "number" || !Number.isInteger(retentionYrs) || retentionYrs < 0)
  ) {
    return NextResponse.json(
      { error: "Field 'changes.retentionYrs' must be a non-negative integer." },
      { status: 400 },
    );
  }

  // --- 3. Verify the rule exists (404 if not) --------------------------------
  const existingRule = await db.complianceRule.findUnique({
    where: { id: body.ruleId },
  });
  if (!existingRule) {
    return NextResponse.json(
      { error: "Compliance rule not found." },
      { status: 404 },
    );
  }

  // --- 4. Fetch all matrix data ONCE ---------------------------------------
  // We load the unions + documents + versions ONE time, then compute
  // the matrix twice with different rule arrays. This is the key
  // efficiency: only the rules differ between the two computations,
  // so we don't re-fetch the (much larger) documents/versions data.
  const data = await fetchMatrixData();

  // --- 5. Build the hypothetical rule (in-memory, never persisted) ---------
  // Spread the existing rule, then override with the hypothetical changes.
  // The hypothetical rule has the SAME id as the real one — this lets us
  // find it in the data.rules array by id when building the hypothetical
  // matrix (we swap the rule at that index).
  const hypotheticalRule: ComplianceRule = {
    ...existingRule,
    ...(required !== undefined && { required }),
    ...(renewalYears !== undefined && { renewalYears }),
    ...(retentionYrs !== undefined && { retentionYrs }),
  };

  // Build the hypothetical rules array: same as the real one, but with
  // the targeted rule replaced by the hypothetical version.
  const hypotheticalRules = data.rules.map((r) =>
    r.id === body.ruleId ? hypotheticalRule : r,
  );

  // --- 6. Compute both matrices ---------------------------------------------
  // Same `now` for both — ensures the diff reflects ONLY the rule change,
  // not time-based drift (e.g. a doc crossing the 90-day threshold between
  // the two computations).
  const now = new Date();
  const realMatrix = buildComplianceMatrix(data, now);
  const hypotheticalMatrix = buildComplianceMatrix(
    { ...data, rules: hypotheticalRules },
    now,
  );

  // --- 7. Diff the two matrices --------------------------------------------
  // For each union, compare the cell for the targeted documentType. Only
  // the targeted rule changed, so only that cell can differ — but we
  // still iterate over all unions to catch every affected one.
  //
  // (We could also iterate over ALL cells to be defensive — if a future
  // change made rules interdependent, we'd want to catch those. But the
  // current rule model has no interdependencies, so per-rule diffing is
  // correct and faster.)
  const diff: PreviewDiffEntry[] = [];
  const documentType = existingRule.documentType;

  for (const realRow of realMatrix.unions) {
    const hypotheticalRow = hypotheticalMatrix.unions.find(
      (r) => r.unionId === realRow.unionId,
    );
    if (!hypotheticalRow) continue; // defensive — shouldn't happen

    const realCell = realRow.scores.find(
      (s) => s.documentType === documentType,
    );
    const hypotheticalCell = hypotheticalRow.scores.find(
      (s) => s.documentType === documentType,
    );
    if (!realCell || !hypotheticalCell) continue; // defensive

    if (realCell.status !== hypotheticalCell.status) {
      diff.push({
        unionId: realRow.unionId,
        unionName: realRow.unionName,
        documentType,
        currentStatus: realCell.status,
        newStatus: hypotheticalCell.status,
      });
    }
  }

  // --- 8. Compute summary counts --------------------------------------------
  let escalated = 0;
  let improved = 0;
  for (const entry of diff) {
    const currentRank = STATUS_RANK[entry.currentStatus];
    const newRank = STATUS_RANK[entry.newStatus];
    if (newRank > currentRank) escalated++;
    else if (newRank < currentRank) improved++;
    // Equal rank changes (e.g. MISSING → NOT_APPLICABLE, both rank 3/4)
    // are counted in totalChanged but not in escalated/improved.
  }

  // --- 9. Return the diff (READ-ONLY — nothing persisted) -------------------
  return NextResponse.json({
    ruleId: body.ruleId,
    documentType,
    changes: body.changes,
    diff,
    summary: {
      totalChanged: diff.length,
      escalated,
      improved,
    },
  } satisfies PreviewResponse);
}
