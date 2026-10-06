"use client";

import { forwardRef, type ReactNode, type MouseEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

// =============================================================================
// ClickableRow / ClickableCard — accessible clickable container.
//
// Replaces <div onClick> patterns (union list rows, calendar day cells,
// document tiles) with a real <button> or <a> element that is natively
// keyboard-focusable and operable (Enter/Space activation is built in).
//
// Gap register: U-03 (union rows), U-04 (calendar days).
//
// LIMITATION: content inside must not nest interactive elements (buttons,
// links). Nesting interactive elements inside a <button> is invalid HTML.
// For rows that contain their own action buttons, use a "stretched-link"
// pattern instead: render the row as a plain <div>, place an <a> with
// `class="absolute inset-0"` as the first child (covers the whole row),
// and place action buttons with `class="relative z-10"` so they sit above
// the stretched link and receive clicks first.
//
// Usage (union list row):
//   <ClickableRow
//     onClick={() => setSelectedUnionId(u.id)}
//     className="grid grid-cols-[1fr_140px_100px_120px_24px] ..."
//     aria-label={`View ${u.unionName}`}
//   >
//     <div className="min-w-0">
//       <p className="truncate font-medium">{u.unionName}</p>
//     </div>
//     <StatusBadge status={u.status} />
//   </ClickableRow>
//
// Usage (with href — renders an <a>):
//   <ClickableRow href={`/unions/${u.id}`} className="...">
//     {children}
//   </ClickableRow>
// =============================================================================

interface ClickableRowProps {
  /** Children — must not contain interactive elements (button, a, etc.). */
  children: ReactNode;
  /** Click handler. Required when no `href` is provided. */
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  /** When provided, renders an <a> instead of a <button>. */
  href?: string;
  /** Accessible label. Required when the row content is not self-describing. */
  "aria-label"?: string;
  /** Whether the element is disabled (button only). */
  disabled?: boolean;
  /** Additional classes (merged with defaults). */
  className?: string;
  /** Type attribute (button only, defaults to "button"). */
  type?: "button" | "submit" | "reset";
}

export const ClickableRow = forwardRef<HTMLButtonElement | HTMLAnchorElement, ClickableRowProps>(
  function ClickableRow(
    { children, onClick, href, disabled, className, type = "button", ...rest },
    ref,
  ) {
    // Shared classes: full-width, left-aligned, focus-visible ring matching
    // the design system's button focus style (3px ring, ring-ring color).
    const baseClasses = cn(
      "block w-full text-left transition-colors",
      "focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
      "disabled:pointer-events-none disabled:opacity-50",
      className,
    );

    if (href) {
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={disabled ? undefined : href}
          onClick={disabled ? undefined : onClick}
          className={baseClasses}
          aria-disabled={disabled || undefined}
          {...rest}
        >
          {children}
        </a>
      );
    }

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={baseClasses}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
