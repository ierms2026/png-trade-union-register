"use client";

import { AlertCircle } from "lucide-react";

// =============================================================================
// FieldError — inline form validation error display.
//
// Shows a small red error message below a form field when the field's
// validation fails. Renders null when there's no error (so the form
// layout doesn't shift when errors appear/disappear — we reserve no
// space when valid).
//
// Usage:
//   <Input ... />
//   <FieldError error={errors.email} />
// =============================================================================

interface FieldErrorProps {
  error: string | null | undefined;
}

export function FieldError({ error }: FieldErrorProps) {
  if (!error) return null;
  return (
    <div className="mt-1 flex items-center gap-1 text-xs text-destructive">
      <AlertCircle className="h-3 w-3 flex-shrink-0" />
      <span>{error}</span>
    </div>
  );
}
