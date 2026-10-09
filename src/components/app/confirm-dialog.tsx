"use client";

import { useState, useCallback, useRef, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// ConfirmDialog — accessible confirmation built on AlertDialog.
//
// Gap register: U-02 (native confirm() calls).
//
// Replaces native window.confirm() with a proper ARIA alertdialog that has
// focus trapping, focus return, and Escape-to-cancel (all from Radix
// AlertDialog). Supports:
//   - Destructive styling (red confirm button)
//   - Async onConfirm (shows spinner, disables buttons during execution)
//   - Type-to-confirm mode (requireText prop — the retention disposal
//     dialog was the original use case; it now uses this component)
//   - Inline error display (stays open if onConfirm throws/returns error)
//   - Default focus on Cancel for destructive actions
//
// Usage (revoke API key):
//   <ConfirmDialog
//     open={showRevoke}
//     onOpenChange={setShowRevoke}
//     title="Revoke API Key"
//     description="This cannot be undone. Scripts using this key will stop working immediately."
//     confirmLabel="Revoke"
//     destructive
//     onConfirm={async () => { await revokeKey(id); }}
//   />
//
// Usage (type-to-confirm, e.g. document disposal):
//   <ConfirmDialog
//     open={showDispose}
//     onOpenChange={setShowDispose}
//     title="Confirm Document Disposal"
//     description="This action is irreversible. The document will be permanently marked as disposed."
//     confirmLabel="Confirm Disposal"
//     destructive
//     requireText="Constitution"
//     onConfirm={async () => { await dispose(docId); }}
//   />
// =============================================================================

interface ConfirmDialogProps {
  /** Controlled open state. */
  open: boolean;
  /** Controlled open-state setter. */
  onOpenChange: (open: boolean) => void;
  /** Dialog title (required by ARIA alertdialog). */
  title: string;
  /** Consequence description shown to the user. */
  description: string;
  /** Label for the confirm button. */
  confirmLabel?: string;
  /** Label for the cancel button. */
  cancelLabel?: string;
  /** When true, styles the confirm button as destructive (red) and focuses Cancel on open. */
  destructive?: boolean;
  /** Async confirm handler. If it throws, the dialog stays open and shows the error. */
  onConfirm: () => Promise<void> | void;
  /** When provided, the confirm button is disabled until the user types this exact text. */
  requireText?: string;
  /** Optional extra content between description and confirm/cancel (e.g. a summary card). */
  children?: ReactNode;
  /**
   * Optional ref to an element that should receive focus AFTER a successful
   * confirm (onConfirm did not throw). Used when the action removes the
   * trigger's row from the DOM (e.g. delete/revoke/approve/dispose) — the
   * trigger will be gone, so focus goes to this element instead.
   *
   * On Cancel, Escape, or click-outside, focus returns to the trigger
   * button (the row is still there). This ref is ONLY used after a
   * successful confirm.
   *
   * If not provided after a successful confirm, falls back to the trigger
   * (if still connected), then to <main>/<body>.
   */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  requireText,
  children,
  returnFocusRef,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedText, setTypedText] = useState("");
  // Track the trigger element so we can return focus to it on close.
  const triggerRef = useRef<HTMLElement | null>(null);
  // Track whether the dialog is closing because onConfirm succeeded.
  // Set to true in handleConfirm (success path), checked in onCloseAutoFocus.
  // Reset to false on open and on any non-confirm close (Cancel/Escape).
  const confirmSucceededRef = useRef(false);

  const canConfirm = !requireText || typedText === requireText;

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      // Success — mark for returnFocusRef, then close
      confirmSucceededRef.current = true;
      setLoading(false);
      setTypedText("");
      onOpenChange(false);
    } catch (err) {
      // Error — stay open, show inline error
      confirmSucceededRef.current = false;
      setLoading(false);
      setError(err instanceof Error ? err.message : "An error occurred. Please try again.");
    }
  }, [onConfirm, onOpenChange]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      // Block close while loading (Escape, click-outside, etc.)
      if (!next && loading) return;
      if (!next) {
        // Reset state on close
        setError(null);
        setTypedText("");
        setLoading(false);
      }
      onOpenChange(next);
    },
    [onOpenChange, loading],
  );

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        className="max-w-md"
        // Block Escape while loading
        onEscapeKeyDown={(e) => { if (loading) e.preventDefault(); }}
        // Capture the trigger element on open so we can return focus on close.
        // Also reset the confirm-succeeded flag.
        onOpenAutoFocus={() => {
          triggerRef.current = document.activeElement as HTMLElement;
          confirmSucceededRef.current = false;
        }}
        // Return focus on close.
        // After a SUCCESSFUL confirm: if returnFocusRef is provided, use it
        // (the trigger's row may be removed from the DOM by the action).
        // After Cancel/Escape/click-outside: return focus to the trigger
        // (the row is still there).
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (confirmSucceededRef.current && returnFocusRef?.current?.isConnected) {
            returnFocusRef.current.focus();
            return;
          }
          if (triggerRef.current && triggerRef.current.isConnected) {
            triggerRef.current.focus();
            return;
          }
          // Trigger gone (row removed) and no returnFocusRef — last resort
          if (returnFocusRef?.current?.isConnected) {
            returnFocusRef.current.focus();
            return;
          }
          const main = document.querySelector<HTMLElement>("main, [role='main'], body");
          if (main) main.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {destructive && <AlertTriangle className="h-5 w-5 text-red-500" />}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {children && <div className="space-y-4">{children}</div>}

        {requireText && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Type{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono">
                {requireText}
              </code>{" "}
              to confirm
            </p>
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={requireText}
              autoFocus
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            {typedText.length > 0 && !canConfirm && (
              <p className="text-xs text-muted-foreground">
                Text doesn&apos;t match yet. Type the exact text to enable confirmation.
              </p>
            )}
            {canConfirm && (
              <p className="text-xs text-green-600">
                ✓ Matches — you can now confirm.
              </p>
            )}
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-center gap-1 text-xs text-destructive">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <AlertDialogFooter>
          {/* Cancel: autoFocus when destructive so the safer option gets focus first */}
          <AlertDialogCancel
            autoFocus={destructive}
            disabled={loading}
          >
            {cancelLabel}
          </AlertDialogCancel>

          {/* Confirm: use AlertDialogAction but intercept onClick to prevent
              auto-close (we control close via onOpenChange after onConfirm) */}
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault(); // Prevent Radix auto-close
              if (!loading && canConfirm) handleConfirm();
            }}
            disabled={loading || !canConfirm}
            className={cn(destructive && "bg-destructive text-white hover:bg-destructive/90")}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {confirmLabel}...
              </>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
