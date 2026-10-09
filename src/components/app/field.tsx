"use client";

import { useId, type ReactNode, type Ref } from "react";
import { AlertCircle } from "lucide-react";

// =============================================================================
// Field — accessible form field wrapper with programmatic error association.
//
// Gap register: U-14 (no aria-describedby), U-15 (no aria-invalid).
//
// Extends the existing FieldError pattern (field-error.tsx) by:
//   1. Generating a stable id via useId() for the error element
//   2. Providing aria-invalid + aria-describedby values for the input
//   3. Rendering the error with role="alert" (announced immediately on
//      appearance — better than aria-live="polite" for validation errors
//      that need to interrupt the user)
//
// WHY EXTEND INSTEAD OF REPLACE:
//   FieldError is used in 5 existing call sites (login, user create,
//   set-password, forgot-password, 2FA disable). Replacing it would break
//   those call sites. Instead, FieldError stays unchanged for backward
//   compat, and Field is a new wrapper that provides the aria wiring.
//   Existing call sites can migrate to Field when they get other changes;
//   new forms should use Field from the start.
//
// Usage (task create form's title field):
//   const [titleError, setTitleError] = useState<string | null>(null);
//   <Field error={titleError}>
//     {({ ariaProps }) => (
//       <Input
//         id="task-title"
//         {...ariaProps}
//         value={title}
//         onChange={(e) => setTitle(e.target.value)}
//       />
//     )}
//   </Field>
//
// The render prop receives `{ ariaProps }` which contains:
//   - aria-invalid="true" (only when error is present)
//   - aria-describedby pointing at the error element id (only when error is present)
//
// FOCUS FIRST INVALID HELPER:
//   import { focusFirstInvalid } from "@/components/app/field";
//   focusFirstInvalid(formRef);
//   // Focuses the first [aria-invalid="true"] element inside the form.
// =============================================================================

export interface FieldAriaProps {
  "aria-invalid"?: "true";
  "aria-describedby"?: string;
}

interface FieldProps {
  /** Validation error message. When null/undefined, no error is rendered. */
  error?: string | null;
  /** Optional hint text shown below the field (always visible, not an error). */
  hint?: string;
  /** Children rendered via render prop receiving aria props for the input. */
  children: (props: { ariaProps: FieldAriaProps }) => ReactNode;
  /** Additional className for the wrapper div. */
  className?: string;
}

export function Field({ error, hint, children, className }: FieldProps) {
  const errorId = useId();
  const hintId = useId();

  // Build aria-describedby: point at error (if present) + hint (if present)
  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(" ") || undefined;

  const ariaProps: FieldAriaProps = {};
  if (error) {
    ariaProps["aria-invalid"] = "true";
    ariaProps["aria-describedby"] = describedBy;
  }

  return (
    <div className={className}>
      {children({ ariaProps })}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <div
          id={errorId}
          role="alert"
          className="mt-1 flex items-center gap-1 text-xs text-destructive"
        >
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Focus the first invalid field inside a container element.
 * Looks for elements with aria-invalid="true" and focuses the first one.
 *
 * Usage:
 *   const formRef = useRef<HTMLFormElement>(null);
 *   // ... after validation fails:
 *   focusFirstInvalid(formRef);
 */
export function focusFirstInvalid(
  container: { current: HTMLElement | null },
): void {
  const el = container.current;
  if (!el) return;
  const invalid = el.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (invalid) {
    invalid.focus();
    invalid.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
