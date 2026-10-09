"use client";

import { Fragment, useState, useEffect, type ReactNode } from "react";
import {
  LayoutDashboard, Building2, CheckCircle2, Settings2, GitCompare,
  ListTodo, Calendar, ScrollText, Users, Shield, Key, Bell, LogOut, CheckCheck, Home, FileCheck,
  ChevronDown, Search,
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
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useFetch } from "@/components/app/use-fetch";
import { NotificationsSkeleton } from "@/components/app/skeletons";
import { ScrollToTop } from "@/components/app/scroll-to-top";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { GlobalSearch } from "@/components/app/global-search";
import { parseStaffLinkUrl, getRoleLabel, getNotificationTypeLabel } from "@/lib/dashboard/vocabulary";
import {
  getNavForRole,
  findDestination,
  type NavGroup,
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
  // Special-case views that aren't in the nav structure
  if (activeView === "account-security") return [{ label: "Home", view: "dashboard" }, { label: "Account Security" }];
  if (activeView === "search") return [{ label: "Home", view: "dashboard" }, { label: "Search" }];
  if (activeView === "document-detail") return [{ label: "Home", view: "dashboard" }, { label: "Documents", view: "documents" }, { label: "Document Details" }];
  // 6.3: breadcrumbs use the nav structure. The group label becomes a
  // crumb for dropdown children (e.g. Compliance > Rules); direct links
  // + the dashboard have no group crumb.
  //
  // ROLE FILTERING: we look up the group in the role-filtered nav
  // (getNavForRole), NOT in the full NAV_STRUCTURE. This prevents a user
  // from seeing a crumb for a group they don't have access to — e.g. an
  // OFFICER who lands on ?view=audit via deep link won't see "Admin" as
  // a crumb (they'd just see "Home > Audit"). The full NAV_STRUCTURE's
  // findGroupForRoute would happily return the Admin group regardless of
  // role; the role-filtered version respects the user's permissions.
  const navForRole = getNavForRole(role as StaffRole, isRetentionEnabled());
  const group = navForRole.find((g) => g.destinations.some((d) => d.route === activeView)) ?? null;
  if (!group) {
    // The active route isn't in the user's role-filtered nav. Fall back to
    // "Home > <canonical label>" using the destination's label if we can
    // find it in the full NAV_STRUCTURE; otherwise use the raw route.
    const dest = findDestination(activeView);
    return [{ label: "Home", view: "dashboard" }, { label: dest?.label ?? activeView }];
  }
  const dest = group.destinations.find((d) => d.route === activeView)!;
  const trail: Crumb[] = [{ label: "Home", view: "dashboard" }];
  // If the group has 2+ destinations (dropdown), add the group label as a
  // crumb. Direct links (1 destination) skip the group crumb (the group
  // label IS the destination label — no need to repeat).
  if (group.destinations.length > 1) {
    trail.push({ label: group.label, view: undefined });
  }
  trail.push({ label: dest.label });
  return trail;
}

interface HorizontalNavProps {
  /** The role-filtered nav structure (from getNavForRole). */
  nav: NavGroup[];
  /** The currently-active route (for aria-current + parent highlight). */
  activeView: string;
  /** SPA navigation callback. */
  onNavigate: (view: string) => void;
}

// =============================================================================
// HorizontalNav — chunk 6.3. Renders the 5 top-level nav items from
// NAV_STRUCTURE (via getNavForRole). Groups with 1 destination render as
// direct links; groups with 2+ destinations render as disclosure dropdowns
// (Radix Popover).
//
// A11Y (disclosure pattern, per 6.3 spec):
//   - Dropdown trigger: <button> with aria-expanded + aria-controls (Radix
//     Popover sets these automatically).
//   - Escape closes AND returns focus to the trigger (Radix Popover default).
//   - Click-outside closes (Radix Popover default).
//   - Menu links are normal tab stops once open (Radix Popover doesn't do
//     arrow-key nav or roving tabindex — Tab moves through the panel's
//     links normally).
//   - Visible focus throughout (Radix default + the focus-visible:ring
//     classes on the trigger + links).
//   - Arrow-key navigation within the menu: NOT implemented (Radix Popover
//     is the disclosure pattern, not the menu widget; Tab is the navigation
//     key, which is the spec's "normal tab stops once open").
//
// ACTIVE STATES:
//   - aria-current="page" on the link matching the current route.
//   - When a child of a group is active, the parent group is visually
//     highlighted (border-accent text-primary) BUT aria-current stays on
//     the child only (per spec).
//   - For direct links (1-destination groups), the group IS the destination;
//     aria-current goes on the group's button.
//
// FIT: the nav fits its container at 1280px with no horizontal scroll.
// The `overflow-x-auto` is REMOVED (replaced with `flex-wrap` as a
// graceful fallback for narrow widths — at 1280px the 5 top-level items
// fit on one row; below that they wrap to a second row rather than
// scrolling).
// =============================================================================

function HorizontalNav({ nav, activeView, onNavigate }: HorizontalNavProps) {
  return (
    <nav className="flex items-center flex-wrap gap-1 px-4 lg:px-6">
      {nav.map((group) => {
        // A group is a "direct link" if it has exactly 1 destination.
        // Otherwise it's a dropdown.
        const isDirectLink = group.destinations.length === 1;
        // Check if any child of this group is the active route (for parent
        // highlight). aria-current stays on the child only.
        const hasActiveChild = group.destinations.some((d) => d.route === activeView);

        if (isDirectLink) {
          const dest = group.destinations[0];
          const Icon = dest.icon;
          const active = activeView === dest.route;
          return (
            <button
              key={group.label}
              onClick={() => onNavigate(dest.route)}
              title={dest.label}
              aria-current={active ? "page" : undefined}
              className={`flex flex-shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                active
                  ? "border-accent text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">{dest.label}</span>
            </button>
          );
        }

        // Dropdown group: Radix Popover (disclosure pattern).
        return (
          <NavDropdown
            key={group.label}
            group={group}
            activeView={activeView}
            onNavigate={onNavigate}
            hasActiveChild={hasActiveChild}
          />
        );
      })}
    </nav>
  );
}

// =============================================================================
// NavDropdown — a single disclosure-pattern dropdown for a NavGroup with
// 2+ destinations. Uses Radix Popover (the disclosure primitive, not the
// menu widget). The trigger is a <button>; the panel is a container with
// the destination links as normal tab stops.
// =============================================================================

interface NavDropdownProps {
  group: NavGroup;
  activeView: string;
  onNavigate: (view: string) => void;
  /** Whether any child of this group is the active route (for parent highlight). */
  hasActiveChild: boolean;
}

function NavDropdown({ group, activeView, onNavigate, hasActiveChild }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const GroupIcon = group.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={group.label}
          // Radix Popover sets aria-expanded + aria-controls automatically
          // on the trigger. The `data-state` attribute reflects open/closed.
          className={`flex flex-shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            hasActiveChild
              ? "border-accent text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        >
          <GroupIcon className="h-4 w-4 flex-shrink-0" />
          <span className="hidden sm:inline">{group.label}</span>
          <ChevronDown
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-56 p-1"
      >
        <nav aria-label={group.label}>
          <ul className="space-y-0.5">
            {group.destinations.map((dest) => {
              const Icon = dest.icon;
              const active = activeView === dest.route;
              return (
                <li key={dest.route}>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate(dest.route);
                      setOpen(false); // close the dropdown on navigation
                    }}
                    aria-current={active ? "page" : undefined}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                      active
                        ? "bg-accent/10 text-primary font-medium"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span>{dest.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </PopoverContent>
    </Popover>
  );
}

interface AppShellProps { user: AuthUser; activeView: string; onNavigate: (view: string, params?: { unionId?: string; query?: string; documentId?: string }) => void; children: ReactNode; }

export function AppShell({ user, activeView, onNavigate, children }: AppShellProps) {
  // The Representative role was removed (D7) — every authenticated user is
  // staff (REGISTRAR / INSPECTOR / OFFICER), so the cast to StaffRole is safe.
  const nav = getNavForRole(user.role as StaffRole, isRetentionEnabled());
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
        // Use the audience-aware staff parser — only honors /?view=X,
        // ignores /portal?view=X. This prevents a portal link from
        // silently landing on the Dashboard (the staff app has no
        // "contact" view, so onNavigate("contact") would fall through).
        const view = parseStaffLinkUrl(linkUrl);
        if (view) onNavigate(view);
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
              <span className="hidden lg:inline">Search documents...</span>
              <kbd className="ml-1 hidden rounded border bg-muted px-1 py-0.5 text-[10px] font-sans lg:inline">⌘K</kbd>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(true)}
              className="sm:hidden"
              title="Search (Cmd+K)"
            >
              <Search className="h-5 w-5" />
              <span className="sr-only">Search</span>
            </Button>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
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
                <DropdownMenuItem onClick={() => onNavigate("account-security")}><Shield className="mr-2 h-4 w-4" />Account Security</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="h-1.5 bg-accent" />
      </header>

      <div className="sticky top-[3.5rem] z-20 border-b bg-card">
        <div className="mx-auto max-w-7xl"><HorizontalNav nav={nav} activeView={activeView} onNavigate={onNavigate} /></div>
      </div>

      <div className="border-b bg-background">
        <div className="mx-auto max-w-7xl px-4 py-2 lg:px-6">
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
