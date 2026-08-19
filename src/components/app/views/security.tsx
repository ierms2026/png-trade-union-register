"use client";

import { Shield, AlertTriangle, Lock, KeyRound, Users, Activity, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFetch } from "@/components/app/use-fetch";
import { StatsSkeleton, CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";
import { type LucideIcon } from "lucide-react";

// =============================================================================
// Security view — Registrar's security dashboard.
//
// Shows:
//   - 6 overview cards: failed logins (24h/7d), locked-out users, disabled
//     users, 2FA adoption rate, active sessions.
//   - Locked-out users list with "Unlock" buttons.
// =============================================================================

interface SecurityOverview {
  failedLogins: { last24h: number; last7d: number };
  lockedOutUsers: Array<{
    id: string;
    email: string;
    role: string;
    lockedUntil: string;
    disabled: boolean;
    twoFactorEnabled: boolean;
    failedLoginAttempts: number;
  }>;
  disabledUsers: Array<{
    id: string;
    email: string;
    role: string;
    disabled: boolean;
  }>;
  twoFactorAdoption: { enabled: number; totalEligible: number; rate: number };
  activeSessions: number;
  generatedAt: string;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sublabel,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color: string;
  sublabel?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="text-xs">{label}</CardDescription>
          <div className={`rounded-md p-1.5 ${color}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
      </CardContent>
    </Card>
  );
}

export function SecurityView() {
  const { data, loading, error, refetch } = useFetch<SecurityOverview>("/api/security/overview");

  if (loading) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground">Auth health metrics and account management.</p>
      </div>
      <StatsSkeleton />
      <CardListSkeleton count={2} />
    </div>
  );
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data) return null;

  async function unlockUser(userId: string) {
    try {
      const res = await fetch("/api/security/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "Failed to unlock user.");
        return;
      }
      toast.success("User unlocked.");
      refetch();
    } catch {
      toast.error("Network error.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground">
          Auth health metrics and account management. Generated at{" "}
          {new Date(data.generatedAt).toLocaleString()}.
        </p>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Failed (24h)"
          value={data.failedLogins.last24h}
          icon={AlertTriangle}
          color="bg-amber-100 text-amber-700"
        />
        <StatCard
          label="Failed (7d)"
          value={data.failedLogins.last7d}
          icon={AlertTriangle}
          color="bg-amber-100 text-amber-700"
        />
        <StatCard
          label="Locked Out"
          value={data.lockedOutUsers.length}
          icon={Lock}
          color="bg-red-100 text-red-700"
        />
        <StatCard
          label="Disabled"
          value={data.disabledUsers.length}
          icon={Users}
          color="bg-gray-100 text-gray-700"
        />
        <StatCard
          label="2FA Adoption"
          value={`${data.twoFactorAdoption.rate}%`}
          icon={KeyRound}
          color="bg-green-100 text-green-700"
          sublabel={`${data.twoFactorAdoption.enabled}/${data.twoFactorAdoption.totalEligible} users`}
        />
        <StatCard
          label="Active Sessions"
          value={data.activeSessions}
          icon={Activity}
          color="bg-blue-100 text-blue-700"
        />
      </div>

      {/* Locked-out users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="h-5 w-5" />
            Locked-Out Users
          </CardTitle>
          <CardDescription>Users currently locked due to repeated failed login attempts.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.lockedOutUsers.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="No locked-out users"
              description="All accounts are in good standing."
            />
          ) : (
            <div className="space-y-2">
              {data.lockedOutUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10">
                      <Lock className="h-4 w-4 text-destructive" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{u.email}</p>
                        <Badge variant="outline" className="text-xs">{u.role}</Badge>
                        {u.disabled && (
                          <Badge variant="destructive" className="text-xs">Also Disabled</Badge>
                        )}
                        {u.twoFactorEnabled && (
                          <Badge variant="secondary" className="text-xs">2FA</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {u.failedLoginAttempts} failed attempts · Locked until{" "}
                        {new Date(u.lockedUntil).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => unlockUser(u.id)}>
                    <Unlock className="mr-1 h-3 w-3" />
                    Unlock
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disabled users */}
      {data.disabledUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Disabled Users</CardTitle>
            <CardDescription>Users with admin-disabled accounts.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.disabledUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{u.email}</p>
                      <p className="text-xs text-muted-foreground">{u.role}</p>
                    </div>
                  </div>
                  <Badge variant="destructive">Disabled</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
