"use client";

import { Fragment, useState, useEffect, type ReactNode } from "react";
import {
  LayoutDashboard, Building2, CheckCircle2, Settings2, GitCompare,
  ListTodo, Calendar, ScrollText, Users, Shield, Key, Bell, LogOut, CheckCheck, Home, FileCheck,
  Search, MessageSquare,
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFetch } from "@/components/app/use-fetch";
import { NotificationsSkeleton } from "@/components/app/skeletons";
import { ScrollToTop } from "@/components/app/scroll-to-top";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { GlobalSearch } from "@/components/app/global-search";
import { parseStaffLinkUrl, getRoleLabel, getNotificationTypeLabel, buildFeedbackMailto, VIEW_TITLES } from "@/lib/dashboard/vocabulary";
import {
  getNavForRole,
  getStandaloneNavItems,
  findDestination,
  type NavGroup,
  type NavDestination,
  type StaffRole,
} from "@/lib/dashboard/nav-structure";
import { isRetentionEnabled } from "@/lib/retention-flag";

interface AuthUser {
  id: string; email: string;
  role: "REGISTRAR" | "INSPECTOR" | "OFFICER";
  assignedUnionId: string | null; twoFactorEnabled: boolean;
}
interface Notification { id: string; type: string; title: string; body: string; linkUrl: string | null; createdAt: string; }

// NavItem is now defined in nav-structure.ts (NavGroup + NavDestination).
// The local NavItem interface is removed; the nav component uses the
// config-driven types directly.

interface Crumb { label: string; view?: string }

function buildBreadcrumbs(activeView: string, role: AuthUser["role"]): Crumb[] {
  // IA-1: special-case views not in the nav structure. Use the canonical
  // labels from VIEW_TITLES (vocabulary.ts) so headings + breadcrumbs match.
  if (activeView === "account-security") return [{ label: "Home", view: "dashboard" }, { label: VIEW_TITLES["account-security"] }];
  if (activeView === "document-detail") return [{ label: "Home", view: "dashboard" }, { label: "Documents", view: "documents" }, { label: "Document Details" }];
  // IA-1: breadcrumbs use the sidebar nav structure. The group heading
  // becomes a crumb when the group has 2+ destinations (so the user can
  // see which section they're in). Single-destination groups skip the
  // group crumb (the group label IS the destination label).
  //
  // ROLE FILTERING: we look up the group in the role-filtered nav
  // (getNavForRole), NOT in the full NAV_STRUCTURE. This prevents a user
  // from seeing a crumb for a group they don't have access to.
  const navForRole = getNavForRole(role as StaffRole, isRetentionEnabled());
  const group = navForRole.find((g) => g.destinations.some((d) => d.route === activeView)) ?? null;
  if (!group) {
    // The active route isn't in the user's role-filtered nav. Fall back to
    // "Home > <canonical label>" using findDestination (searches groups +
    // standalone items).
    const dest = findDestination(activeView);
    return [{ label: "Home", view: "dashboard" }, { label: dest?.label ?? activeView }];
  }
  const dest = group.destinations.find((d) => d.route === activeView)!;
  const trail: Crumb[] = [{ label: "Home", view: "dashboard" }];
  // If the group has 2+ destinations, add the group label as a crumb.
  if (group.destinations.length > 1) {
    trail.push({ label: group.label, view: undefined });
  }
  trail.push({ label: dest.label });
  return trail;
}

interface SidebarNavProps {
  /** The role-filtered nav structure (from getNavForRole). */
  nav: NavGroup[];
  /** Standalone items (Help, etc.) — rendered at the bottom. */
  standalone: NavDestination[];
  /** The currently-active route (for aria-current). */
  activeView: string;
  /** SPA navigation callback. */
  onNavigate: (view: string) => void;
}

// =============================================================================
// SidebarNav — IA-1. Renders the nav as a left sidebar with group headings.
//
// Each group's `label` is rendered as a section heading (uppercase, muted,
// small text). Destinations are rendered as full-width buttons below their
// heading. Empty groups (zero role-accessible destinations) are already
// filtered out by getNavForRole — the sidebar never receives them.
//
// A11Y:
//   - The sidebar is a <nav aria-label="Main navigation">.
//   - Each group heading is an <h3> (semantic heading for screen readers).
//   - Destination buttons use aria-current="page" when active.
//   - Keyboard: Tab moves through items in DOM order (no arrow-key nav —
//     the sidebar is a list of links, not a menu widget).
//
// LAYOUT: fixed-width (w-60 / 240px) on lg+ screens. Hidden on mobile
// (below lg) — the mobile nav is the Cmd+K palette + the user menu.
// =============================================================================

function SidebarNav({ nav, standalone, activeView, onNavigate }: SidebarNavProps) {
  return (
    <nav aria-label="Main navigation" className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {nav.map((group) => (
          <div key={group.label} className="mb-4">
            {/* Group heading — rendered for every visible group, even
                single-destination ones. IA-1 requirement: "Render group
                headings; hide empty groups." */}
            <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h3>
            <ul className="space-y-0.5">
              {group.destinations.map((dest) => {
                const Icon = dest.icon;
                const active = activeView === dest.route;
                return (
                  <li key={dest.route}>
                    <button
                      type="button"
                      onClick={() => onNavigate(dest.route)}
                      aria-current={active ? "page" : undefined}
                      title={dest.label}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                        active
                          ? "bg-accent/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{dest.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Standalone items (Help & Guide) — rendered at the bottom,
            without a group heading. */}
        {standalone.length > 0 && (
          <div className="mt-auto border-t pt-2">
            <ul className="space-y-0.5">
              {standalone.map((dest) => {
                const Icon = dest.icon;
                const active = activeView === dest.route;
                return (
                  <li key={dest.route}>
                    <button
                      type="button"
                      onClick={() => onNavigate(dest.route)}
                      aria-current={active ? "page" : undefined}
                      title={dest.label}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                        active
                          ? "bg-accent/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{dest.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </nav>
  );
}

interface AppShellProps { user: AuthUser; activeView: string; onNavigate: (view: string, params?: { unionId?: string; query?: string; documentId?: string; status?: string; tab?: string; unionTab?: string }) => void; children: ReactNode; }

export function AppShell({ user, activeView, onNavigate, children }: AppShellProps) {
  // The Representative role was removed (D7) — every authenticated user is
  // staff (REGISTRAR / INSPECTOR / OFFICER), so the cast to StaffRole is safe.
  const nav = getNavForRole(user.role as StaffRole, isRetentionEnabled());
  const standalone = getStandaloneNavItems(user.role as StaffRole);
  const crumbs = buildBreadcrumbs(activeView, user.role as StaffRole);
  const { data: notifData, loading: notifLoading, refetch: refetchNotifs } = useFetch<{ notifications: Notification[]; unreadCount: number; }>("/api/notifications");
  const notifications = notifData?.notifications ?? [];
  const unreadCount = notifData?.unreadCount ?? 0;

  // Chunk 6: Cmd+K / Ctrl+K opens the global search palette.
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function markAsRead(id: string, linkUrl: string | null) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" });
      refetchNotifs();
      if (linkUrl) {
        // IA-2: parse the full URL to extract union + unionTab params for
        // deep-linking into the Union Hub. The audience-aware parser
        // (parseStaffLinkUrl) extracts the view; we extract the rest here.
        const view = parseStaffLinkUrl(linkUrl);
        if (view) {
          // Extract additional params from the linkUrl.
          let unionId: string | undefined;
          let unionTab: string | undefined;
          let status: string | undefined;
          try {
            const url = new URL(linkUrl, window.location.origin);
            unionId = url.searchParams.get("union") ?? undefined;
            unionTab = url.searchParams.get("unionTab") ?? undefined;
            status = url.searchParams.get("status") ?? undefined;
          } catch { /* not a valid URL — just navigate to the view */ }
          onNavigate(view, { unionId, unionTab, status });
        }
      }
    } catch { toast.error("Failed to mark notification as read."); }
  }
  async function markAllRead() {
    for (const n of notifications) await fetch(`/api/notifications/${n.id}/read`, { method: "PATCH", credentials: "include" });
    refetchNotifs();
    toast.success("All notifications marked as read.");
  }
  async function handleLogout() {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
    window.location.href = "/";
  }

  // STEP 7 (feedback path): "Give feedback" opens the user's email client
  // with the current page URL + their role pre-filled. The mailto: URL is
  // built at click time (not render time) so it always reflects the page
  // the user is actually on when they click. The email address itself
  // lives in FEEDBACK_EMAIL (vocabulary.ts) — one place to change it.
  function handleFeedback() {
    const currentUrl = typeof window !== "undefined" ? window.location.href : "";
    const roleLabel = getRoleLabel(user.role);
    const mailto = buildFeedbackMailto(currentUrl, roleLabel);
    window.location.href = mailto;
  }

  // Group notifications by date category for scannability.
  // Returns an ordered array of { label, items } groups.
  function groupNotifications(notifs: Notification[]): Array<{ label: string; items: Notification[] }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    const groups: Record<string, Notification[]> = {
      Today: [],
      Yesterday: [],
      "This Week": [],
      Earlier: [],
    };

    for (const n of notifs) {
      const d = new Date(n.createdAt);
      if (d >= today) groups.Today.push(n);
      else if (d >= yesterday) groups.Yesterday.push(n);
      else if (d >= weekAgo) groups["This Week"].push(n);
      else groups.Earlier.push(n);
    }

    return Object.entries(groups)
      .filter(([, items]) => items.length > 0)
      .map(([label, items]) => ({ label, items }));
  }

  const groupedNotifications = groupNotifications(notifications);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Image src="/coat-of-arms.png" alt="National Emblem of Papua New Guinea" width={28} height={23} className="h-7 w-auto" />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold leading-tight">Register of Trade Unions</p>
              <p className="text-xs text-muted-foreground">Staff Portal · Industrial Registrar</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden text-xs md:inline-flex">{getRoleLabel(user.role)}</Badge>
            {/* Chunk 6: search button — opens the Cmd+K palette. Also opens on Cmd+K/Ctrl+K. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearchOpen(true)}
              className="hidden h-8 gap-2 px-2 text-xs text-muted-foreground sm:flex"
              title="Search (Cmd+K)"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Search...</span>
              <kbd className="ml-1 hidden rounded border bg-muted px-1 py-0.5 text-[10px] font-sans lg:inline">⌘K</kbd>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(true)}
              className="h-11 w-11 sm:hidden"
              title="Search (Cmd+K)"
            >
              <Search className="h-5 w-5" />
              <span className="sr-only">Search</span>
            </Button>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-11 w-11">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                  <span className="sr-only">Notifications</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-sm font-semibold">Notifications</span>
                  {unreadCount > 0 && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}><CheckCheck className="mr-1 h-3 w-3" />Mark all read</Button>}
                </div>
                <DropdownMenuSeparator />
                {notifLoading ? <div className="p-2"><NotificationsSkeleton /></div>
                : notifications.length === 0 ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">No unread notifications.</div>
                : <div className="max-h-96 overflow-y-auto">
                  {groupedNotifications.map((group) => (
                    <div key={group.label}>
                      <div className="sticky top-0 bg-card px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
                        {group.label}
                      </div>
                      {group.items.map((n) => (
                        <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-1 p-3" onClick={() => markAsRead(n.id, n.linkUrl)}>
                          <div className="flex w-full items-center gap-2">
                            <span className="text-xs font-medium uppercase text-muted-foreground">{getNotificationTypeLabel(n.type)}</span>
                            <span className="ml-auto text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-sm font-medium leading-tight">{n.title}</p>
                          <p className="text-xs text-muted-foreground">{n.body}</p>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ))}
                </div>}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{user.email.charAt(0).toUpperCase()}</div>
                  <span className="hidden text-sm font-medium md:inline">{user.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel><div className="flex flex-col"><span className="text-sm font-medium">{user.email}</span><span className="text-xs text-muted-foreground">{getRoleLabel(user.role)}{user.twoFactorEnabled && " · 2FA on"}</span></div></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onNavigate("account-security")}><Shield className="mr-2 h-4 w-4" />My sign-in & 2FA</DropdownMenuItem>
                <DropdownMenuItem onClick={handleFeedback}><MessageSquare className="mr-2 h-4 w-4" />Give feedback</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="h-1.5 bg-accent" />
      </header>

      {/* IA-1: sidebar layout. The sidebar is hidden on mobile (below lg).
          On mobile, nav is via Cmd+K palette + the user menu. */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-60 shrink-0 border-r bg-card lg:block">
          <SidebarNav nav={nav} standalone={standalone} activeView={activeView} onNavigate={onNavigate} />
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b bg-background">
            <div className="px-4 py-2 lg:px-6">
              <Breadcrumb><BreadcrumbList>
                {crumbs.map((crumb, i) => {
                  const isLast = i === crumbs.length - 1;
                  const isHome = crumb.label === "Home";
                  const content = isHome ? <Home className="h-3.5 w-3.5" /> : crumb.label;
                  return (<Fragment key={`${crumb.label}-${i}`}>
                    <BreadcrumbItem>{isLast || !crumb.view ? <BreadcrumbPage>{content}</BreadcrumbPage> : <BreadcrumbLink onClick={() => crumb.view && onNavigate(crumb.view)} className="cursor-pointer">{content}</BreadcrumbLink>}</BreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator />}
                  </Fragment>);
                })}
              </BreadcrumbList></Breadcrumb>
            </div>
          </div>

          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl p-4 lg:p-6">{children}</div>
          </main>
        </div>
      </div>

      <ScrollToTop />

      {/* Chunk 6: global search palette (Cmd+K) */}
      <GlobalSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onNavigate={(view, params) => onNavigate(view, params)}
        userRole={user.role}
      />
    </div>
  );
}
