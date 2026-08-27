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

// Document types follow the IO-# naming convention:
//   IO-1, IO-2, IO-3, ... IO-14
// Each IO number maps to a specific Industrial Organizations document
// classification. File names use the format: "IO-# [Registration No]"
// e.g., "IO-3 PNG-TU-0001"
const RULES: RuleSeed[] = [
  {
    documentType: "IO-1",
    required: true,
    renewalYears: 1,
    retentionYrs: 5,
    rationale: "General Matters — routine correspondence, annual check.",
  },
  {
    documentType: "IO-2",
    required: true,
    renewalYears: 99,
    retentionYrs: 99,
    rationale: "Application for Registration — one-time, permanent.",
  },
  {
    documentType: "IO-3",
    required: true,
    renewalYears: 99,
    retentionYrs: 99,
    rationale: "Registration Certificate — one-time issuance, permanent.",
  },
  {
    documentType: "IO-4",
    required: true,
    renewalYears: 99,
    retentionYrs: 50,
    rationale: "Constitution — one-time filing, 50-year retention.",
  },
  {
    documentType: "IO-5",
    required: true,
    renewalYears: 1,
    retentionYrs: 7,
    rationale: "Financial Membership List — annual, 7-year retention.",
  },
  {
    documentType: "IO-6",
    required: true,
    renewalYears: 3,
    retentionYrs: 7,
    rationale: "Election of Office Bearers — term-based (3yr), 7yr retention.",
  },
  {
    documentType: "IO-7",
    required: true,
    renewalYears: 3,
    retentionYrs: 7,
    rationale: "Secret Ballots — term-based, 7-year retention.",
  },
  {
    documentType: "IO-8",
    required: true,
    renewalYears: 1,
    retentionYrs: 7,
    rationale: "Financial Return — annual audited, 7-year retention.",
  },
  {
    documentType: "IO-9",
    required: true,
    renewalYears: 1,
    retentionYrs: 7,
    rationale: "Affiliations — annual declaration, 7-year retention.",
  },
  {
    documentType: "IO-10",
    required: true,
    renewalYears: 1,
    retentionYrs: 7,
    rationale: "Inspection Reports — annual, 7-year retention.",
  },
  {
    documentType: "IO-11",
    required: true,
    renewalYears: 3,
    retentionYrs: 7,
    rationale: "General Secretary Appointments — term-based, 7yr retention.",
  },
  {
    documentType: "IO-12",
    required: true,
    renewalYears: 1,
    retentionYrs: 7,
    rationale: "Welfare Fund — annual statement, 7-year retention.",
  },
  {
    documentType: "IO-13",
    required: true,
    renewalYears: 3,
    retentionYrs: 7,
    rationale: "Awards — industrial awards, 3yr renewal, 7yr retention.",
  },
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
