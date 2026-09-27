"use client";

import { Fragment, useState, type ReactNode } from "react";
import {
  LayoutDashboard, FileText, CheckCircle2, ListTodo, Contact,
  Bell, LogOut, CheckCheck, Home, ChevronDown, Shield,
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

// =============================================================================
// PortalShell — chunk 5 (Union self-service portal).
//
// Mirrors AppShell but with a rep-specific navigation + simpler header.
// Reps see: Dashboard / Documents / Compliance / Tasks / Contact Info.
// No admin/staff surfaces are linked from here — strictly separated.
//
// Visual style matches the public portal: max-w-5xl, coat-of-arms hero,
// "Union Representative Portal" subtitle (vs "Staff Portal" in AppShell).
// =============================================================================

interface PortalUser {
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

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  linkUrl: string | null;
  createdAt: string;
}

interface PortalNavDestination {
  view: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const PORTAL_NAV: PortalNavDestination[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "documents", label: "Documents", icon: FileText },
  { view: "compliance", label: "Compliance", icon: CheckCircle2 },
  { view: "tasks", label: "Tasks", icon: ListTodo },
  { view: "contact", label: "Contact Info", icon: Contact },
];

function buildBreadcrumbs(activeView: string): Array<{ label: string; view?: string }> {
  const home = { label: "Home", view: "dashboard" };
  if (activeView === "dashboard") return [home];
  const dest = PORTAL_NAV.find((d) => d.view === activeView);
  if (!dest) return [home];
  return [home, { label: dest.label }];
}

export function PortalShell({
  user,
  union,
  activeView,
  onNavigate,
  children,
}: {
  user: PortalUser;
  union: UnionInfo | null;
  activeView: string;
  onNavigate: (view: string) => void;
  children: ReactNode;
}) {
  const crumbs = buildBreadcrumbs(activeView);
  const { data: notifData, loading: notifLoading, refetch: refetchNotifs } = useFetch<{
    notifications: Notification[];
    unreadCount: number;
  }>("/api/notifications");
  const notifications = notifData?.notifications ?? [];
  const unreadCount = notifData?.unreadCount ?? 0;

  async function markAsRead(id: string, linkUrl: string | null) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" });
      refetchNotifs();
      if (linkUrl) {
        // linkUrl values from notifications are like "/portal?view=documents"
        // — extract the view param.
        const match = linkUrl.match(/[?&]view=([^&]+)/);
        if (match) onNavigate(decodeURIComponent(match[1]));
      }
    } catch {
      toast.error("Failed to mark notification as read.");
    }
  }
  async function markAllRead() {
    for (const n of notifications) {
      await fetch(`/api/notifications/${n.id}/read`, { method: "PATCH", credentials: "include" });
    }
    refetchNotifs();
    toast.success("All notifications marked as read.");
  }
  async function handleLogout() {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
    window.location.href = "/";
  }

  // Group notifications by date category (same as AppShell).
  function groupNotifications(notifs: Notification[]): Array<{ label: string; items: Notification[] }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const groups: Record<string, Notification[]> = {
      Today: [], Yesterday: [], "This Week": [], Earlier: [],
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
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Image
              src="/coat-of-arms.png"
              alt="National Emblem of Papua New Guinea"
              width={28}
              height={23}
              className="h-7 w-auto"
            />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold leading-tight">Register of Trade Unions</p>
              <p className="text-xs text-muted-foreground">
                Union Representative Portal · Industrial Registrar
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {union && (
              <Badge variant="outline" className="hidden text-xs md:inline-flex">
                {union.unionName}
              </Badge>
            )}
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
                  {unreadCount > 0 && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
                      <CheckCheck className="mr-1 h-3 w-3" />
                      Mark all read
                    </Button>
                  )}
                </div>
                <DropdownMenuSeparator />
                {notifLoading ? (
                  <div className="p-2"><NotificationsSkeleton /></div>
                ) : notifications.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No unread notifications.
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    {groupedNotifications.map((group) => (
                      <div key={group.label}>
                        <div className="sticky top-0 bg-card px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
                          {group.label}
                        </div>
                        {group.items.map((n) => (
                          <DropdownMenuItem
                            key={n.id}
                            className="flex flex-col items-start gap-1 p-3"
                            onClick={() => markAsRead(n.id, n.linkUrl)}
                          >
                            <div className="flex w-full items-center gap-2">
                              <span className="text-xs font-medium uppercase text-muted-foreground">
                                {n.type}
                              </span>
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                {new Date(n.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm font-medium leading-tight">{n.title}</p>
                            <p className="text-xs text-muted-foreground">{n.body}</p>
                          </DropdownMenuItem>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {user.email.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden text-sm font-medium md:inline">{user.email}</span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{user.email}</span>
                    <span className="text-xs text-muted-foreground">
                      Representative
                      {user.twoFactorEnabled && " · 2FA on"}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onNavigate("account-security")}>
                  <Shield className="mr-2 h-4 w-4" />
                  Account Security
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="h-1.5 bg-accent" />
      </header>

      {/* Horizontal nav — single row, no dropdowns (rep nav is flat) */}
      <div className="sticky top-[3.5rem] z-20 border-b bg-card">
        <div className="mx-auto max-w-5xl">
          <nav className="flex gap-1 overflow-x-auto px-4 py-2 lg:px-6" aria-label="Portal navigation">
            {PORTAL_NAV.map((dest) => {
              const Icon = dest.icon;
              const isActive = activeView === dest.view;
              return (
                <button
                  key={dest.view}
                  onClick={() => onNavigate(dest.view)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {dest.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="border-b bg-background">
        <div className="mx-auto max-w-5xl px-4 py-2 lg:px-6">
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.map((crumb, i) => {
                const isLast = i === crumbs.length - 1;
                const isHome = crumb.label === "Home";
                const content = isHome ? <Home className="h-3.5 w-3.5" /> : crumb.label;
                return (
                  <Fragment key={`${crumb.label}-${i}`}>
                    <BreadcrumbItem>
                      {isLast || !crumb.view ? (
                        <BreadcrumbPage>{content}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          onClick={() => crumb.view && onNavigate(crumb.view)}
                          className="cursor-pointer"
                        >
                          {content}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator />}
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-4 lg:p-6">{children}</div>
      </main>

      <ScrollToTop />
    </div>
  );
}
