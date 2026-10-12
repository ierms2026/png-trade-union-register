"use client";

import { HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getContentDefinition } from "@/lib/dashboard/content-definitions";

// =============================================================================
// DefinitionPopover — small "?" help next to status badges and key labels.
//
// The `termKey` prop is a key into CONTENT_DEFINITIONS (the runtime mirror
// of docs/CONTENT.md). The body of the popover is the plain-language
// definition from that file — never hardcoded here.
//
// USAGE:
//   <DefinitionPopover termKey="compliance-status.missing" />
//   <DefinitionPopover termKey="union-status.suspended" label="What does this mean?" />
//
// A11Y:
//   - The trigger is a real <button> (keyboard-accessible by default).
//   - The trigger has aria-label so screen readers announce the term.
//   - The popover content has role="dialog" (Radix default) so screen
//     readers announce it as a dialog when opened.
//   - Escape closes the popover AND returns focus to the trigger (Radix
//     Popover default).
//
// GRACEFUL DEGRADATION:
//   If `termKey` is not in CONTENT_DEFINITIONS, the popover renders nothing
//   (no trigger, no content). The test in content-definitions.test.ts
//   ensures every termKey used in the UI is defined, so this should never
//   happen in practice — but the graceful degradation prevents a runtime
//   crash if it does.
// =============================================================================

interface DefinitionPopoverProps {
  /** Key into CONTENT_DEFINITIONS (e.g. "compliance-status.missing"). */
  termKey: string;
  /** Optional accessible label for the trigger button. Defaults to
   *  "What does <title> mean?" using the definition's title. */
  label?: string;
  /** Optional className for the trigger button (sizing/positioning). */
  className?: string;
  /** Optional alignment for the popover content. Defaults to "start". */
  align?: "start" | "center" | "end";
  /** Optional size variant. "sm" (default) is a 14px icon; "xs" is 12px
   *  for use inside badges / tight rows. */
  size?: "sm" | "xs";
}

export function DefinitionPopover({
  termKey,
  label,
  className,
  align = "start",
  size = "sm",
}: DefinitionPopoverProps) {
  const definition = getContentDefinition(termKey);

  // Graceful degradation: if the key is missing, render nothing.
  // The test ensures this never happens in practice.
  if (!definition) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        `DefinitionPopover: termKey "${termKey}" not found in CONTENT_DEFINITIONS. ` +
          `Add it to src/lib/dashboard/content-definitions.ts and docs/CONTENT.md.`,
      );
    }
    return null;
  }

  const iconSize = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";
  const ariaLabelText = label ?? `What does ${definition.title} mean?`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabelText}
          className={`inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-colors ${className ?? ""}`}
          // Prevent the click from bubbling up to parent onClick handlers
          // (e.g. when the popover is inside a clickable row or card).
          onClick={(e) => e.stopPropagation()}
        >
          <HelpCircle className={iconSize} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} sideOffset={4} className="w-80">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold leading-tight">{definition.title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {definition.body}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
