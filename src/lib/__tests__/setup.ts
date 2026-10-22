import { execSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const TEST_DB_PATH = resolve(__dirname, "../../../db/test.db");
const TEST_DB_DIR = resolve(TEST_DB_PATH, "..");
mkdirSync(TEST_DB_DIR, { recursive: true });
if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.SESSION_SECRET = "test-secret-for-vitest-only-do-not-use-in-prod";

// The main schema uses provider = "postgresql" for Vercel deployment.
// Tests use SQLite (faster, no Postgres needed). Create a temporary test
// schema with provider = "sqlite", generate the PrismaClient against it,
// then run db push.
const SCHEMA_PATH = resolve(__dirname, "../../../prisma/schema.prisma");
const TEST_SCHEMA_PATH = resolve(__dirname, "../../../prisma/schema-test.prisma");
const schemaContent = readFileSync(SCHEMA_PATH, "utf-8");
const testSchemaContent = schemaContent.replace(
  /provider = "postgresql"/,
  'provider = "sqlite"',
);
writeFileSync(TEST_SCHEMA_PATH, testSchemaContent);

execSync("npx prisma generate --schema prisma/schema-test.prisma", {
  stdio: "pipe",
  cwd: resolve(__dirname, "../../.."),
});

execSync("npx prisma db push --schema prisma/schema-test.prisma --skip-generate --accept-data-loss", {
  stdio: "pipe",
  env: { ...process.env, DATABASE_URL: `file:${TEST_DB_PATH}` },
  cwd: resolve(__dirname, "../../.."),
});

export const testDb = new PrismaClient();

export async function resetDb(): Promise<void> {
  await testDb.notification.deleteMany();
  await testDb.documentVersion.deleteMany();
  await testDb.document.deleteMany();
  await testDb.task.deleteMany();
  await testDb.session.deleteMany();
  await testDb.loginAttempt.deleteMany();
  await testDb.auditLog.deleteMany();
  await testDb.apiKey.deleteMany();
  await testDb.user.deleteMany();
  await testDb.union.deleteMany();
  await testDb.complianceRule.deleteMany();
  await testDb.contactUpdateRequest.deleteMany();
  await testDb.legalHold.deleteMany();
  await testDb.dispositionRequest.deleteMany();
  await testDb.webhookEndpoint.deleteMany();
  await testDb.complianceSnapshot.deleteMany();
}

afterAll(async () => {
  await testDb.$disconnect();
});
