import { db } from "@/lib/prisma";
import { Role } from "@prisma/client";

export interface LastRegistrarCheckResult {
  safe: boolean;
  error?: string;
}

export async function checkLastRegistrar(
  targetUserId: string,
): Promise<LastRegistrarCheckResult> {
  const targetUser = await db.user.findUnique({
    where: { id: targetUserId },
    select: { role: true, disabled: true },
  });
  if (!targetUser || targetUser.role !== Role.REGISTRAR || targetUser.disabled) {
    return { safe: true };
  }
  const otherActiveRegistrars = await db.user.count({
    where: { role: Role.REGISTRAR, disabled: false, id: { not: targetUserId } },
  });
  if (otherActiveRegistrars === 0) {
    return {
      safe: false,
      error: "You cannot disable the last remaining Registrar. Promote another user to Registrar first, or re-enable an existing Registrar.",
    };
  }
  return { safe: true };
}
