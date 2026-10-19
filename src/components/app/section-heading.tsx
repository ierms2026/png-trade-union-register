import { cn } from "@/lib/utils";

// =============================================================================
// SectionHeading — the standard section-label pattern used above groups of
// cards / panels / rows.
//
// Design-system fix: prior to this component, views used 4+ different
// ad-hoc patterns for section headings:
//   - <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
//   - <h2 className="text-lg font-semibold">
//   - <h2 className="mb-3 text-sm font-medium">
//   - <CardTitle className="text-lg">
//
// This component enforces ONE canonical section-heading style:
//   text-sm font-semibold uppercase tracking-wider text-muted-foreground
//
// It's deliberately SMALLER than the h1 (text-3xl) and the card titles
// (text-lg font-semibold via CardTitle). The hierarchy is now:
//
//   PageHeader h1    → text-3xl font-bold        (the page title)
//   SectionHeading   → text-sm font-semibold uppercase tracking-wider  (section label)
//   CardTitle        → text-lg font-semibold     (card title)
//   body             → text-base / text-sm       (content)
//   meta             → text-xs                   (timestamps, IDs)
//
// Usage:
//   <SectionHeading>Quick actions</SectionHeading>
//   <SectionHeading className="mb-3">Pending First Review</SectionHeading>
//   <SectionHeading as="h3">Documents by Category</SectionHeading>
// =============================================================================

interface SectionHeadingProps {
  children: React.ReactNode;
  /** The heading level. Defaults to h2. Use h3 for sub-sections. */
  as?: "h2" | "h3" | "h4";
  /** Optional className for spacing (e.g. "mb-3"). */
  className?: string;
}

export function SectionHeading({ children, as: Tag = "h2", className }: SectionHeadingProps) {
  return (
    <Tag
      className={cn(
        "text-sm font-semibold uppercase tracking-wider text-muted-foreground",
        className
      )}
    >
      {children}
    </Tag>
  );
}
