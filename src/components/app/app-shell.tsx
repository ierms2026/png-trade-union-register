"use client";

import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Building2,
  CheckCircle2,
  Settings2,
  GitCompare,
  ListTodo,
  Calendar,
  ScrollText,
  Users,
  Shield,
  Key,
  Bell,
  LogOut,
  Menu,
  CheckCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useFetch } from "@/components/app/use-fetch";
import { NotificationsSkeleton } from "@/components/app/skeletons";

// =============================================================================
// AppShell — the authenticated application chrome.
//
// LAYOUT:
//   - Sidebar (left): role-aware nav items. Collapsible on mobile via Sheet.
//   - Top bar: notification bell (with unread count), user menu (Account
//     Security, Sign Out).
//   - Main content: renders the active view (passed as children).
// =============================================================================

interface AuthUser {
  id: string;
  email: string;
  role: "REGISTRAR" | "INSPECTOR" | "OFFICER";
  assignedUnionId: string | null;
  twoFactorEnabled: boolean;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  linkUrl: string | null;
  createdAt: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Array<"REGISTRAR" | "INSPECTOR" | "OFFICER">;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"] },
  { id: "unions", label: "Unions", icon: Building2, roles: ["REGISTRAR", "INSPECTOR"] },
  { id: "my-union", label: "My Union", icon: Building2, roles: ["OFFICER"] },
  { id: "compliance", label: "Compliance", icon: CheckCircle2, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"] },
  { id: "configure-rules", label: "Configure Rules", icon: Settings2, roles: ["REGISTRAR"] },
  { id: "compare", label: "Compare", icon: GitCompare, roles: ["REGISTRAR", "INSPECTOR"] },
  { id: "tasks", label: "Tasks", icon: ListTodo, roles: ["REGISTRAR", "OFFICER"] },
  { id: "calendar", label: "Calendar", icon: Calendar, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"] },
  { id: "audit", label: "Audit Log", icon: ScrollText, roles: ["REGISTRAR", "INSPECTOR"] },
  // Retention removed — disposal features omitted
  { id: "users", label: "Users", icon: Users, roles: ["REGISTRAR"] },
  { id: "security", label: "Security", icon: Shield, roles: ["REGISTRAR"] },
  { id: "api-keys", label: "API Keys", icon: Key, roles: ["REGISTRAR"] },
];

function buildNav(role: AuthUser["role"]): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

// NavContent — extracted as a top-level component (not defined inside AppShell)
// to avoid the "Cannot create components during render" lint error.
interface NavContentProps {
  nav: NavItem[];
  activeView: string;
  onNavigate: (view: string) => void;
  onMobileClose?: () => void;
}

function NavContent({ nav, activeView, onNavigate, onMobileClose }: NavContentProps) {
  return (
    <nav className="space-y-1">
      {nav.map((item) => {
        const Icon = item.icon;
        const active = activeView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => {
              onNavigate(item.id);
              onMobileClose?.();
            }}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

interface AppShellProps {
  user: AuthUser;
  activeView: string;
  onNavigate: (view: string) => void;
  children: ReactNode;
}

export function AppShell({ user, activeView, onNavigate, children }: AppShellProps) {
  const nav = buildNav(user.role);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: notifData, loading: notifLoading, refetch: refetchNotifs } = useFetch<{
    notifications: Notification[];
    unreadCount: number;
  }>("/api/notifications");

  const notifications = notifData?.notifications ?? [];
  const unreadCount = notifData?.unreadCount ?? 0;

  async function markAsRead(id: string, linkUrl: string | null) {
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      refetchNotifs();
      if (linkUrl) {
        // Strip leading slash to match the view id
        onNavigate(linkUrl.replace(/^\//, ""));
      }
    } catch {
      toast.error("Failed to mark notification as read.");
    }
  }

  async function markAllRead() {
    for (const n of notifications) {
      await fetch(`/api/notifications/${n.id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
    }
    refetchNotifs();
    toast.success("All notifications marked as read.");
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore — we're navigating away anyway.
    }
    window.location.href = "/";
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 flex-shrink-0 border-r bg-background lg:flex lg:flex-col">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="rounded-lg bg-primary p-2">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Union Records</p>
            <p className="text-xs text-muted-foreground">Management System</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavContent nav={nav} activeView={activeView} onNavigate={onNavigate} />
        </div>
        <div className="border-t p-3">
          <Badge variant="outline" className="w-full justify-center text-xs">
            {user.role}
          </Badge>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
          {/* Mobile menu trigger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <div className="mb-6 flex items-center gap-2">
                <div className="rounded-lg bg-primary p-2">
                  <Building2 className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">Union Records</p>
                  <p className="text-xs text-muted-foreground">Management System</p>
                </div>
              </div>
              <NavContent
                nav={nav}
                activeView={activeView}
                onNavigate={onNavigate}
                onMobileClose={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <div className="flex-1">
            <h2 className="text-sm font-medium capitalize">
              {nav.find((n) => n.id === activeView)?.label ?? activeView}
            </h2>
          </div>

          {/* Notification bell */}
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={markAllRead}
                  >
                    <CheckCheck className="mr-1 h-3 w-3" />
                    Mark all read
                  </Button>
                )}
              </div>
              <DropdownMenuSeparator />
              {notifLoading ? (
                <div className="p-2">
                  <NotificationsSkeleton />
                </div>
              ) : notifications.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No unread notifications.
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  {notifications.map((n) => (
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
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {user.email.charAt(0).toUpperCase()}
                </div>
                <span className="hidden text-sm font-medium sm:inline">{user.email}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{user.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {user.role}
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
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
