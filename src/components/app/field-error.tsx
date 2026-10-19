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
    // Wave 4 / a11y #3: role="alert" makes screen readers announce the
    // error immediately when it appears (WCAG 3.3.1 Error Identification +
    // 4.1.3 Status Messages). Applies to every form using FieldError:
    // login, forgot-password, set-password, user-create, account-security.
    // role="alert" implies aria-live="assertive" + aria-atomic="true" per
    // the ARIA spec — no need to add them separately.
    <div role="alert" className="mt-1 flex items-center gap-1 text-xs text-destructive">
      <AlertCircle className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
      <span>{error}</span>
    </div>
  );
}
