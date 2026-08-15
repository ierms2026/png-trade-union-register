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
// DISCREPANCY: User asked for 13 entries but listed 12. The 12 below are
// exactly what the user listed (with two obvious typos corrected:
// "Inspectin" → "Inspection", "Secretray" → "Secretary"). The 13th is
// pending user clarification — likely candidates based on the original
// spec are "Bylaws", "Annual Return", or "Meeting Minutes".
// =============================================================================

interface RuleSeed {
  documentType: string;
  required: boolean;
  renewalYears: number;
  retentionYrs: number;
  rationale: string; // why these values — for future tuning
}

const RULES: RuleSeed[] = [
  {
    documentType: "General Matters",
    required: true,
    renewalYears: 1,
    retentionYrs: 5,
    rationale: "Routine correspondence — short retention, annual check.",
  },
  {
    documentType: "Application for Registration",
    required: true,
    renewalYears: 99, // one-time filing
    retentionYrs: 99, // permanent
    rationale: "One-time application — permanent record of the union's founding.",
  },
  {
    documentType: "Registration Certificate",
    required: true,
    renewalYears: 99,
    retentionYrs: 99,
    rationale: "One-time issuance — permanent evidence of legal registration.",
  },
  {
    documentType: "Constitution",
    required: true,
    renewalYears: 99,
    retentionYrs: 50, // per user spec
    rationale:
      "One-time filing (amendments create new versions, not renewals). " +
      "50-year retention per spec — long enough to cover any historical " +
      "legal challenge to the union's governing rules.",
  },
  {
    documentType: "Financial Membership List",
    required: true,
    renewalYears: 1,
    retentionYrs: 7,
    rationale: "Annual roster — 7-year retention aligns with tax/audit cycles.",
  },
  {
    documentType: "Election of Office Bearers",
    required: true,
    renewalYears: 3, // typical PNG office-bearer term
    retentionYrs: 7,
    rationale: "Term-based (3-year office bearer cycle). 7-year retention.",
  },
  {
    documentType: "Secret Ballots",
    required: true,
    renewalYears: 3,
    retentionYrs: 7,
    rationale: "Term-based — ballots happen alongside office-bearer elections.",
  },
  {
    documentType: "Financial Return",
    required: true,
    renewalYears: 1,
    retentionYrs: 7,
    rationale: "Annual audited return — 7-year retention for audit defense.",
  },
  {
    documentType: "Affiliations",
    required: true,
    renewalYears: 1,
    retentionYrs: 7,
    rationale: "Annual declaration of external affiliations.",
  },
  {
    documentType: "Inspection Reports", // user typo "Inspectin" corrected
    required: true,
    renewalYears: 1,
    retentionYrs: 7,
    rationale: "Annual inspection by the Registrar's office.",
  },
  {
    documentType: "General Secretary Appointments", // user typo "Secretray" corrected
    required: true,
    renewalYears: 3,
    retentionYrs: 7,
    rationale: "Term-based — appointment runs with the office-bearer cycle.",
  },
  {
    documentType: "Welfare Fund",
    required: true,
    renewalYears: 1,
    retentionYrs: 7,
    rationale: "Annual welfare-fund statement — 7-year retention.",
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
