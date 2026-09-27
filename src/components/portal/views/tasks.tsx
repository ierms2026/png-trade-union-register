"use client";

import { ListTodo, Calendar, User, Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";

// =============================================================================
// PortalTasksView — chunk 5
//
// Read-only task list for the rep's union. Reuses /api/tasks (updated in
// chunk 5 to scope REPRESENTATIVE the same as OFFICER).
//
// Reps cannot create, edit, or complete tasks — that's a staff-side
// concept. They just see what's pending for their union.
// =============================================================================

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  union: { unionName: string; registrationNo: string } | null;
  assignee: { email: string } | null;
  creator: { email: string } | null;
}

const STATUS_CONFIG: Record<Task["status"], { label: string; tone: string }> = {
  TODO: { label: "To Do", tone: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300" },
  IN_PROGRESS: { label: "In Progress", tone: "bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300" },
  DONE: { label: "Done", tone: "bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300" },
  CANCELLED: { label: "Cancelled", tone: "bg-muted text-muted-foreground" },
};

const PRIORITY_CONFIG: Record<Task["priority"], { label: string; tone: string }> = {
  LOW: { label: "Low", tone: "bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400" },
  MEDIUM: { label: "Medium", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300" },
  HIGH: { label: "High", tone: "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300" },
};

export function PortalTasksView() {
  const { data, loading, error, refetch } = useFetch<{ tasks: Task[] }>("/api/tasks");

  if (loading) return <CardListSkeleton count={4} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;

  const tasks = data?.tasks ?? [];
  // Sort: not-DONE first, then by dueDate ASC (nulls last), then by priority DESC
  const sortedTasks = [...tasks].sort((a, b) => {
    const aDone = a.status === "DONE" || a.status === "CANCELLED" ? 1 : 0;
    const bDone = b.status === "DONE" || b.status === "CANCELLED" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    const priOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return priOrder[a.priority] - priOrder[b.priority];
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Tasks for your union (read-only). The Registrar creates and assigns these.
        </p>
      </div>

      {sortedTasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="No tasks"
          description="There are no tasks for your union right now."
        />
      ) : (
        <div className="space-y-3">
          {sortedTasks.map((task) => {
            const statusCfg = STATUS_CONFIG[task.status];
            const priCfg = PRIORITY_CONFIG[task.priority];
            const isOverdue =
              task.dueDate &&
              task.status !== "DONE" &&
              task.status !== "CANCELLED" &&
              new Date(task.dueDate) < new Date();
            return (
              <Card key={task.id} className={isOverdue ? "border-red-200 dark:border-red-900" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{task.title}</h3>
                        <Badge variant="outline" className={statusCfg.tone}>
                          {statusCfg.label}
                        </Badge>
                        <Badge variant="outline" className={priCfg.tone}>
                          {priCfg.label}
                        </Badge>
                      </div>
                      {task.description && (
                        <p className="text-xs text-muted-foreground">{task.description}</p>
                      )}
                      <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
                        {task.dueDate && (
                          <span className={`flex items-center gap-1 ${isOverdue ? "font-medium text-red-600 dark:text-red-400" : ""}`}>
                            <Calendar className="h-3 w-3" />
                            {isOverdue ? "Overdue: " : "Due: "}
                            {new Date(task.dueDate).toLocaleDateString()}
                          </span>
                        )}
                        {task.assignee && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {task.assignee.email}
                          </span>
                        )}
                        {task.union && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {task.union.unionName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
