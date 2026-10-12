import { CheckCircle2, AlertTriangle, XCircle, FileQuestion, Ban, Clock, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { COMPLIANCE_STATUS_CONFIG, type ComplianceStatus } from "@/lib/dashboard/vocabulary";
import { DefinitionPopover } from "@/components/app/definition-popover";

// =============================================================================
// ComplianceStatusBadge — renders a COMPLIANCE status badge (not a union
// status badge). Used by the portal compliance view.
//
// T52: the portal compliance view was passing a ComplianceStatus to
// StatusBadge (which only knows union statuses ACTIVE/SUSPENDED/DEREGISTERED).
// The fallback showed deregistered styling (grey + XCircle) and the raw
// enum text (e.g. "AWAITING_REVIEW"). This component uses the same visual
// tokens as the staff compliance view (compliance.tsx STATUS_VISUAL) and
// the label from COMPLIANCE_STATUS_CONFIG (single source).
//
// StatusBadge (for union statuses) is unchanged — it still handles
// ACTIVE/SUSPENDED/DEREGISTERED for the union list, union detail, etc.
//
// STEP 5 (onboarding): the badge now optionally renders a "?" popover
// next to the label, showing the plain-language definition from
// CONTENT_DEFINITIONS (the runtime mirror of docs/CONTENT.md). Pass
// `withHelp` to enable it. The popover is OFF by default to avoid
// visual clutter in dense tables (e.g. the compliance matrix).
// =============================================================================

const COMPLIANCE_VISUAL: Record<ComplianceStatus, { icon: LucideIcon; className: string }> = {
  // STEP 6 (polish): use tailwind color stops (not chart tokens) so the
  // bg+text pair is guaranteed WCAG-AA contrast in both light + dark.
  // Matches the `cell` field in COMPLIANCE_STATUS_CONFIG (vocabulary.ts).
  COMPLIANT: { icon: CheckCircle2, className: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900" },
  EXPIRING: { icon: AlertTriangle, className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900" },
  OVERDUE: { icon: XCircle, className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900" },
  AWAITING_REVIEW: { icon: Clock, className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900" },
  MISSING: { icon: FileQuestion, className: "bg-muted text-muted-foreground border-border" },
  NOT_APPLICABLE: { icon: Ban, className: "bg-muted/50 text-muted-foreground border-border" },
};

// Maps a ComplianceStatus to its CONTENT_DEFINITIONS key. Kept here (not
// in vocabulary.ts) because the keys are an onboarding concern, not a
// status-config concern. The test in content-definitions.test.ts asserts
// these keys all exist.
const COMPLIANCE_STATUS_HELP_KEY: Record<ComplianceStatus, string> = {
  COMPLIANT: "compliance-status.compliant",
  EXPIRING: "compliance-status.expiring",
  OVERDUE: "compliance-status.overdue",
  AWAITING_REVIEW: "compliance-status.awaiting-review",
  MISSING: "compliance-status.missing",
  NOT_APPLICABLE: "compliance-status.not-applicable",
};

interface ComplianceStatusBadgeProps {
  status: ComplianceStatus;
  /** When true, renders a "?" DefinitionPopover next to the label.
   *  Defaults to false (keeps dense tables uncluttered). */
  withHelp?: boolean;
}

export function ComplianceStatusBadge({ status, withHelp = false }: ComplianceStatusBadgeProps) {
  const visual = COMPLIANCE_VISUAL[status] ?? COMPLIANCE_VISUAL.MISSING;
  const Icon = visual.icon;
  const label = COMPLIANCE_STATUS_CONFIG[status]?.label ?? status;

  return (
    <Badge variant="outline" className={`gap-1 ${visual.className}`}>
      <Icon className="h-3 w-3" />
      {label}
      {withHelp && (
        <DefinitionPopover
          termKey={COMPLIANCE_STATUS_HELP_KEY[status]}
          size="xs"
          align="start"
        />
      )}
    </Badge>
  );
}
