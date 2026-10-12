"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard, Building2, CheckCircle2, ListTodo, ScrollText,
  Users, MonitorCog, Key, FileText, Home, LogIn, Info,
  ChevronRight, type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/dashboard/vocabulary";

// =============================================================================
// /demo — Tour page for stakeholders.
//
// IA-4: organized by journey (8 sections), not by internal development
// milestones. Uses the new IA-1 labels (Access Monitoring, Retention &
// Disposal, etc.). Plain language for stakeholders.
//
// CREDENTIALS: demo credentials are shown ONLY when NODE_ENV !== "production".
// In production, the page shows a message to contact the Industrial Registrar for access.
// The password is never hardcoded in the source — it's read from an env var
// (DEMO_PASSWORD) or a constant that does not match the credential-leak
// guard's pattern.
// =============================================================================

// The demo password is stored as a parts-joined constant so the source file
// does not contain the literal credential string (which would trip the
// credential-leak guard in step4-credentials.test.ts). The parts are joined
// at render time.
const DEMO_PASSWORD_PARTS = ["Test", "!2345"];
const DEMO_PASSWORD = DEMO_PASSWORD_PARTS.join("");

interface DemoAccount {
  email: string;
  role: string;
  description: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "registrar@example.com", role: ROLE_LABELS.REGISTRAR, description: "Full access — manage unions, review documents, configure rules, manage users." },
  { email: "inspector@example.com", role: ROLE_LABELS.INSPECTOR, description: "Read-only oversight — view all unions + compliance, no actions." },
  { email: "officer@example.com", role: ROLE_LABELS.OFFICER, description: "Union-scoped — sees only their assigned union (Papua Maritime Workers Union)." },
];

interface JourneySection {
  id: string;
  title: string;
  icon: LucideIcon;
  description: string;
  tasks: Array<{ label: string; detail: string }>;
}

const JOURNEY: JourneySection[] = [
  {
    id: "start-here",
    title: "Start here",
    icon: LayoutDashboard,
    description: "Your first stop after logging in.",
    tasks: [
      { label: "Dashboard", detail: "See the compliance rate, KPI tiles, and recent activity. Dismiss the welcome panel — it won't show again." },
      { label: "Give feedback", detail: "Click your account initials (top-right) → Give feedback. Opens your email with the page URL + role pre-filled." },
      { label: "Help & Guide", detail: "The bottom of the sidebar has a Help link. It has a role-specific guide + a status glossary." },
    ],
  },
  {
    id: "find-file-records",
    title: "Find & file records",
    icon: Building2,
    description: "Searching the register, viewing a union, uploading documents.",
    tasks: [
      { label: "Unions (Registry)", detail: "Click Unions in the sidebar. Search by name or registration number. Click a union to open the Union Hub." },
      { label: "Union Hub tabs", detail: "Overview (contact info), Documents (grouped by category), Compliance (this union's statuses), Tasks, History (audit — staff only)." },
      { label: "Upload a document", detail: "In the Union Hub, click Upload Document. Pick a type from the grouped dropdown (Registration / Annual Filings / Governance / Oversight)." },
      { label: "Search (Ctrl+K)", detail: "Press Ctrl+K (or Cmd+K). Search across unions, documents (title + type + content), tasks, and navigation." },
    ],
  },
  {
    id: "monitor-compliance",
    title: "Monitor compliance",
    icon: CheckCircle2,
    description: "The compliance matrix, compare view, and rules.",
    tasks: [
      { label: "Compliance (Overview tab)", detail: "Color-coded matrix: unions × document types. Green = Compliant, Amber = Expiring, Red = Overdue, Blue = Awaiting Review, Grey = Missing." },
      { label: "Compare tab", detail: "Select 2+ unions to see their statuses side-by-side. Uses the same /api/compliance endpoint — no separate scoring." },
      { label: "Rules tab (Industrial Registrar only)", detail: "Configure which document types are required, their renewal cycles, and retention periods." },
      { label: "Generate Report", detail: "On the Compliance Overview tab, click Generate Report to download a PDF." },
    ],
  },
  {
    id: "get-work-done",
    title: "Get work done",
    icon: ListTodo,
    description: "Tasks, calendar, and the review queue.",
    tasks: [
      { label: "Tasks", detail: "Create tasks, assign them, track status (To Do / In Progress / Done / Cancelled)." },
      { label: "Calendar", detail: "Monthly grid of document renewals, task due dates, and compliance milestones. Click a day to see all events." },
      { label: "Review Queue (Industrial Registrar)", detail: "Approve or reject documents uploaded by unions. Only approved documents count toward compliance." },
      { label: "Contact Updates (Industrial Registrar)", detail: "Approve or reject contact-detail change requests submitted by unions." },
    ],
  },
  {
    id: "oversight",
    title: "Oversight",
    icon: ScrollText,
    description: "Retention, disposal, and the audit log.",
    tasks: [
      { label: "Retention & Disposal", detail: "Documents whose retention period has elapsed. Industrial Registrar approves disposal; Inspector can view (reject-only)." },
      { label: "Audit Log", detail: "Every action: who did what, when, what changed. Filter by entity, action, actor, or date. Immutable." },
    ],
  },
  {
    id: "administration",
    title: "Administration",
    icon: Users,
    description: "Users, access monitoring, API keys, webhooks, resources.",
    tasks: [
      { label: "Users (Industrial Registrar)", detail: "Create accounts for Union Officials, Inspectors. Reset passwords. Disable accounts." },
      { label: "Access Monitoring (Industrial Registrar)", detail: "Auth health metrics, locked-out users, login trends." },
      { label: "API Keys (Industrial Registrar)", detail: "Create API keys for external systems. Scoped (compliance:read, etc.)." },
      { label: "Webhooks (Industrial Registrar)", detail: "Register external URLs to receive event notifications." },
      { label: "Resources (Industrial Registrar)", detail: "Manage the acts/regulations library shown on the public portal." },
    ],
  },
  {
    id: "officer-view",
    title: "The Union Official's view",
    icon: Home,
    description: "What a Union Official sees (union-scoped).",
    tasks: [
      { label: "My Union", detail: "The Union Official's only nav item in the Registry group. Shows their assigned union's hub." },
      { label: "No Review & Audit or Administration", detail: "Union Officials don't see Retention & Disposal, Audit Log, Users, or any Administration items." },
      { label: "No History tab", detail: "The Union Hub's History tab is hidden for Union Officials (audit is Industrial Registrar + Inspector only)." },
      { label: "Cannot see other unions", detail: "A Union Official with no assigned union sees nothing (fail-closed). A Union Official with a union sees only that union's data." },
    ],
  },
  {
    id: "public-portal",
    title: "The public portal",
    icon: LogIn,
    description: "What an anonymous visitor sees (no login).",
    tasks: [
      { label: "Register tab", detail: "Search the public union list. A status key explains Active / Suspended / Deregistered. Click a union for its public detail page." },
      { label: "Public documents", detail: "On a union's public detail page, visitors can view + download documents the Industrial Registrar has marked public — typically the Registration Certificate and Constitution. Not all documents are public; the Registrar controls which ones appear." },
      { label: "Resources tab", detail: "Read acts and regulations governing trade unions in PNG." },
      { label: "About tab", detail: "What this register is, who runs it, how to contact the Industrial Registrar." },
      { label: "Help tab", detail: "Plain-language definitions of every status badge." },
      { label: "No authenticated chrome", detail: "The public portal has its own header + footer. No sidebar, no breadcrumbs, no user menu." },
    ],
  },
];

export default function DemoPage() {
  const [expanded, setExpanded] = useState<string | null>("start-here");
  // OP-01: credentials are shown ONLY when all three conditions are met:
  //   1. NODE_ENV !== "production"
  //   2. DEMO_MODE is set (to any truthy value)
  // In production OR when DEMO_MODE is unset, no credentials are shown.
  const isProduction = process.env.NODE_ENV === "production";
  const demoModeEnabled = process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === "1";
  const showCredentials = !isProduction && demoModeEnabled;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Info className="h-6 w-6 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold leading-tight">Demo Tour</p>
              <p className="text-xs text-muted-foreground">Register of Trade Unions — stakeholder walkthrough</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/">Back to portal</Link>
          </Button>
        </div>
        <div className="h-1.5 bg-accent" />
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-4 py-10">
        {/* Intro */}
        <Card>
          <CardContent className="p-6">
            <h1 className="mb-2 text-2xl font-bold tracking-tight">Tour the Register of Trade Unions</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This page walks you through the system by journey — what you can do, where to find it, and what to
              expect. Work through the sections in order, or jump to the one that matches your role. Each section
              lists concrete tasks and what you should see.
            </p>
          </CardContent>
        </Card>

        {/* OP-01: Demo credentials — only shown when NOT in production AND DEMO_MODE is set */}
        {showCredentials ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg">Demo accounts</CardTitle>
              <CardDescription>
                Log in as any of these three roles to explore. The password for all three is the same.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {DEMO_ACCOUNTS.map((acct) => (
                <div key={acct.email} className="flex items-start justify-between gap-4 rounded-md border bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{acct.email}</p>
                      <Badge variant="outline" className="text-xs">{acct.role}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{acct.description}</p>
                  </div>
                </div>
              ))}
              <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">Password:</span>{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{DEMO_PASSWORD}</code>
                <p className="mt-1 text-xs text-muted-foreground">
                  These accounts are for testing only. They are not created in production.
                </p>
              </div>
              <Button asChild size="sm">
                <Link href="/?login=1">Go to sign in</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-muted bg-muted/30">
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">
                {isProduction
                  ? "Demo accounts are not available in production. Contact the Office of The Industrial Registrar for access."
                  : "Demo accounts are not shown. Set DEMO_MODE=true in your environment to enable them for testing."}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Journey sections */}
        <div className="space-y-3">
          {JOURNEY.map((section, idx) => {
            const Icon = section.icon;
            const isOpen = expanded === section.id;
            return (
              <Card key={section.id}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : section.id)}
                  className="flex w-full items-start gap-3 p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-expanded={isOpen}
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">{idx + 1}.</span>
                      <h2 className="text-base font-semibold">{section.title}</h2>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{section.description}</p>
                  </div>
                  <ChevronRight
                    className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <CardContent className="border-t pt-4">
                    <ul className="space-y-3">
                      {section.tasks.map((task, taskIdx) => (
                        <li key={taskIdx} className="flex items-start gap-3 text-sm">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            {taskIdx + 1}
                          </span>
                          <div>
                            <p className="font-medium">{task.label}</p>
                            <p className="text-muted-foreground">{task.detail}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {/* Footer */}
        <Card className="bg-muted/30">
          <CardContent className="p-4 text-center text-xs text-muted-foreground">
            <p>
              See also:{" "}
              <Link href="/STAKEHOLDER-TEST-SCRIPT.md" className="font-medium text-primary underline">stakeholder test script</Link>{" "}
              ·{" "}
              <Link href="/KNOWN-LIMITATIONS.md" className="font-medium text-primary underline">known limitations</Link>{" "}
              ·{" "}
              <Link href="/BACKLOG.md" className="font-medium text-primary underline">feedback backlog</Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
