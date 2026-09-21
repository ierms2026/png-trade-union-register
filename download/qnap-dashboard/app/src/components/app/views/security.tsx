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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

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
  const { data: trendData, loading: trendLoading, error: trendError, refetch: refetchTrend } = useFetch<{ days: Array<{ date: string; failed: number; successful: number }> }>("/api/security/login-trend");

  // Chart data for login trend — format dates as "Mon DD"
  const loginTrendData = (trendData?.days || []).map((d) => ({
    date: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
    failed: d.failed,
    successful: d.successful,
  }));

  const loginTrendConfig: ChartConfig = {
    failed: { label: "Failed", color: "var(--status-overdue)" },
    successful: { label: "Successful", color: "var(--status-compliant)" },
  };

  // Chart data for 2FA adoption donut
  const twoFactorData = data
    ? [
        { name: "2FA Enabled", value: data.twoFactorAdoption.enabled, fill: "var(--status-compliant)" },
        { name: "Not Enrolled", value: data.twoFactorAdoption.totalEligible - data.twoFactorAdoption.enabled, fill: "var(--status-expiring)" },
      ]
    : [];

  if (loading) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Security</h1>
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
        <h1 className="text-3xl font-bold tracking-tight">Security</h1>
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
          color="bg-accent/20 text-accent-foreground"
        />
        <StatCard
          label="Failed (7d)"
          value={data.failedLogins.last7d}
          icon={AlertTriangle}
          color="bg-accent/20 text-accent-foreground"
        />
        <StatCard
          label="Locked Out"
          value={data.lockedOutUsers.length}
          icon={Lock}
          color="bg-destructive/10 text-destructive"
        />
        <StatCard
          label="Disabled"
          value={data.disabledUsers.length}
          icon={Users}
          color="bg-muted text-muted-foreground"
        />
        <StatCard
          label="2FA Adoption"
          value={`${data.twoFactorAdoption.rate}%`}
          icon={KeyRound}
          color="bg-chart-3/20 text-chart-3"
          sublabel={`${data.twoFactorAdoption.enabled}/${data.twoFactorAdoption.totalEligible} users`}
        />
        <StatCard
          label="Active Sessions"
          value={data.activeSessions}
          icon={Activity}
          color="bg-primary/10 text-primary"
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Login trend — line chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5" />
              Login Activity (7 Days)
            </CardTitle>
            <CardDescription>Daily failed vs. successful login attempts.</CardDescription>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <div className="h-[240px] animate-pulse rounded-md bg-muted" />
            ) : trendError ? (
              <ErrorState description={trendError} onRetry={refetchTrend} />
            ) : (
              <ChartContainer config={loginTrendConfig} className="h-[240px] w-full">
                <LineChart data={loginTrendData} margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    allowDecimals={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="failed"
                    stroke="var(--status-overdue)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "var(--status-overdue)" }}
                    name="Failed"
                  />
                  <Line
                    type="monotone"
                    dataKey="successful"
                    stroke="var(--status-compliant)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "var(--status-compliant)" }}
                    name="Successful"
                  />
                </LineChart>
              </ChartContainer>
            )}
            {/* Legend */}
            <div className="mt-3 flex gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="h-2 w-4 rounded-full bg-destructive" />
                <span className="text-muted-foreground">Failed</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2 w-4 rounded-full bg-chart-3" />
                <span className="text-muted-foreground">Successful</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2FA adoption — donut chart */}
        {data && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5" />
                2FA Adoption
              </CardTitle>
              <CardDescription>
                {data.twoFactorAdoption.enabled} of {data.twoFactorAdoption.totalEligible} eligible users have 2FA enabled.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <ChartContainer config={{ value: { label: "Users" } }} className="h-[180px] w-[180px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                    <Pie
                      data={twoFactorData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={2}
                    >
                      {twoFactorData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="space-y-3">
                  <div>
                    <p className="text-3xl font-bold text-chart-3">
                      {data.twoFactorAdoption.rate}%
                    </p>
                    <p className="text-xs text-muted-foreground">Adoption rate</p>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-chart-3" />
                      <span className="text-muted-foreground">Enabled:</span>
                      <span className="font-medium">{data.twoFactorAdoption.enabled}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-accent" />
                      <span className="text-muted-foreground">Not enrolled:</span>
                      <span className="font-medium">{data.twoFactorAdoption.totalEligible - data.twoFactorAdoption.enabled}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Locked-out users — single-card list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="h-5 w-5" />
            Locked-Out Users
          </CardTitle>
          <CardDescription>Users currently locked due to repeated failed login attempts.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data.lockedOutUsers.length === 0 ? (
            <div className="py-8"><EmptyState icon={Shield} title="No locked-out users" description="All accounts are in good standing." /></div>
          ) : (
            <div className="divide-y">
              <div className="hidden grid-cols-[1fr_120px_140px_80px] items-center gap-3 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid">
                <span>User</span><span>Role</span><span>Locked Until</span><span className="text-center">Action</span>
              </div>
              {data.lockedOutUsers.map((u) => (
                <div key={u.id} className="grid grid-cols-[1fr_120px_140px_80px] items-center gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10"><Lock className="h-4 w-4 text-destructive" /></div>
                    <div className="min-w-0"><p className="truncate font-medium">{u.email}</p><p className="text-xs text-muted-foreground sm:hidden">{u.role} · {u.failedLoginAttempts} failed</p></div>
                  </div>
                  <div className="hidden items-center gap-1.5 sm:flex">
                    <Badge variant="outline" className="text-xs">{u.role}</Badge>
                    {u.disabled && <Badge variant="destructive" className="text-xs">Disabled</Badge>}
                    {u.twoFactorEnabled && <Badge variant="secondary" className="text-xs">2FA</Badge>}
                  </div>
                  <div className="hidden text-xs text-muted-foreground sm:block">{u.failedLoginAttempts} failed<br /><span className="text-muted-foreground/70">until {new Date(u.lockedUntil).toLocaleString()}</span></div>
                  <div className="flex justify-center sm:justify-end"><Button size="sm" variant="outline" onClick={() => unlockUser(u.id)}><Unlock className="mr-1 h-3 w-3" /><span className="hidden sm:inline">Unlock</span></Button></div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disabled users — single-card list */}
      {data.disabledUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Disabled Users
            </CardTitle>
            <CardDescription>Users with admin-disabled accounts.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              <div className="hidden grid-cols-[1fr_120px_100px] items-center gap-3 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid">
                <span>User</span><span>Role</span><span className="text-center">Status</span>
              </div>
              {data.disabledUsers.map((u) => (
                <div key={u.id} className="grid grid-cols-[1fr_120px_100px] items-center gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted"><Users className="h-4 w-4 text-muted-foreground" /></div>
                    <div className="min-w-0"><p className="truncate font-medium">{u.email}</p><p className="text-xs text-muted-foreground sm:hidden">{u.role}</p></div>
                  </div>
                  <span className="hidden sm:inline"><Badge variant="outline" className="text-xs">{u.role}</Badge></span>
                  <div className="flex justify-center sm:justify-end"><Badge variant="destructive">Disabled</Badge></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
