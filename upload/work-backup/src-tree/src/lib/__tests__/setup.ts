import { execSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const TEST_DB_PATH = resolve(__dirname, "../../../db/test.db");
const TEST_DB_DIR = resolve(TEST_DB_PATH, "..");
mkdirSync(TEST_DB_DIR, { recursive: true });
if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.SESSION_SECRET = "test-secret-for-vitest-only-do-not-use-in-prod";

execSync("npx prisma db push --skip-generate --accept-data-loss", {
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
}

afterAll(async () => { await testDb.$disconnect(); });
