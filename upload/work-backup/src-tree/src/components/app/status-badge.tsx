import { CheckCircle2, Pause, XCircle, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getUnionStatusLabel } from "@/lib/dashboard/vocabulary";

// =============================================================================
// StatusBadge — renders a union status badge with an icon.
//
// ACTIVE      → green tint + CheckCircle2 icon
// SUSPENDED   → gold tint + Pause icon
// DEREGISTERED → muted tint + XCircle icon
//
// Used across the union list, union detail page, and compliance matrix
// for consistent, scannable status indicators.
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

export function StatusBadge({ status }: { status: UnionStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.DEREGISTERED;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={`gap-1 ${config.className}`}>
      <Icon className="h-3 w-3" />
      {getUnionStatusLabel(status as "ACTIVE" | "SUSPENDED" | "DEREGISTERED")}
    </Badge>
  );
}
