import { db } from "@/lib/prisma";
import { Severity } from "@prisma/client";

export const RETENTION_DAYS: Record<Exclude<Severity, "CRITICAL">, number> = {
  INFO: 365,
  WARNING: 365 * 3,
};

export const MAX_ITERATIONS = 500;

export async function pruneSeverity(
  severity: Exclude<Severity, "CRITICAL">,
  cutoff: Date,
): Promise<number> {
  let totalDeleted = 0;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await db.auditLog.deleteMany({
      where: { severity, createdAt: { lt: cutoff } },
    });
    totalDeleted += result.count;
    if (result.count === 0) break;
  }
  return totalDeleted;
}

export async function runRetentionSweep(): Promise<{
  info: number; warning: number; critical: number;
  cutoffs: { info: Date; warning: Date };
}> {
  const now = Date.now();
  const infoCutoff = new Date(now - RETENTION_DAYS.INFO * 24 * 60 * 60 * 1000);
  const warningCutoff = new Date(now - RETENTION_DAYS.WARNING * 24 * 60 * 60 * 1000);
  const info = await pruneSeverity("INFO", infoCutoff);
  const warning = await pruneSeverity("WARNING", warningCutoff);
  return { info, warning, critical: 0, cutoffs: { info: infoCutoff, warning: warningCutoff } };
}
