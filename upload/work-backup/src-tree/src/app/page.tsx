"use client";

import { useState, useEffect, useCallback } from "react";
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
import { RetentionView } from "@/components/app/views/retention";
import { ReviewsView } from "@/components/app/views/reviews";
import { ContactRequestsView } from "@/components/app/views/contact-requests";
import { SearchView } from "@/components/app/views/search";
import { WebhooksView } from "@/components/app/views/webhooks";
import { DocumentsView } from "@/components/app/views/documents";
import { DocumentDetailView } from "@/components/app/views/document-detail";
import { CalendarView } from "@/components/app/views/calendar";
import { AuditView } from "@/components/app/views/audit";
import { UsersView } from "@/components/app/views/users";
import { SecurityView } from "@/components/app/views/security";
import { ApiKeysView } from "@/components/app/views/api-keys";
import { LegislationView } from "@/components/app/views/legislation";
import { AccountSecurityView } from "@/components/app/views/account-security";
import { HelpGuideView } from "@/components/app/views/help-guide";
import { navigateToComplianceFilter } from "@/lib/dashboard/status-filter";
import { parseStatusParam, parseViewParam, PARAM_VIEW, PARAM_STATUS } from "@/lib/dashboard/dashboard-links";

interface AuthUser {
  id: string;
  email: string;
  role: "REGISTRAR" | "INSPECTOR" | "OFFICER" | "REPRESENTATIVE";
  assignedUnionId: string | null;
  twoFactorEnabled: boolean;
}

type Mode = "loading" | "auth" | "public" | "login";

// =============================================================================
// URL STATE — the single source of truth for which view is active + its
// URL-derived initial state.
//
// The URL is the source of truth for:
//   ?view=X          — which view to show (every view has a URL)
//   ?status=OVERDUE  — compliance filter (shareable + refresh-safe)
//   ?union=ID        — selected union in the unions view
//   ?id=ID           — document ID for the document-detail view
//   ?q=query         — search query for the search view
//
// readUrlState() is called in TWO places:
//   1. The mount effect — reads the URL on initial load (refresh / shared link)
//   2. The urlchange listener — reads the URL on Back/Forward + pushState
//
// Using the same function in both places guarantees that refresh, Back,
// Forward, + sharing all produce the same state. Before this refactor,
// the urlchange listener only read ?view= + ?id= — so Back/Forward lost
// the compliance filter + union selection.
// =============================================================================

interface UrlState {
  view: string;
  statusFilter: string | null;
  unionId: string | null;
  documentId: string | null;
  query: string | null;
}

function readUrlState(urlParams: URLSearchParams): UrlState {
  const viewParam = parseViewParam(urlParams.get(PARAM_VIEW));
  const statusParam = parseStatusParam(urlParams.get(PARAM_STATUS));
  return {
    view: viewParam ?? "dashboard",
    statusFilter: statusParam,
    unionId: urlParams.get("union"),
    documentId: urlParams.get("id"),
    query: urlParams.get("q"),
  };
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [initialUnionId, setInitialUnionId] = useState<string | null>(null);
  const [initialStatusFilter, setInitialStatusFilter] = useState<string | null>(null);
  const [documentDetailId, setDocumentDetailId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  // --- Apply URL state to React state -------------------------------------
  // Called from both the mount effect + the urlchange listener. Centralizing
  // this ensures Back/Forward/Refresh all produce the same view + filter
  // state — the URL is the single source of truth.
  const applyUrlState = useCallback((urlParams: URLSearchParams) => {
    const state = readUrlState(urlParams);
    setActiveView(state.view);
    setInitialStatusFilter(state.statusFilter);
    setInitialUnionId(state.unionId);
    setDocumentDetailId(state.documentId);
  }, []);

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
        // Don't strip ?login=1 — keep it so refresh stays on the login
        // screen. The ?step= param (if present) is read by LoginForm
        // directly (lazy initializer) to start on the forgot-password step.
        if (!cancelled) setMode("login");
        return;
      }
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        const data: { user: AuthUser | null } = await res.json();
        if (cancelled) return;
        if (data.user) {
          if (data.user.role === "REPRESENTATIVE") {
            window.location.href = "/portal";
            return;
          }
          setUser(data.user);
          setMode("auth");
          // Read ALL deep-link params from the URL on mount — same function
          // as the urlchange listener, so refresh + shared links produce
          // the same state as in-app navigation.
          applyUrlState(urlParams);
        } else {
          setMode("public");
        }
      } catch {
        if (!cancelled) setMode("public");
      }
    })();
    return () => { cancelled = true; };
  }, [applyUrlState]);

  // Listen for browser back/forward + pushState. When the URL changes,
  // re-read ALL params + update state. This makes refresh, back, forward,
  // + sharing work for every view + every URL-derived param.
  useEffect(() => {
    function handleUrlChange() {
      const urlParams = new URLSearchParams(window.location.search);
      applyUrlState(urlParams);
    }

    // Monkey-patch pushState to dispatch a custom event (next/link uses
    // pushState, not popstate, for client-side navigation).
    const originalPushState = window.history.pushState.bind(window.history);
    window.history.pushState = function (...args) {
      originalPushState(...args);
      window.dispatchEvent(new Event("urlchange"));
    };

    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("urlchange", handleUrlChange);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("urlchange", handleUrlChange);
      window.history.pushState = originalPushState;
    };
  }, [applyUrlState]);

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
    return <PublicPortal onStaffLogin={() => {
      // Push /?login=1 so refresh stays on the login screen + the Back
      // button returns to the public portal.
      window.history.pushState({}, "", "/?login=1");
      setMode("login");
    }} />;
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
    return <LoginForm onBackToPortal={() => {
      // Push / (clean URL) so the Back button works + refresh lands on
      // the public portal, not the login screen.
      window.history.pushState({}, "", "/");
      setMode("public");
    }} />;
  }

  if (!user) return null;
  const currentUser = user;

  // =============================================================================
  // handleNavigate — push a new URL for the target view, then let the urlchange
  // listener apply the state. Building a FRESH URL (not mutating the current
  // one) ensures stale params from the previous view don't leak into the new
  // view's URL — e.g. navigating from /?view=audit&action=user_login to
  // compliance should produce /?view=compliance, not /?view=compliance&action=user_login.
  //
  // The params object carries view-specific data:
  //   unionId    → ?union=ID (for unions / my-union)
  //   documentId → ?id=ID    (for document-detail)
  //   query      → ?q=query  (for search)
  //   status     → ?status=X (for compliance filtered by status)
  // =============================================================================

  function handleNavigate(view: string, params?: { unionId?: string; query?: string; documentId?: string; status?: string }) {
    if (params?.unionId) setInitialUnionId(params.unionId);
    if (params?.documentId) setDocumentDetailId(params.documentId);
    if (params?.status) setInitialStatusFilter(params.status);

    // Build a fresh URL with only the relevant params for the target view.
    // This prevents stale params (e.g. audit's ?action=) from leaking into
    // other views' URLs.
    if (view === "dashboard") {
      // Dashboard uses a clean URL (no params) — the canonical "home" address.
      window.history.pushState({}, "", "/");
    } else {
      const url = new URL(window.location.origin + "/");
      url.searchParams.set(PARAM_VIEW, view);
      if (params?.status) url.searchParams.set(PARAM_STATUS, params.status);
      if (params?.unionId) url.searchParams.set("union", params.unionId);
      if (params?.documentId) url.searchParams.set("id", params.documentId);
      if (params?.query) url.searchParams.set("q", params.query);
      window.history.pushState({}, "", url.toString());
    }
    // The pushState monkey-patch dispatches `urlchange`, which triggers
    // applyUrlState — so we don't need to call setActiveView here.
    // But we DO set it directly as well, for immediate UI response before
    // the urlchange event fires (React batches both updates).
    setActiveView(view);
  }

  function handleFilterCompliance(status: string) {
    const nav = navigateToComplianceFilter(status as Parameters<typeof navigateToComplianceFilter>[0]);
    // Push ?view=compliance&status=OVERDUE to the URL — the filter is now
    // shareable + refresh-safe + Back/Forward works.
    handleNavigate(nav.view, { status: nav.filter });
  }

  function renderView() {
    switch (activeView) {
      case "dashboard": return (
        <DashboardView
          user={currentUser}
          onNavigate={handleNavigate}
          onFilterCompliance={handleFilterCompliance}
        />
      );
      // key props on UnionsView / DocumentDetailView / ComplianceView ensure
      // the view remounts when the URL changes via Back/Forward — picking up
      // the new union/document/filter from the URL-derived initial state.
      case "unions":
      case "my-union":
        return <UnionsView key={`unions-${initialUnionId ?? "none"}`} user={currentUser} initialUnionId={initialUnionId} />;
      case "documents": return <DocumentsView />;
      case "document-detail":
        return <DocumentDetailView key={`doc-${documentDetailId ?? "none"}`} documentId={documentDetailId ?? ""} />;
      case "compliance":
        return <ComplianceView key={`compliance-${initialStatusFilter ?? "all"}`} initialFilter={initialStatusFilter} />;
      case "configure-rules": return <ConfigureRulesView />;
      case "compare": return <CompareView />;
      case "tasks": return <TasksView />;
      case "reviews": return <ReviewsView />;
      case "retention": return <RetentionView user={currentUser} />;
      case "contact-requests": return <ContactRequestsView />;
      case "search": return <SearchView />;
      case "webhooks": return <WebhooksView />;
      case "calendar": return <CalendarView onNavigate={handleNavigate} />;
      case "audit": return <AuditView />;
      case "users": return <UsersView />;
      case "security": return <SecurityView />;
      case "api-keys": return <ApiKeysView />;
      case "legislation": return <LegislationView />;
      case "account-security": return <AccountSecurityView user={currentUser} />;
      case "help": return <HelpGuideView userRole={currentUser.role} onNavigate={handleNavigate} />;
      default: return (
        <DashboardView
          user={currentUser}
          onNavigate={handleNavigate}
          onFilterCompliance={handleFilterCompliance}
        />
      );
    }
  }

  return (
    <AppShell user={currentUser} activeView={activeView} onNavigate={handleNavigate}>
      {renderView()}
    </AppShell>
  );
}
