import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";

// =============================================================================
// GET /api/retention
// -----------------------------------------------------------------------------
// Lists documents pending disposal — documents whose retention period has
// elapsed AND that haven't been disposed yet AND aren't currently snoozed.
//
// A document is "pending disposal" when ALL of:
//   1. disposedAt IS NULL       (not yet disposed)
//   2. snoozedUntil IS NULL OR snoozedUntil < now  (not actively snoozed)
//   3. filedAt + retentionYrs <= today
//      (the retention period from the latest version's uploadedAt has elapsed)
//
// RESPONSE SHAPE:
//   {
//     pending: [
//       {
//         documentId, documentType, unionId, unionName, registrationNo,
//         filedAt, retentionYrs, disposalDueDate,
//         versionNumber, fileName
//       },
//       ...
//     ]
//   }
//
// AUTH:
//   REGISTRAR + INSPECTOR. Officers don't handle retention decisions.
// =============================================================================

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (user.role !== Role.REGISTRAR && user.role !== Role.INSPECTOR) {
    return NextResponse.json(
      { error: "Only Registrars and Inspectors can view the retention queue." },
      { status: 403 },
    );
  }

  const now = new Date();

  // Load all documents that aren't disposed and aren't actively snoozed.
  // We can't filter "filedAt + retentionYrs <= today" in Prisma directly
  // because retentionYrs lives on the ComplianceRule, not the Document —
  // so we load candidates and filter in JS.
  const candidates = await db.document.findMany({
    where: {
      disposedAt: null,
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }],
    },
    select: {
      id: true,
      documentType: true,
      unionId: true,
      snoozedUntil: true,
      currentVersionId: true,
      union: {
        select: { id: true, unionName: true, registrationNo: true },
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          versionNumber: true,
          fileName: true,
          uploadedAt: true,
        },
      },
    },
  });

  // Load all compliance rules so we can look up retentionYrs by documentType.
  const rules = await db.complianceRule.findMany({
    select: { documentType: true, retentionYrs: true },
  });
  const ruleByType = new Map(rules.map((r) => [r.documentType, r.retentionYrs]));

  // Filter: filedAt + retentionYrs <= today.
  // filedAt = the latest version's uploadedAt.
  const pending = [];
  for (const doc of candidates) {
    const latest = doc.versions[0];
    if (!latest) continue; // no versions — can't compute filedAt
    const retentionYrs = ruleByType.get(doc.documentType);
    if (retentionYrs === undefined) continue; // no rule for this docType

    // disposalDueDate = filedAt + retentionYrs (calendar-year math).
    const disposalDueDate = new Date(latest.uploadedAt);
    disposalDueDate.setFullYear(disposalDueDate.getFullYear() + retentionYrs);

    if (disposalDueDate.getTime() <= now.getTime()) {
      pending.push({
        documentId: doc.id,
        documentType: doc.documentType,
        unionId: doc.union.id,
        unionName: doc.union.unionName,
        registrationNo: doc.union.registrationNo,
        filedAt: latest.uploadedAt.toISOString(),
        retentionYrs,
        disposalDueDate: disposalDueDate.toISOString(),
        snoozedUntil: doc.snoozedUntil?.toISOString() ?? null,
        versionNumber: latest.versionNumber,
        fileName: latest.fileName,
      });
    }
  }

  // Sort by disposalDueDate ascending (most overdue first).
  pending.sort(
    (a, b) =>
      new Date(a.disposalDueDate).getTime() -
      new Date(b.disposalDueDate).getTime(),
  );

  return NextResponse.json({ pending });
}
