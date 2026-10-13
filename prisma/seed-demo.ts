import { PrismaClient, Role, UnionStatus, TaskStatus, NotificationType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import { generateDocText } from "./generate-doc-text";

const execFileAsync = promisify(execFile);

// =============================================================================
// Demo data seed — creates a realistic dataset for the Union Records
// Management System so the UI has something to show.
//
// WHAT THIS CREATES:
//   - 3 demo users: registrar@, inspector@, officer@ (password from DEMO_PASSWORD env var)
//   - 6 demo unions with varied statuses (ACTIVE, SUSPENDED, DEREGISTERED)
//   - ~20 documents across the unions, with varied compliance states:
//     - Some filed recently (COMPLIANT)
//     - Some filed ~85 days before expiry (EXPIRING)
//     - Some past expiry (OVERDUE)
//     - Some missing entirely (MISSING)
//   - Document version files written to disk as REAL PDFs:
//     - Born-digital PDFs (with text layer) for recent uploads
//     - Scanned/image-only PDFs for older documents (demonstrates OCR)
//   - textContent populated directly at seed time (search works immediately)
//   - 3 demo tasks
//
// IDEMPOTENT:
//   Re-running this seed is safe — it upserts users and skips existing
//   unions/documents (matched by registrationNo / (unionId, documentType)).
//
// CHUNK 7+8: Real PDFs generated via Python (reportlab + PIL). The text
// content is generated per document type + stored in DocumentVersion.textContent
// so full-text search (chunk 6) works immediately without running the
// backfill script.
// =============================================================================

const db = new PrismaClient();
const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");

// OP-01: shared validation via requireDemoPassword().
import { requireDemoPassword } from "../src/lib/security/require-demo-password";
const DEMO_PASSWORD = requireDemoPassword();

// -----------------------------------------------------------------------------
// 1. Demo users
// -----------------------------------------------------------------------------

interface DemoUser {
  email: string;
  role: Role;
  assignedUnionId?: string; // set after unions are created
}

async function seedUsers() {
  console.log("\nSeeding demo users...");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const users: DemoUser[] = [
    { email: "registrar@example.com", role: Role.REGISTRAR },
    { email: "inspector@example.com", role: Role.INSPECTOR },
    { email: "officer@example.com", role: Role.OFFICER },
  ];

  const created: Record<string, string> = {}; // email → userId

  for (const u of users) {
    const existing = await db.user.findUnique({ where: { email: u.email } });
    if (existing) {
      // Update password hash so the demo password always works.
      await db.user.update({
        where: { id: existing.id },
        data: { passwordHash, disabled: false, failedLoginAttempts: 0, lockedUntil: null },
      });
      created[u.email] = existing.id;
      console.log(`  ✓ ${u.email} (existing, password reset)`);
    } else {
      const newUser = await db.user.create({
        data: { email: u.email, role: u.role, passwordHash },
      });
      created[u.email] = newUser.id;
      console.log(`  ✓ ${u.email} (created)`);
    }
  }

  return created;
}

// -----------------------------------------------------------------------------
// 2. Demo unions
// -----------------------------------------------------------------------------

interface DemoUnion {
  unionName: string;
  registrationNo: string;
  fileNumber: string;
  status: UnionStatus;
  address: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  remarks: string;
}

const DEMO_UNIONS: DemoUnion[] = [
  {
    unionName: "Papua Maritime Workers Union",
    registrationNo: "IO-01",
    fileNumber: "DLIR-2018-001",
    status: UnionStatus.ACTIVE,
    address: "Port Moresby, National Capital District",
    contactPerson: "John Kaupa",
    contactEmail: "secretary@pmwu.pg",
    contactPhone: "+675 325 1001",
    remarks: "Largest maritime union in PNG. Regular filer.",
  },
  {
    unionName: "Highlands Coffee Growers Association",
    registrationNo: "IO-02",
    fileNumber: "DLIR-2019-014",
    status: UnionStatus.ACTIVE,
    address: "Goroka, Eastern Highlands Province",
    contactPerson: "Mary Tovue",
    contactEmail: "info@hcgwa.pg",
    contactPhone: "+675 532 2200",
    remarks: "Agricultural sector. Annual returns usually on time.",
  },
  {
    unionName: "Port Moresby Teachers Federation",
    registrationNo: "IO-03",
    fileNumber: "DLIR-2017-027",
    status: UnionStatus.SUSPENDED,
    address: "Port Moresby, National Capital District",
    contactPerson: "Peter Bani",
    contactEmail: "contact@pomtf.pg",
    contactPhone: "+675 325 4400",
    remarks: "Suspended pending investigation into 2022 election dispute.",
  },
  {
    unionName: "New Ireland Mining Employees Union",
    registrationNo: "IO-04",
    fileNumber: "DLIR-2020-008",
    status: UnionStatus.ACTIVE,
    address: "Kavieng, New Ireland Province",
    contactPerson: "Samuel Lavong",
    contactEmail: "office@nimeu.pg",
    contactPhone: "+675 984 2100",
    remarks: "Mining sector. Recent constitutional amendment filed.",
  },
  {
    unionName: "East Sepik Fisherfolk Cooperative",
    registrationNo: "IO-05",
    fileNumber: "DLIR-2016-019",
    status: UnionStatus.DEREGISTERED,
    address: "Wewak, East Sepik Province",
    contactPerson: "Joseph Wartovo",
    contactEmail: "deregistered@esfc.pg",
    contactPhone: "+675 456 2300",
    remarks: "Deregistered 2023 for failure to file returns for 3 consecutive years.",
  },
  {
    unionName: "Southern Highlands Energy Workers Union",
    registrationNo: "IO-06",
    fileNumber: "DLIR-2021-033",
    status: UnionStatus.ACTIVE,
    address: "Mendi, Southern Highlands Province",
    contactPerson: "Grace Anderson",
    contactEmail: "info@shewu.pg",
    contactPhone: "+675 549 1100",
    remarks: "New registration (2021). Energy sector. First returns due soon.",
  },
];

async function seedUnions(): Promise<Record<string, string>> {
  console.log("\nSeeding demo unions...");
  const map: Record<string, string> = {}; // unionName → id

  for (const u of DEMO_UNIONS) {
    const existing = await db.union.findUnique({
      where: { registrationNo: u.registrationNo },
    });
    if (existing) {
      map[u.unionName] = existing.id;
      console.log(`  ✓ ${u.unionName} (existing)`);
    } else {
      const created = await db.union.create({ data: { ...u } });
      map[u.unionName] = created.id;
      console.log(`  ✓ ${u.unionName} (created)`);
    }
  }

  return map;
}

// -----------------------------------------------------------------------------
// 3. Assign officer to Papua Maritime Workers Union
// -----------------------------------------------------------------------------

async function assignOfficer(userIdByEmail: Record<string, string>, unionIdByName: Record<string, string>) {
  const officerId = userIdByEmail["officer@example.com"];
  const unionId = unionIdByName["Papua Maritime Workers Union"];
  if (officerId && unionId) {
    await db.user.update({
      where: { id: officerId },
      data: { assignedUnionId: unionId },
    });
    console.log(`\n  ✓ Officer assigned to Papua Maritime Workers Union`);
  }
}

// -----------------------------------------------------------------------------
// 4. Demo documents with varied compliance states
// -----------------------------------------------------------------------------

/**
 * Compute a date that's `daysAgo` days before now.
 */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/**
 * Generate a real PDF file for a document version.
 *
 * Two modes:
 *   - "born-digital" : PDF with a text layer (pdftotext extracts it instantly)
 *   - "scanned"      : Image-only PDF (no text layer — needs OCR)
 *
 * The text content is passed to the Python helper via stdin. The same text
 * is stored in DocumentVersion.textContent so search works immediately
 * without needing to run the backfill/extract-text script.
 *
 * Returns the relative path (stored in DB), the checksum, the file size,
 * and the text content (for populating textContent).
 *
 * Falls back to placeholder text if Python/PIL/reportlab aren't available
 * — the seed still works, just without real PDFs.
 */
async function writeVersionFile(
  unionId: string,
  documentId: string,
  versionNumber: number,
  documentType: string,
  unionName: string,
  registrationNo: string,
  fileName: string,
  filedDaysAgo: number,
): Promise<{
  relativePath: string;
  checksum: string;
  size: number;
  textContent: string | null;
  pdfMode: "born-digital" | "scanned" | "placeholder";
}> {
  const relativePath = path.posix.join(
    "unions",
    unionId,
    documentId,
    `${versionNumber}.bin`,
  );
  const absolutePath = path.join(STORAGE_ROOT, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });

  // Generate realistic text content for this document type
  const textContent = generateDocText({
    unionName,
    registrationNo,
    documentType,
    fileName,
    filedDaysAgo,
  });

  // Determine PDF mode: documents filed > 3 years ago are "scanned"
  // (realistic — older documents were likely paper, then scanned). Recent
  // uploads are "born-digital" (modern workflow).
  const isScanned = filedDaysAgo > 365 * 3;
  const pdfMode: "born-digital" | "scanned" = isScanned ? "scanned" : "born-digital";
  const title = `${documentType} — ${unionName}`;

  // Try to generate a real PDF via the Python helper.
  // Fall back to placeholder text if Python/PIL/reportlab aren't available.
  let buffer: Buffer;
  let actualMode: "born-digital" | "scanned" | "placeholder" = pdfMode;
  try {
    const scriptPath = path.join(process.cwd(), "scripts", "generate-demo-pdf.py");
    // Write the text content to a temp file that the Python script reads via stdin.
    // (execFile doesn't support stdin directly, so we pass the temp file path
    // as an argument and delete it after.)
    const tmpTextFile = path.join(os.tmpdir(), `urm-seed-text-${documentId}.txt`);
    await fs.writeFile(tmpTextFile, textContent, "utf8");
    try {
      await execFileAsync(
        "python3",
        [
          scriptPath,
          "--output", absolutePath,
          "--mode", pdfMode,
          "--title", title,
          "--text-file", tmpTextFile,
        ],
        { maxBuffer: 50 * 1024 * 1024 },
      );
      buffer = await fs.readFile(absolutePath);
    } finally {
      await fs.unlink(tmpTextFile).catch(() => {});
    }
  } catch (err) {
    // Fallback: write the text as a placeholder .bin file.
    // The seed still works — search won't find these until real PDFs are
    // uploaded, but the UI is fully functional.
    console.warn(`    ⚠ PDF generation failed (${pdfMode}), using placeholder: ${err instanceof Error ? err.message : err}`);
    buffer = Buffer.from(textContent, "utf8");
    await fs.writeFile(absolutePath, buffer);
    actualMode = "placeholder";
  }

  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  return {
    relativePath,
    checksum,
    size: buffer.length,
    // textContent is stored so search works immediately. For born-digital
    // PDFs, this is the exact text in the PDF (pdftotext would extract it).
    // For scanned PDFs, this is the text that OCR would recognize (we're
    // pre-populating it to avoid needing OCR at seed time).
    textContent,
    pdfMode: actualMode,
  };
}

interface DocSeed {
  unionName: string;
  documentType: string;
  fileName: string;
  // When the version was uploaded (days ago). null = no version (MISSING).
  filedDaysAgo: number | null;
  disposed?: boolean;
}

// Document types use descriptive names. IO-# convention applies to file names only.
// compliance rules. File names include the union's numeric registration
// number: IO-[regNum]-[code] e.g. IO-1-02, or A[regNum] e.g. A1
const DOC_SEEDS: DocSeed[] = [
  // Papua Maritime Workers Union (regNum=1) — mostly compliant
  { unionName: "Papua Maritime Workers Union", documentType: "Registration Certificate", fileName: "IO-1-02", filedDaysAgo: 365 * 5 },
  { unionName: "Papua Maritime Workers Union", documentType: "Constitution", fileName: "IO-1-03", filedDaysAgo: 365 * 2 },
  { unionName: "Papua Maritime Workers Union", documentType: "Financial Return", fileName: "IO-1-07", filedDaysAgo: 60 },
  { unionName: "Papua Maritime Workers Union", documentType: "Election of Office Bearers", fileName: "IO-1-05", filedDaysAgo: 365 },
  { unionName: "Papua Maritime Workers Union", documentType: "Financial Membership List", fileName: "IO-1-04", filedDaysAgo: 30 },
  { unionName: "Papua Maritime Workers Union", documentType: "Awards", fileName: "A1", filedDaysAgo: 200 },

  // Highlands Coffee Growers (regNum=2) — some expiring
  { unionName: "Highlands Coffee Growers Association", documentType: "Registration Certificate", fileName: "IO-2-02", filedDaysAgo: 365 * 4 },
  { unionName: "Highlands Coffee Growers Association", documentType: "Constitution", fileName: "IO-2-03", filedDaysAgo: 365 * 3 },
  { unionName: "Highlands Coffee Growers Association", documentType: "Financial Return", fileName: "IO-2-07", filedDaysAgo: 320 }, // expiring soon
  { unionName: "Highlands Coffee Growers Association", documentType: "Affiliations", fileName: "IO-2-08", filedDaysAgo: 350 }, // expiring
  { unionName: "Highlands Coffee Growers Association", documentType: "Awards", fileName: "A2", filedDaysAgo: 365 * 2 }, // overdue

  // Port Moresby Teachers Federation (regNum=3, suspended) — overdue
  { unionName: "Port Moresby Teachers Federation", documentType: "Registration Certificate", fileName: "IO-3-02", filedDaysAgo: 365 * 6 },
  { unionName: "Port Moresby Teachers Federation", documentType: "Constitution", fileName: "IO-3-03", filedDaysAgo: 365 * 5 },
  { unionName: "Port Moresby Teachers Federation", documentType: "Financial Return", fileName: "IO-3-07", filedDaysAgo: 400 }, // overdue
  { unionName: "Port Moresby Teachers Federation", documentType: "Election of Office Bearers", fileName: "IO-3-05", filedDaysAgo: 365 * 4 }, // overdue

  // New Ireland Mining (regNum=4) — mixed
  { unionName: "New Ireland Mining Employees Union", documentType: "Registration Certificate", fileName: "IO-4-02", filedDaysAgo: 365 * 3 },
  { unionName: "New Ireland Mining Employees Union", documentType: "Constitution", fileName: "IO-4-03", filedDaysAgo: 100 },
  { unionName: "New Ireland Mining Employees Union", documentType: "Financial Return", fileName: "IO-4-07", filedDaysAgo: 20 },
  // MISSING: Financial Membership List

  // East Sepik Fisherfolk (regNum=5, deregistered) — disposed docs
  { unionName: "East Sepik Fisherfolk Cooperative", documentType: "Registration Certificate", fileName: "IO-5-02", filedDaysAgo: 365 * 7, disposed: true },
  { unionName: "East Sepik Fisherfolk Cooperative", documentType: "Constitution", fileName: "IO-5-03", filedDaysAgo: 365 * 7, disposed: true },

  // Southern Highlands Energy (regNum=6) — new, mostly missing
  { unionName: "Southern Highlands Energy Workers Union", documentType: "Registration Certificate", fileName: "IO-6-02", filedDaysAgo: 60 },
  { unionName: "Southern Highlands Energy Workers Union", documentType: "Constitution", fileName: "IO-6-03", filedDaysAgo: 60 },
  // MISSING: Financial Return, etc.
];

async function seedDocuments(unionIdByName: Record<string, string>, userIdByEmail: Record<string, string>) {
  console.log("\nSeeding demo documents...");
  const registrarId = userIdByEmail["registrar@example.com"];
  let created = 0;
  let bornDigitalCount = 0;
  let scannedCount = 0;

  for (const seed of DOC_SEEDS) {
    const unionId = unionIdByName[seed.unionName];
    if (!unionId) continue;

    // Check if a document of this type already exists for this union.
    const existing = await db.document.findFirst({
      where: { unionId, documentType: seed.documentType },
    });
    if (existing) {
      continue; // idempotent — skip
    }

    // Look up the union to get its name + registration number for the text content.
    const union = await db.union.findUnique({
      where: { id: unionId },
      select: { unionName: true, registrationNo: true },
    });
    if (!union) continue;

    // Create the Document row first (we need its ID for the file path).
    const documentId = crypto.randomUUID();
    const disposedAt = seed.disposed ? new Date() : null;

    if (seed.filedDaysAgo === null) {
      // No version — just create the Document row.
      await db.document.create({
        data: {
          id: documentId,
          unionId,
          documentType: seed.documentType,
          disposedAt,
        },
      });
      created++;
      continue;
    }

    // Generate a real PDF file (born-digital or scanned).
    const { relativePath, checksum, size, textContent, pdfMode } = await writeVersionFile(
      unionId,
      documentId,
      1,
      seed.documentType,
      union.unionName,
      union.registrationNo,
      seed.fileName,
      seed.filedDaysAgo,
    );

    if (pdfMode === "born-digital") bornDigitalCount++;
    else if (pdfMode === "scanned") scannedCount++;

    const uploadedAt = daysAgo(seed.filedDaysAgo);

    // Create Document + DocumentVersion in a transaction.
    // textContent is populated directly so search works immediately
    // (no need to run the backfill/extract-text script after seeding).
    const versionId = crypto.randomUUID();
    await db.$transaction(async (tx) => {
      await tx.document.create({
        data: {
          id: documentId,
          unionId,
          documentType: seed.documentType,
          disposedAt,
          currentVersionId: versionId,
        },
      });
      await tx.documentVersion.create({
        data: {
          id: versionId,
          documentId,
          versionNumber: 1,
          fileName: seed.fileName,
          filePath: relativePath,
          fileSize: size,
          checksum,
          fileExtension: ".pdf",
          uploadedById: registrarId,
          uploadedAt,
          textContent, // populated at seed time — search works immediately
        },
      });
    });
    created++;
    console.log(`  ✓ ${union.unionName} — ${seed.documentType} [${pdfMode}]`);
  }

  console.log(`  ✓ ${created} documents processed (${bornDigitalCount} born-digital, ${scannedCount} scanned)`);
}

// -----------------------------------------------------------------------------
// 5. Demo tasks
// -----------------------------------------------------------------------------

async function seedTasks(userIdByEmail: Record<string, string>, unionIdByName: Record<string, string>) {
  console.log("\nSeeding demo tasks...");
  const registrarId = userIdByEmail["registrar@example.com"];
  const officerId = userIdByEmail["officer@example.com"];
  const maritimeUnionId = unionIdByName["Papua Maritime Workers Union"];
  const teachersUnionId = unionIdByName["Port Moresby Teachers Federation"];

  const existingTasks = await db.task.count();
  if (existingTasks > 0) {
    console.log(`  ✓ Tasks already exist (${existingTasks}), skipping`);
    return;
  }

  const tasks = [
    {
      title: "Review PMWU Financial Return 2025",
      description: "Verify the 2025 financial return for completeness and forward to audit.",
      status: TaskStatus.IN_PROGRESS,
      priority: "HIGH",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      unionId: maritimeUnionId,
      assigneeId: officerId,
      createdById: registrarId,
    },
    {
      title: "Follow up on POMTF suspension",
      description: "Contact the suspended Port Moresby Teachers Federation regarding their appeal status.",
      status: TaskStatus.PENDING,
      priority: "NORMAL",
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      unionId: teachersUnionId,
      assigneeId: registrarId,
      createdById: registrarId,
    },
    {
      title: "Quarterly compliance review",
      description: "Run the quarterly compliance sweep and notify non-compliant unions.",
      status: TaskStatus.PENDING,
      priority: "NORMAL",
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      unionId: null,
      assigneeId: registrarId,
      createdById: registrarId,
    },
  ];

  for (const t of tasks) {
    await db.task.create({ data: t });
  }
  console.log(`  ✓ ${tasks.length} tasks created`);
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  console.log("=== Seeding demo data ===");

  const userIdByEmail = await seedUsers();
  const unionIdByName = await seedUnions();
  await assignOfficer(userIdByEmail, unionIdByName);
  await seedDocuments(unionIdByName, userIdByEmail);
  await seedTasks(userIdByEmail, unionIdByName);

  // Run the compliance sweep to generate notifications.
  console.log("\nRunning compliance sweep to generate notifications...");
  try {
    const response = await fetch("http://localhost:3000/api/cron/compliance-sweep", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    });
    if (response.ok) {
      const result = await response.json();
      console.log(`  ✓ Sweep complete: ${result.notificationsCreated} notifications created for ${result.issuesFound} issues`);
    } else {
      console.log(`  ⚠ Sweep returned ${response.status} (dev server may not be running — notifications will be generated on next cron)`);
    }
  } catch (err) {
    console.log(`  ⚠ Sweep failed (dev server may not be running): ${err instanceof Error ? err.message : err}`);
    console.log(`     The sweep can be run manually via: curl -X POST -H "Authorization: Bearer ${process.env.CRON_SECRET}" http://localhost:3000/api/cron/compliance-sweep`);
  }

  console.log("\n=== Demo data seed complete ===");
  console.log(`\nDemo credentials (password: ${DEMO_PASSWORD}):`);
  console.log("  registrar@example.com  — full admin access");
  console.log("  inspector@example.com  — read-only oversight");
  console.log("  officer@example.com    — scoped to Papua Maritime Workers Union");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
