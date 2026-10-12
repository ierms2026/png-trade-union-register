"use client";

import { type LucideIcon } from "lucide-react";
import {
  CheckCircle2, FileCheck, ClipboardList, Shield, Key, ScrollText,
  Users, Building2, FileText, ListTodo, Calendar, Search, FileQuestion,
  ArrowRight, HelpCircle, Mail, BookOpen,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusGlossary, type GlossaryEntry } from "@/components/app/status-glossary";
import { RegistrarContactInfo } from "@/components/app/registrar-contact-info";
import {
  COMPLIANCE_STATUS_CONFIG,
  REVIEW_STATUS_CONFIG,
  UNION_STATUS_CONFIG,
  ROLE_LABELS,
  type UserRole,
} from "@/lib/dashboard/vocabulary";

// =============================================================================
// HelpGuideView — the staff help layer.
//
// Shows a role-based guide (what you can do, where to find it, top tasks) +
// a status glossary (compliance statuses, review statuses, union statuses)
// + a "still need help?" card with the Registrar's contact details.
//
// The role is passed in from page.tsx (which has the authenticated user).
// The guide content is tailored per role — Registrar sees Registrar tasks,
// Inspector sees Inspector tasks, etc.
//
// LIGHT BY DESIGN: this is a few short cards, not a full manual. The brief
// says "short guidance gets read and long manuals don't." Each role's guide
// is 3-4 top tasks + a one-line description of where to find them.
// =============================================================================

interface Task {
  icon: LucideIcon;
  title: string;
  description: string;
  /** The view to navigate to (passed to onNavigate). */
  view: string;
}

interface RoleGuide {
  roleName: string;
  /** One-line summary of what this role does. */
  summary: string;
  /** 3-4 top tasks. */
  tasks: Task[];
  /** Views this role has access to (for the "where to find it" section). */
  accessibleAreas: string[];
}

const ROLE_GUIDES: Record<UserRole, RoleGuide> = {
  REGISTRAR: {
    roleName: ROLE_LABELS.REGISTRAR,
    summary:
      "You are the system administrator. You can do everything: manage unions, review documents, configure compliance rules, and manage users.",
    tasks: [
      {
        icon: FileCheck,
        title: "Review uploaded documents",
        description: "Approve or reject documents submitted by unions. Only approved documents count toward compliance.",
        view: "reviews",
      },
      {
        icon: Building2,
        title: "Register a new union",
        description: "Add a new trade union to the register. You'll enter its name, registration number, and initial details.",
        view: "unions",
      },
      {
        icon: Users,
        title: "Manage user accounts",
        description: "Create accounts for Officers, Inspectors, and Representatives. Reset passwords. Disable accounts.",
        view: "users",
      },
      {
        icon: ClipboardList,
        title: "Configure compliance rules",
        description: "Set which document types are required, how often they renew, and how long they're retained.",
        view: "configure-rules",
      },
    ],
    accessibleAreas: [
      "Dashboard", "Unions", "Documents", "Compare", "Compliance", "Rules",
      "Tasks", "Calendar", "Review Queue", "Contact Updates", "Retention & Disposal",
      "Search", "Audit Log", "Users", "Access Monitoring", "API Keys", "Webhooks", "Resources",
    ],
  },
  INSPECTOR: {
    roleName: ROLE_LABELS.INSPECTOR,
    summary:
      "You oversee compliance across all unions. You can view everything, but you can't manage users or configure rules.",
    tasks: [
      {
        icon: CheckCircle2,
        title: "Check compliance across unions",
        description: "View the compliance matrix to see which unions are compliant, expiring, overdue, or missing documents.",
        view: "compliance",
      },
      {
        icon: Building2,
        title: "Inspect a specific union",
        description: "Open a union's record to see its documents, contact details, and compliance history.",
        view: "unions",
      },
      {
        icon: ScrollText,
        title: "Review the audit log",
        description: "See every action taken in the system — who did what, when. Filter by entity, action, actor, or date.",
        view: "audit",
      },
      {
        icon: Calendar,
        title: "Check the compliance calendar",
        description: "See upcoming document expirations and compliance deadlines across all unions.",
        view: "calendar",
      },
    ],
    accessibleAreas: [
      "Dashboard", "Unions", "Documents", "Compare", "Compliance",
      "Tasks", "Calendar", "Search", "Audit Log",
    ],
  },
  OFFICER: {
    roleName: ROLE_LABELS.OFFICER,
    summary:
      "You manage one or more assigned unions. You upload documents, create tasks, and track compliance for your unions.",
    tasks: [
      {
        icon: FileText,
        title: "Upload a document",
        description: "Upload a new version of a document (e.g. Financial Return, Constitution) for your assigned union.",
        view: "my-union",
      },
      {
        icon: CheckCircle2,
        title: "Check your union's compliance",
        description: "See which documents are compliant, expiring, overdue, or missing for your union.",
        view: "compliance",
      },
      {
        icon: ListTodo,
        title: "Manage your tasks",
        description: "See tasks assigned to you, update their status, and mark them complete.",
        view: "tasks",
      },
      {
        icon: Calendar,
        title: "Check upcoming deadlines",
        description: "See when your union's documents are due to expire so you can renew them in time.",
        view: "calendar",
      },
    ],
    accessibleAreas: [
      "Dashboard", "My Union", "Compliance",
      "Tasks", "Calendar",
    ],
  },
};

interface HelpGuideViewProps {
  userRole: UserRole;
  onNavigate?: (view: string) => void;
}

export function HelpGuideView({ userRole, onNavigate }: HelpGuideViewProps) {
  const guide = ROLE_GUIDES[userRole] ?? ROLE_GUIDES.OFFICER;

  // Build glossary entries from the canonical status configs.
  const complianceEntries: GlossaryEntry[] = Object.entries(COMPLIANCE_STATUS_CONFIG)
    .map(([, cfg]) => ({
      label: cfg.label,
      icon: cfg.icon,
      tone: cfg.cell,
      definition: cfg.definition,
    }));

  const reviewEntries: GlossaryEntry[] = Object.entries(REVIEW_STATUS_CONFIG)
    .filter(([, cfg]) => cfg.definition)
    .map(([, cfg]) => ({
      label: cfg.label,
      icon: cfg.icon,
      tone: cfg.tone,
      definition: cfg.definition!,
    }));

  const unionStatusEntries: GlossaryEntry[] = Object.values(UNION_STATUS_CONFIG).map((cfg) => ({
    label: cfg.label,
    icon: cfg.icon,
    tone: cfg.className,
    definition: cfg.definition,
    plainLanguage: cfg.plainLanguage,
  }));

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div>
        <div className="flex items-center gap-2">
          <HelpCircle className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Help &amp; Guide</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          A short guide to your role, the tasks you&apos;ll do most, and what the status terms mean.
        </p>
      </div>

      {/* Role-based guide */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Your Role: {guide.roleName}</CardTitle>
              <CardDescription>{guide.summary}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {guide.tasks.length > 0 && (
            <div>
              <p className="mb-3 text-sm font-medium">Tasks you&apos;ll do most:</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {guide.tasks.map((task) => {
                  const Icon = task.icon;
                  return (
                    <button
                      key={task.title}
                      onClick={() => onNavigate?.(task.view)}
                      className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="rounded-lg bg-primary/10 p-2">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{task.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {guide.accessibleAreas.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Areas you can access:</p>
              <div className="flex flex-wrap gap-2">
                {guide.accessibleAreas.map((area) => (
                  <span key={area} className="rounded-full border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
                    {area}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status glossary */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">What the Status Terms Mean</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          These are the same terms you&apos;ll see on the Dashboard, Compliance, and other screens. Hover over a status on the Dashboard to see a short definition — the same definitions are spelled out here.
        </p>

        <div className="space-y-4">
          <StatusGlossary
            title="Compliance Statuses"
            description="Whether a document is filed, approved, and current."
            entries={complianceEntries}
          />

          <StatusGlossary
            title="Review Statuses"
            description="Where a document is in the Registrar's review process."
            entries={reviewEntries}
          />

          <StatusGlossary
            title="Union Statuses"
            description="The registration status of a trade union."
            entries={unionStatusEntries}
            showPlainLanguage
          />
        </div>
      </div>

      {/* Still need help? */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-accent-foreground" />
            <CardTitle className="text-lg">Still Need Help?</CardTitle>
          </div>
          <CardDescription>
            If something on this screen doesn&apos;t make sense, contact the Office of The Industrial Registrar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegistrarContactInfo variant="card" />
        </CardContent>
      </Card>
    </div>
  );
}
