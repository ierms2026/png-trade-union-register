"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { LoginForm } from "@/components/app/login-form";
import { SetPasswordForm } from "@/components/app/set-password-form";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalDashboardView } from "@/components/portal/views/dashboard";
import { PortalDocumentsView } from "@/components/portal/views/documents";
import { PortalComplianceView } from "@/components/portal/views/compliance";
import { PortalTasksView } from "@/components/portal/views/tasks";
import { PortalContactView } from "@/components/portal/views/contact";
import { AccountSecurityView } from "@/components/app/views/account-security";
import { PublicPortal } from "@/components/app/public-portal";

// =============================================================================
// /portal — chunk 5 (Union self-service portal)
//
// Single-page app with view-switching, mirroring the staff / route. Reps
// land here after login (page.tsx redirects REPRESENTATIVE users to /portal).
//
// Auth model:
//   1. On mount, hit /api/auth/me.
//   2. If unauthenticated → show PublicPortal (same as staff /).
//   3. If authenticated but role !== REPRESENTATIVE → bounce to / (staff).
//      This prevents Officers/Registrars from using the rep portal.
//   4. If authenticated REPRESENTATIVE → load the PortalShell + views.
//   5. If a ?token= param exists → show SetPasswordForm (password-reset
//      flow — same as staff).
//
// The rep's assigned union is loaded via /api/portal/me (which returns the
// union info along with the user). The PortalShell uses this for the header
// badge.
// =============================================================================

interface PortalUser {
  id: string;
  email: string;
  role: "REGISTRAR" | "INSPECTOR" | "OFFICER";
  assignedUnionId: string | null;
  twoFactorEnabled: boolean;
}

// Narrowed type for the rep-only views. The page guarantees `user.role ===
// "REPRESENTATIVE"` before rendering any view (non-reps are bounced to `/`),
// so this cast is safe.
interface RepUser {
  id: string;
  email: string;
  role: "REPRESENTATIVE";
  assignedUnionId: string | null;
  twoFactorEnabled: boolean;
}

interface UnionInfo {
  id: string;
  unionName: string;
  registrationNo: string;
  status: string;
}

type Mode = "loading" | "auth" | "public" | "login";

export default function PortalPage() {
  const [mode, setMode] = useState<Mode>("loading");
  const [user, setUser] = useState<PortalUser | null>(null);
  const [union, setUnion] = useState<UnionInfo | null>(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [resetToken, setResetToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("token");
      if (token) {
        if (!cancelled) { setResetToken(token); setMode("login"); }
        return;
      }
      const wantLogin = urlParams.get("login") === "1";
      if (wantLogin) {
        window.history.replaceState({}, "", "/portal");
        if (!cancelled) setMode("login");
        return;
      }
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        const data: { user: PortalUser | null } = await res.json();
        if (cancelled) return;
        if (!data.user) {
          setMode("public");
          return;
        }
        // The Representative role has been removed (D7). All authenticated
        // users are bounced to the staff app — the portal is no longer
        // accessible to any role.
        window.location.href = "/";
        return;
      } catch {
        if (!cancelled) setMode("public");
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  if (mode === "public") {
    return <PublicPortal onStaffLogin={() => setMode("login")} />;
  }

  if (resetToken) {
    return (
      <SetPasswordForm
        token={resetToken}
        onSuccess={() => {
          setResetToken(null);
          window.history.replaceState({}, "", "/portal");
          window.location.href = "/portal";
        }}
      />
    );
  }

  if (mode === "login") {
    return <LoginForm onBackToPortal={() => setMode("public")} />;
  }

  if (!user) return null;
  // At this point we've verified user.role === "REPRESENTATIVE" in the
  // useEffect (non-reps are bounced to "/"). Cast to the narrower RepUser
  // type for the view components.
  const currentUser = user as unknown as RepUser;

  function renderView() {
    switch (activeView) {
      case "dashboard":
        return <PortalDashboardView user={currentUser} onNavigate={setActiveView} />;
      case "documents":
        return <PortalDocumentsView user={currentUser} />;
      case "compliance":
        return <PortalComplianceView />;
      case "tasks":
        return <PortalTasksView />;
      case "contact":
        return <PortalContactView user={currentUser} />;
      case "account-security":
        return <AccountSecurityView user={currentUser as unknown as { id: string; email: string; role: "REGISTRAR" | "INSPECTOR" | "OFFICER"; assignedUnionId: string | null; twoFactorEnabled: boolean }} />;
      default:
        return <PortalDashboardView user={currentUser} onNavigate={setActiveView} />;
    }
  }

  return (
    <PortalShell
      user={currentUser}
      union={union}
      activeView={activeView}
      onNavigate={setActiveView}
    >
      {renderView()}
    </PortalShell>
  );
}
