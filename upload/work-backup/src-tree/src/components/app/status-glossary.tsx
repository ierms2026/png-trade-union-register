"use client";

import { type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// =============================================================================
// StatusGlossary — reusable definition-list component for any status config.
//
// Driven by the status config objects in vocabulary.ts / status-config.ts
// (single source of truth for all status labels + definitions). Renders a
// clean definition list: icon + label on the left, definition on the right.
//
// Used by:
//   - The public portal's "What do these terms mean?" section
//   - The staff help/guide pages
//   - Could be reused in a future "Glossary" view
//
// WHY A SHARED COMPONENT:
//   The same status definitions appear in multiple places (dashboard tooltips,
//   compliance legend, public glossary, staff guides). Before this component,
//   each place re-implemented the rendering. Now they all call StatusGlossary
//   with the relevant config — one rendering, one place to update the styling.
// =============================================================================

export interface GlossaryEntry {
  label: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon/badge tint. */
  tone?: string;
  /** Plain-language definition. */
  definition: string;
  /** Optional one-line plain-language summary (used by the public glossary). */
  plainLanguage?: string;
}

interface StatusGlossaryProps {
  entries: GlossaryEntry[];
  /** Optional heading for the glossary card. */
  title?: string;
  /** Optional description shown under the title. */
  description?: string;
  /** Whether to show the plainLanguage summary (default: false — definition only). */
  showPlainLanguage?: boolean;
}

export function StatusGlossary({
  entries,
  title,
  description,
  showPlainLanguage = false,
}: StatusGlossaryProps) {
  return (
    <Card>
      {title && (
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        {entries.map((entry) => {
          const Icon = entry.icon;
          return (
            <div key={entry.label} className="flex items-start gap-3">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${entry.tone ?? "bg-muted text-muted-foreground"}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{entry.label}</p>
                {showPlainLanguage && entry.plainLanguage && (
                  <p className="text-sm text-foreground">{entry.plainLanguage}</p>
                )}
                <p className={`text-sm text-muted-foreground ${showPlainLanguage ? "mt-1" : ""}`}>
                  {entry.definition}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
