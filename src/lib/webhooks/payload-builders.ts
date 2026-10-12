import type { SweepIssue } from "@/lib/compliance/sweep-issues";

export interface StatusChange {
  unionId: string;
  unionName: string;
  previousScore: number | null;
  currentScore: number | null;
}

export function buildComplianceStatusChangePayload(
  change: StatusChange,
  issues: SweepIssue[],
  sweptAt: string,
): Record<string, unknown> {
  return {
    unionId: change.unionId,
    unionName: change.unionName,
    previousScore: change.previousScore,
    currentScore: change.currentScore,
    issuesCount: issues.filter((i) => i.unionId === change.unionId).length,
    sweptAt,
  };
}
