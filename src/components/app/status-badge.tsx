import { CheckCircle2, Pause, XCircle, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getUnionStatusLabel } from "@/lib/dashboard/vocabulary";
import { DefinitionPopover } from "@/components/app/definition-popover";

// =============================================================================
// StatusBadge — renders a union status badge with an icon.
//
// ACTIVE      → green tint + CheckCircle2 icon
// SUSPENDED   → gold tint + Pause icon
// DEREGISTERED → muted tint + XCircle icon
//
// Used across the union list, union detail page, and compliance matrix
// for consistent, scannable status indicators.
//
// STEP 5 (onboarding): the badge now optionally renders a "?" popover
// next to the label, showing the plain-language definition from
// CONTENT_DEFINITIONS (the runtime mirror of docs/CONTENT.md). Pass
// `withHelp` to enable it. The popover is OFF by default to avoid
// visual clutter in dense tables.
// =============================================================================

type UnionStatus = "ACTIVE" | "SUSPENDED" | "DEREGISTERED" | string;

interface StatusBadgeConfig {
  icon: LucideIcon;
  variant: "default" | "secondary" | "destructive" | "outline";
  className: string;
}

const STATUS_CONFIG: Record<string, StatusBadgeConfig> = {
  ACTIVE: { icon: CheckCircle2, variant: "default", className: "bg-chart-3/15 text-chart-3 border-chart-3/30" },
  SUSPENDED: { icon: Pause, variant: "secondary", className: "bg-accent/15 text-accent-foreground border-accent/30" },
  DEREGISTERED: { icon: XCircle, variant: "secondary", className: "bg-muted text-muted-foreground border-border" },
};

// Maps a UnionStatus to its CONTENT_DEFINITIONS key. The test in
// content-definitions.test.ts asserts these keys all exist.
const UNION_STATUS_HELP_KEY: Record<string, string> = {
  ACTIVE: "union-status.active",
  SUSPENDED: "union-status.suspended",
  DEREGISTERED: "union-status.deregistered",
};

interface StatusBadgeProps {
  status: UnionStatus;
  /** When true, renders a "?" DefinitionPopover next to the label.
   *  Defaults to false (keeps dense tables uncluttered). */
  withHelp?: boolean;
}

export function StatusBadge({ status, withHelp = false }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.DEREGISTERED;
  const Icon = config.icon;
  const helpKey = UNION_STATUS_HELP_KEY[status];

  return (
    <Badge variant={config.variant} className={`gap-1 ${config.className}`}>
      <Icon className="h-3 w-3" />
      {getUnionStatusLabel(status as "ACTIVE" | "SUSPENDED" | "DEREGISTERED")}
      {withHelp && helpKey && (
        <DefinitionPopover termKey={helpKey} size="xs" align="start" />
      )}
    </Badge>
  );
}
