import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";

// =============================================================================
// PUT /api/compliance/rules/[id]
// -----------------------------------------------------------------------------
// Update a single ComplianceRule. REGISTRAR-only — Inspectors are read-only,
// Officers can't touch global rules.
//
// AUDIT:
// Writes an AuditLog entry with beforeJson + afterJson snapshots of the rule.
// Action: "compliance_rule_edit". Severity: INFO (rule edits are reversible —
// the impact preview lets the Registrar see consequences before saving, and
// the rule can be edited back).
//
// The before/after captures the actual DB state, so the audit trail shows
// exactly what changed. This is critical for regulatory defensibility: if a
// union challenges a compliance status in court, the department must be able
// to produce the rule history showing when each field was changed and by whom.
//
// VALIDATION:
// Accepts only `required`, `renewalYears`, `retentionYrs` fields. Unknown
// fields are silently ignored (forward-compatible). Values are type-checked:
//   - required: boolean
//   - renewalYears: integer ≥ 0 (0 = misconfigured; the calculator returns
//     OVERDUE for any doc filed under a 0-year rule — flagged visually)
//   - retentionYrs: integer ≥ 0
//
// NOT EXPOSED:
//   - documentType: immutable. Renaming a document type would orphan every
//     existing Document row pointing at the old name. If a rename is ever
//     needed, it's a migration (rename the type in the seed + every
//     Document.documentType + the DB row), not a PUT.
//   - id, createdAt, updatedAt: managed by Prisma.
// =============================================================================

export interface UpdateRuleBody {
  required?: boolean;
  renewalYears?: number;
  retentionYrs?: number;
}

/** Validate the request body. Returns an error message or null if valid. */
function validateBody(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return "Request body must be a JSON object.";
  }
  const b = body as Record<string, unknown>;

  // Check for at least one updatable field
  const hasUpdatable =
    "required" in b || "renewalYears" in b || "retentionYrs" in b;
  if (!hasUpdatable) {
    return "Request body must include at least one of: required, renewalYears, retentionYrs.";
  }

  // Type-check each present field
  if ("required" in b && typeof b.required !== "boolean") {
    return "Field 'required' must be a boolean.";
  }
  if ("renewalYears" in b) {
    if (typeof b.renewalYears !== "number" || !Number.isInteger(b.renewalYears)) {
      return "Field 'renewalYears' must be an integer.";
    }
    if (b.renewalYears < 0) {
      return "Field 'renewalYears' must be ≥ 0.";
    }
  }
  if ("retentionYrs" in b) {
    if (typeof b.retentionYrs !== "number" || !Number.isInteger(b.retentionYrs)) {
      return "Field 'retentionYrs' must be an integer.";
    }
    if (b.retentionYrs < 0) {
      return "Field 'retentionYrs' must be ≥ 0.";
    }
  }
  return null;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // --- 1. Auth check: REGISTRAR-only ---------------------------------------
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (user.role !== Role.REGISTRAR) {
    // 403, not 404 — the rule's existence isn't secret (this is an
    // authenticated internal endpoint), and a 403 correctly signals
    // "you can see this rule exists, but you can't edit it."
    return NextResponse.json(
      {
        error:
          "Only Registrars can edit compliance rules. Inspectors have read-only access; Officers cannot modify global rules.",
      },
      { status: 403 },
    );
  }

  // --- 2. Parse + validate the body ----------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const validationError = validateBody(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Build the update payload — only the validated fields
  const updateData: UpdateRuleBody = {};
  const b = body as Record<string, unknown>;
  if ("required" in b) updateData.required = b.required as boolean;
  if ("renewalYears" in b) updateData.renewalYears = b.renewalYears as number;
  if ("retentionYrs" in b) updateData.retentionYrs = b.retentionYrs as number;

  // --- 3. Verify the rule exists (404 if not) --------------------------------
  const existingRule = await db.complianceRule.findUnique({ where: { id } });
  if (!existingRule) {
    return NextResponse.json(
      { error: "Compliance rule not found." },
      { status: 404 },
    );
  }

  // --- 4. Apply the update --------------------------------------------------
  // We snapshot `existingRule` BEFORE the update as the "before" state —
  // important to capture it now, not after, so the audit log shows the
  // actual pre-change state (in case another concurrent request modified
  // the row between our fetch and our update — Prisma's update will
  // either succeed or throw P2025 (record not found), no silent overwrite).
  const updatedRule = await db.complianceRule.update({
    where: { id },
    data: updateData,
  });

  // --- 5. Write the AuditLog entry ------------------------------------------
  // beforeJson + afterJson capture the actual DB state. actorName is
  // snapshot at action time (denormalized — never a JOIN) so the audit
  // trail is immutable even if the user is later renamed or deleted.
  await db.auditLog.create({
    data: {
      actorId: user.id, // null in mock; real User.id once auth-guard ships
      actorName: user.name,
      action: "compliance_rule_edit",
      entityType: "ComplianceRule",
      entityId: id,
      beforeJson: JSON.stringify(existingRule),
      afterJson: JSON.stringify(updatedRule),
      severity: Severity.INFO,
    },
  });

  // --- 6. Return the updated rule ------------------------------------------
  return NextResponse.json(updatedRule);
}
