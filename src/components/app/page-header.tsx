import { cn } from "@/lib/utils";

// =============================================================================
// PageHeader — the standard page-title block for every authenticated view.
//
// Design-system fix: prior to this component, every view rolled its own
// h1 + subtitle with inconsistent sizes (text-2xl, text-3xl, text-4xl,
// text-5xl) + inconsistent subtitle styles. This component enforces ONE
// canonical type scale across all 20+ views:
//
//   h1:   text-3xl font-bold tracking-tight  (was 2xl/3xl/4xl/5xl — now uniform)
//   sub:  text-sm text-muted-foreground       (was inconsistent)
//
// The h1 is text-3xl (not 4xl/5xl) because:
//   - The public portal h1 is text-5xl (it's a MARKETING page — the title
//     IS the content).
//   - The staff app h1 is text-3xl (it's a TOOL — the title labels the
//     workspace, the DATA is the content). A smaller h1 lets the KPIs /
//     tables / forms below have more visual weight relative to the title.
//
// Usage:
//   <PageHeader title="Dashboard" description="Overview of the union registry." />
//   <PageHeader title="Compliance" />  // no description
//   <PageHeader title="Users" description="..." actions={<Button>New User</Button>} />
// =============================================================================

interface PageHeaderProps {
  /** The page title. Required — every page needs a clear h1. */
  title: string;
  /** Optional subtitle / description. Shown below the h1 in muted text. */
  description?: React.ReactNode;
  /** Optional actions (buttons, filters) aligned to the right on desktop. */
  actions?: React.ReactNode;
  /** Optional className for the outer wrapper. */
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
