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
import { UsersView } from "@/components/app/views/users";
import { SecurityView } from "@/components/app/views/security";
import { ApiKeysView } from "@/components/app/views/api-keys";
import { AccountSecurityView } from "@/components/app/views/account-security";

interface AuthUser {
  id: string;
  email: string;
  role: "REGISTRAR" | "INSPECTOR" | "OFFICER";
  assignedUnionId: string | null;
  twoFactorEnabled: boolean;
}

type Mode = "loading" | "auth" | "public" | "login";

export default function Home() {
  const [mode, setMode] = useState<Mode>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [initialUnionId, setInitialUnionId] = useState<string | null>(null);
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
        window.history.replaceState({}, "", "/");
        if (!cancelled) setMode("login");
        return;
      }
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        const data: { user: AuthUser | null } = await res.json();
        if (cancelled) return;
        if (data.user) {
          setUser(data.user);
          setMode("auth");
          const unionId = urlParams.get("union");
          if (unionId) {
            setActiveView("unions");
            setInitialUnionId(unionId);
            window.history.replaceState({}, "", "/");
          }
        } else {
          setMode("public");
        }
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
      <SetPasswordForm token={resetToken} onSuccess={() => {
        setResetToken(null);
        window.history.replaceState({}, "", "/");
        window.location.href = "/";
      }} />
    );
  }

  if (mode === "login") {
    return <LoginForm onBackToPortal={() => setMode("public")} />;
  }

  if (!user) return null;
  const currentUser = user;

  function renderView() {
    switch (activeView) {
      case "dashboard": return <DashboardView />;
      case "unions":
      case "my-union": return <UnionsView user={currentUser} initialUnionId={initialUnionId} />;
      case "compliance": return <ComplianceView />;
      case "configure-rules": return <ConfigureRulesView />;
      case "compare": return <CompareView />;
      case "tasks": return <TasksView />;
      case "calendar": return <CalendarView />;
      case "audit": return <AuditView />;
      case "users": return <UsersView />;
      case "security": return <SecurityView />;
      case "api-keys": return <ApiKeysView />;
      case "account-security": return <AccountSecurityView user={currentUser} />;
      default: return <DashboardView />;
    }
  }

  return (
    <AppShell user={currentUser} activeView={activeView} onNavigate={setActiveView}>
      {renderView()}
    </AppShell>
  );
}
