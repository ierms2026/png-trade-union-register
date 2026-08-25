"use client";

import { Fragment, type ReactNode } from "react";
import {
  LayoutDashboard, Building2, CheckCircle2, Settings2, GitCompare,
  ListTodo, Calendar, ScrollText, Users, Shield, Key, Bell, LogOut, CheckCheck,
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

interface AuthUser {
  id: string; email: string;
  role: "REGISTRAR" | "INSPECTOR" | "OFFICER";
  assignedUnionId: string | null; twoFactorEnabled: boolean;
}
interface Notification { id: string; type: string; title: string; body: string; linkUrl: string | null; createdAt: string; }
interface NavItem { id: string; label: string; icon: typeof LayoutDashboard; roles: Array<"REGISTRAR" | "INSPECTOR" | "OFFICER">; }

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"] },
  { id: "unions", label: "Unions", icon: Building2, roles: ["REGISTRAR", "INSPECTOR"] },
  { id: "my-union", label: "My Union", icon: Building2, roles: ["OFFICER"] },
  { id: "compliance", label: "Compliance", icon: CheckCircle2, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"] },
  { id: "configure-rules", label: "Rules", icon: Settings2, roles: ["REGISTRAR"] },
  { id: "compare", label: "Compare", icon: GitCompare, roles: ["REGISTRAR", "INSPECTOR"] },
  { id: "tasks", label: "Tasks", icon: ListTodo, roles: ["REGISTRAR", "OFFICER"] },
  { id: "calendar", label: "Calendar", icon: Calendar, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"] },
  { id: "audit", label: "Audit", icon: ScrollText, roles: ["REGISTRAR", "INSPECTOR"] },
  { id: "users", label: "Users", icon: Users, roles: ["REGISTRAR"] },
  { id: "security", label: "Security", icon: Shield, roles: ["REGISTRAR"] },
  { id: "api-keys", label: "API Keys", icon: Key, roles: ["REGISTRAR"] },
];

function buildNav(role: AuthUser["role"]): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

interface Crumb { label: string; view?: string }

function buildBreadcrumbs(activeView: string, _role: AuthUser["role"]): Crumb[] {
  if (activeView === "account-security") return [{ label: "Home", view: "dashboard" }, { label: "Account Security" }];
  const current = NAV_ITEMS.find((n) => n.id === activeView);
  if (!current) return [{ label: "Home", view: "dashboard" }, { label: activeView }];
  const trail: Crumb[] = [{ label: "Home", view: "dashboard" }];
  if (activeView === "configure-rules") trail.push({ label: "Compliance", view: "compliance" });
  trail.push({ label: current.label });
  return trail;
}

interface HorizontalNavProps { nav: NavItem[]; activeView: string; onNavigate: (view: string) => void; }

function HorizontalNav({ nav, activeView, onNavigate }: HorizontalNavProps) {
  return (
    <nav className="flex items-center gap-1 overflow-x-auto px-4 lg:px-6">
      {nav.map((item) => {
        const Icon = item.icon;
        const active = activeView === item.id;
        return (
          <button key={item.id} onClick={() => onNavigate(item.id)} title={item.label}
            className={`flex flex-shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "border-accent text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}>
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

interface AppShellProps { user: AuthUser; activeView: string; onNavigate: (view: string) => void; children: ReactNode; }

export function AppShell({ user, activeView, onNavigate, children }: AppShellProps) {
  const nav = buildNav(user.role);
  const crumbs = buildBreadcrumbs(activeView, user.role);
  const { data: notifData, loading: notifLoading, refetch: refetchNotifs } = useFetch<{ notifications: Notification[]; unreadCount: number; }>("/api/notifications");
  const notifications = notifData?.notifications ?? [];
  const unreadCount = notifData?.unreadCount ?? 0;

  async function markAsRead(id: string, linkUrl: string | null) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" });
      refetchNotifs();
      if (linkUrl) onNavigate(linkUrl.replace(/^\//, ""));
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
            <Badge variant="outline" className="hidden text-xs md:inline-flex">{user.role}</Badge>
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
                : <div className="max-h-96 overflow-y-auto">{notifications.map((n) => (
                  <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-1 p-3" onClick={() => markAsRead(n.id, n.linkUrl)}>
                    <div className="flex w-full items-center gap-2">
                      <span className="text-xs font-medium uppercase text-muted-foreground">{n.type}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm font-medium leading-tight">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.body}</p>
                  </DropdownMenuItem>
                ))}</div>}
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
                <DropdownMenuLabel><div className="flex flex-col"><span className="text-sm font-medium">{user.email}</span><span className="text-xs text-muted-foreground">{user.role}{user.twoFactorEnabled && " · 2FA on"}</span></div></DropdownMenuLabel>
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
              return (<Fragment key={`${crumb.label}-${i}`}>
                <BreadcrumbItem>{isLast || !crumb.view ? <BreadcrumbPage>{crumb.label}</BreadcrumbPage> : <BreadcrumbLink onClick={() => crumb.view && onNavigate(crumb.view)} className="cursor-pointer">{crumb.label}</BreadcrumbLink>}</BreadcrumbItem>
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
  );
}
