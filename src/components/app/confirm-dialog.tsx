"use client";

import { useState, useCallback, type ReactNode } from "react";
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
//   - Type-to-confirm mode (modeled on retention.tsx's TypeToConfirmDialog)
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
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedText, setTypedText] = useState("");

  const canConfirm = !requireText || typedText === requireText;

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      // Success — close + reset
      setLoading(false);
      setTypedText("");
      onOpenChange(false);
    } catch (err) {
      // Error — stay open, show inline error
      setLoading(false);
      setError(err instanceof Error ? err.message : "An error occurred. Please try again.");
    }
  }, [onConfirm, onOpenChange]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        // Reset state on close
        setError(null);
        setTypedText("");
        setLoading(false);
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-md">
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
