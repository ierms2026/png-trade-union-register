"use client";

import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, type UserRole } from "@/lib/dashboard/vocabulary";

// =============================================================================
// WelcomePanel — shown on the dashboard the first time a user logs in per
// role. 3-4 lines on what they can do here, with a dismiss button.
//
// DISMISS BEHAVIOUR:
//   The dismissed state is stored in localStorage, keyed per role:
//     `welcome-panel.dismissed.<ROLE>`
//   So if an Officer dismisses the panel, they won't see it again on
//   future logins — but if their role changes (e.g. they become an
//   Inspector), they'll see the Inspector welcome once.
//
//   The dismissal is per-browser (localStorage), not per-account on the
//   server. This is intentional — onboarding is a UI concern, not a
//   data concern. The server doesn't need to know who dismissed the
//   welcome panel.
//
// SERVER-SIDE SAFETY:
//   The component reads localStorage in useEffect (after mount), so it
//   renders consistently on the server (always shows) and then hides
//   itself on the client if previously dismissed. This avoids the
//   "flash of hidden content" hydration mismatch — the panel appears
//   briefly, then disappears if dismissed. Acceptable for a dismissible
//   onboarding panel (it's not a layout shift that breaks interaction).
//
// ROLE CONTENT:
//   The 3-4 line summary for each role is defined below in ROLE_WELCOME.
//   It mirrors the role summaries in help-guide.tsx but is shorter (3-4
//   lines, not a full guide). The full guide is one click away on the
//   Help & Guide view.
// =============================================================================

interface RoleWelcome {
  /** 3-4 line summary of what this role can do here. */
  lines: string[];
}

const ROLE_WELCOME: Record<UserRole, RoleWelcome> = {
  REGISTRAR: {
    lines: [
      "You are the system administrator. You can register and deregister unions, review and approve documents, configure compliance rules, and manage users.",
      "Start at the Review Queue to approve documents unions have uploaded — only approved documents count toward compliance.",
      "Use the Compliance view to see which unions are compliant, expiring, overdue, or missing documents across the whole register.",
      "Visit Help & Guide (top right) for a full walkthrough, or click any '?' next to a status badge for a plain-language definition.",
    ],
  },
  INSPECTOR: {
    lines: [
      "You oversee compliance across all unions. You can view everything the Registrar sees, but you cannot make changes — no approvals, no rule changes, no disposals.",
      "Start at the Compliance view to see which unions are compliant, expiring, overdue, or missing documents.",
      "Use the Audit view to browse the system's history (who did what, when, and what changed).",
      "Visit Help & Guide (top right) for a full walkthrough, or click any '?' next to a status badge for a plain-language definition.",
    ],
  },
  OFFICER: {
    lines: [
      `You are assigned to one specific union. You can file documents for your union and view your union's compliance status.`,
      "Start at My Union to see your union's compliance matrix and which documents are missing, expiring, or overdue.",
      "Use Documents to upload a new document (e.g. a renewed Financial Return). Uploaded documents go to the Registrar for approval.",
      "Visit Help & Guide (top right) for a full walkthrough, or click any '?' next to a status badge for a plain-language definition.",
    ],
  },
};

interface WelcomePanelProps {
  /** The current user's role. */
  role: UserRole;
  /** Optional callback when the user dismisses the panel (for analytics). */
  onDismiss?: () => void;
}

function localStorageKey(role: UserRole): string {
  return `welcome-panel.dismissed.${role}`;
}

export function WelcomePanel({ role, onDismiss }: WelcomePanelProps) {
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Read localStorage AFTER mount to avoid hydration mismatch.
  // The panel renders on first paint (server + client match), then
  // hides itself on the client if previously dismissed.
  useEffect(() => {
    setMounted(true);
    try {
      const stored = window.localStorage.getItem(localStorageKey(role));
      if (stored === "true") {
        setDismissed(true);
      }
    } catch {
      // localStorage may be unavailable (private browsing, disabled).
      // Fail open — show the panel.
    }
  }, [role]);

  function handleDismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(localStorageKey(role), "true");
    } catch {
      // Same as above — fail silently.
    }
    onDismiss?.();
  }

  // After mount, if dismissed, render nothing.
  if (mounted && dismissed) return null;

  const welcome = ROLE_WELCOME[role];
  if (!welcome) return null;

  return (
    <Card
      data-testid="welcome-panel"
      className="border-primary/30 bg-primary/5"
    >
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">
              Welcome, {ROLE_LABELS[role]}
            </h2>
            <ul className="mt-2 space-y-1.5">
              {welcome.lines.map((line, i) => (
                <li
                  key={i}
                  className="text-xs leading-relaxed text-muted-foreground"
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={handleDismiss}
            aria-label="Dismiss welcome panel"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
