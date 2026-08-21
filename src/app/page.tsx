"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { LoginForm } from "@/components/app/login-form";
import { AppShell } from "@/components/app/app-shell";
import { PublicPortal } from "@/components/app/public-portal";
import { SetPasswordForm } from "@/components/app/set-password-form";
import { DashboardView } from "@/components/app/views/dashboard";
import { ComplianceView } from "@/components/app/views/compliance";
import { ConfigureRulesView } from "@/components/app/views/configure-rules";
import { CompareView } from "@/components/app/views/compare";
import { UnionsView } from "@/components/app/views/unions";
import { TasksView } from "@/components/app/views/tasks";
import { CalendarView } from "@/components/app/views/calendar";
import { AuditView } from "@/components/app/views/audit";
// Retention view removed — disposal features omitted
import { UsersView } from "@/components/app/views/users";
import { SecurityView } from "@/components/app/views/security";
import { ApiKeysView } from "@/components/app/views/api-keys";
import { AccountSecurityView } from "@/components/app/views/account-security";

// =============================================================================
// Main page entry.
//
// On mount, calls /api/auth/me to determine:
//   - If authenticated → render the AppShell with the active view.
//   - If not authenticated → render the LoginForm (or PublicPortal if
//     the user clicked "View public union registry").
//
// The active view is stored in component state (no URL routing — this
// is a single-page app at /). The AppShell's sidebar nav calls
// setActiveView to switch views.
// =============================================================================

interface AuthUser {
  id: string;
  email: string;
  role: "REGISTRAR" | "INSPECTOR" | "OFFICER";
  assignedUnionId: string | null;
  twoFactorEnabled: boolean;
}

type Mode = "loading" | "auth" | "public" | "public-login";

export default function Home() {
  const [mode, setMode] = useState<Mode>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeView, setActiveView] = useState("dashboard");

  // Check for ?token=xxx in the URL — if present, show the Set Password form
  // instead of the normal auth flow. This is how new users set their password.
  const [resetToken, setResetToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Check for password reset token in the URL
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("token");
      if (token) {
        if (!cancelled) {
          setResetToken(token);
          setMode("public-login");
        }
        return;
      }

      // Check if the user is authenticated.
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        const data: { user: AuthUser | null } = await res.json();
        if (cancelled) return;
        if (data.user) {
          setUser(data.user);
          setMode("auth");
        } else {
          setMode("public-login");
        }
      } catch {
        if (!cancelled) setMode("public-login");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Loading state — full-screen spinner while we check auth.
  if (mode === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Public portal mode — chrome-less, no auth.
  if (mode === "public") {
    return (
      <PublicPortal onBack={() => setMode("public-login")} />
    );
  }

  // Set Password mode — user has a token in the URL
  if (resetToken) {
    return (
      <SetPasswordForm
        token={resetToken}
        onSuccess={() => {
          setResetToken(null);
          // Clear the token from the URL
          window.history.replaceState({}, "", "/");
          window.location.href = "/";
        }}
      />
    );
  }

  // Not authenticated → show the login form.
  if (mode !== "auth" || !user) {
    return <LoginForm onPublicPortal={() => setMode("public")} />;
  }

  // Capture the non-null user in a local const so TypeScript narrows it
  // correctly inside `renderView()` — the closure over `user` (a state
  // variable) doesn't narrow through the early-return above, but the
  // local const does.
  const currentUser = user;

  // Authenticated → render the app shell with the active view.
  function renderView() {
    switch (activeView) {
      case "dashboard":
        return <DashboardView />;
      case "unions":
      case "my-union":
        return <UnionsView user={currentUser} />;
      case "compliance":
        return <ComplianceView />;
      case "configure-rules":
        return <ConfigureRulesView />;
      case "compare":
        return <CompareView />;
      case "tasks":
        return <TasksView />;
      case "calendar":
        return <CalendarView />;
      case "audit":
        return <AuditView />;
      // Retention view removed — disposal features omitted
      case "users":
        return <UsersView />;
      case "security":
        return <SecurityView />;
      case "api-keys":
        return <ApiKeysView />;
      case "account-security":
        return <AccountSecurityView user={currentUser} />;
      default:
        return <DashboardView />;
    }
  }

  return (
    <AppShell user={currentUser} activeView={activeView} onNavigate={setActiveView}>
      {renderView()}
    </AppShell>
  );
}
