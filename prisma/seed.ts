import { PrismaClient } from "@prisma/client";

// Use the canonical singleton in app code; this seed runs standalone
// (no Next.js context), so we instantiate a private client here.
const db = new PrismaClient();

// =============================================================================
// ComplianceRule seed — canonical document types tracked by the
// Office of The Industrial Registrar.
//
// Each rule is UPSERTED (idempotent) — re-running this seed never fails
// or duplicates. Tune the values below and re-run to propagate changes.
//
// renewalYears / retentionYrs conventions:
//   99 = effectively permanent (one-time filing, never dispose, never renew)
//    1 = annual cycle
//    3 = term cycle (typically 3-year office-bearer terms in PNG)
//
// NOTE on "Legislation" (the 13th rule):
// This is distinct from the Legislation Library (Session 7), which is a
// static JSON config of acts/regulations the DEPARTMENT publishes.
// Here, "Legislation" tracks each union's reference to the specific
// industrial legislation it's registered under — e.g. a maritime union
// files its registration under the Maritime (Maritime Industry) Act.
// Permanent (99/99) because the applicable statute rarely changes and
// must be retained forever for historical legal context.
// =============================================================================

interface RuleSeed {
  documentType: string;
  required: boolean;
  renewalYears: number;
  retentionYrs: number;
  rationale: string; // why these values — for future tuning
}

// Document types use descriptive names for display (compliance matrix,
// charts, etc.). The IO-# naming convention applies ONLY to file names:
//   IO-[regNum]-[code] e.g. IO-1-02, or A[regNum] e.g. A1
//
// Code mapping (for file names only, not displayed in UI):
//   IO-00 = General Matters          IO-06 = Secret Ballots
//   IO-01 = Application for Registration  IO-07 = Financial Return
//   IO-02 = Registration Certificate     IO-08 = Affiliations
//   IO-03 = Constitution                 IO-09 = Inspection Reports
//   IO-04 = Financial Membership List    IO-10 = General Secretary Appointments
//   IO-05 = Election of Office Bearers   IO-11 = Welfare Fund
//   AW = Awards
const RULES: RuleSeed[] = [
  { documentType: "General Matters", required: true, renewalYears: 1, retentionYrs: 5, rationale: "Routine correspondence, annual check." },
  { documentType: "Application for Registration", required: true, renewalYears: 99, retentionYrs: 99, rationale: "One-time, permanent." },
  { documentType: "Registration Certificate", required: true, renewalYears: 99, retentionYrs: 99, rationale: "One-time issuance, permanent." },
  { documentType: "Rules & Constitution", required: true, renewalYears: 99, retentionYrs: 50, rationale: "One-time filing, 50-year retention." },
  { documentType: "Financial Membership", required: true, renewalYears: 1, retentionYrs: 7, rationale: "Annual, 7-year retention." },
  { documentType: "Election of Office Bearers", required: true, renewalYears: 3, retentionYrs: 7, rationale: "Term-based (3yr), 7yr retention." },
  { documentType: "Secret Ballots", required: true, renewalYears: 3, retentionYrs: 7, rationale: "Term-based, 7-year retention." },
  { documentType: "Financial Returns", required: true, renewalYears: 1, retentionYrs: 7, rationale: "Annual audited, 7-year retention." },
  { documentType: "Affiliations", required: true, renewalYears: 1, retentionYrs: 7, rationale: "Annual declaration, 7-year retention." },
  { documentType: "Inspection Reports", required: true, renewalYears: 1, retentionYrs: 7, rationale: "Annual, 7-year retention." },
  { documentType: "General Secretary's Appointments", required: true, renewalYears: 3, retentionYrs: 7, rationale: "Term-based, 7yr retention." },
  { documentType: "Welfare Funds", required: true, renewalYears: 1, retentionYrs: 7, rationale: "Annual statement, 7-year retention." },
];

async function main() {
  console.log(`\nSeeding ${RULES.length} ComplianceRules...\n`);

  for (const rule of RULES) {
    const result = await db.complianceRule.upsert({
      where: { documentType: rule.documentType },
      create: {
        documentType: rule.documentType,
        required: rule.required,
        renewalYears: rule.renewalYears,
        retentionYrs: rule.retentionYrs,
      },
      update: {
        // Re-running the seed updates tunable values; intentional so
        // changes here propagate without a manual DB edit.
        required: rule.required,
        renewalYears: rule.renewalYears,
        retentionYrs: rule.retentionYrs,
      },
    });
    console.log(
      `  ✓ ${result.documentType.padEnd(36)} ` +
        `renewal=${String(result.renewalYears).padStart(2)}y  ` +
        `retention=${String(result.retentionYrs).padStart(2)}y`,
    );
  }

  const count = await db.complianceRule.count();
  console.log(`\nDone. ${count} ComplianceRules in DB.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
