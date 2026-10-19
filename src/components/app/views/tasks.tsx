"use client";

import { useState, type FormEvent } from "react";
import { ListTodo, Plus, Trash2, Loader2, User, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { TASK_STATUS_CONFIG, type TaskStatus } from "@/lib/dashboard/vocabulary";
import { EmptyState } from "@/components/app/empty-state";

// =============================================================================
// Tasks view — task list with click-to-cycle status + create dialog.
//
// STATUS LABELS: read from the shared TASK_STATUS_CONFIG in vocabulary.ts
// (single source of truth — same labels as the portal Tasks view + the
// Help glossary). The local STATUS_CONFIG copy was deleted to prevent drift.
//
// STATUS CYCLE: PENDING → IN_PROGRESS → COMPLETED → PENDING.
// CANCELLED is NOT part of the click-to-cycle flow — it's a deliberate,
// separate action via the "Cancel" button. This matches the brief: "I want
// a real cancelled state as staff need to cancel tasks." Cancellation should
// be intentional, not something you fall into by cycling.
// =============================================================================

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  unionId: string | null;
  assigneeId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  union: { unionName: string; registrationNo: string } | null;
  assignee: { email: string } | null;
  creator: { email: string };
}

interface Assignee {
  id: string;
  email: string;
  role: string;
}

// The click-to-cycle flow: PENDING → IN_PROGRESS → COMPLETED → PENDING.
// CANCELLED is deliberately excluded — it's a separate action.
const STATUS_CYCLE: Record<string, TaskStatus> = {
  PENDING: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
  COMPLETED: "PENDING",
  // CANCELLED has no cycle target — a cancelled task stays cancelled until
  // the user clicks the cycle button, which moves it back to PENDING.
};

// Map the shared TASK_STATUS_CONFIG to a Button variant for the status button.
// The tone classes from TASK_STATUS_CONFIG are applied on top via the Badge
// inside the button.
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  IN_PROGRESS: "default",
  COMPLETED: "outline",
  CANCELLED: "outline",
};

export function TasksView() {
  const { data, loading, error, refetch } = useFetch<{ tasks: Task[] }>("/api/tasks");
  const [createOpen, setCreateOpen] = useState(false);

  if (loading) return <CardListSkeleton count={4} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            {data.tasks.length} task{data.tasks.length !== 1 ? "s" : ""}.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Task
        </Button>
      </div>

      {data.tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="No tasks yet"
          description="Create a task to track follow-ups, reviews, or actions."
          action={{ label: "Create task", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="space-y-3">
          {data.tasks.map((task) => (
            <TaskRow key={task.id} task={task} onUpdated={refetch} />
          ))}
        </div>
      )}

      {createOpen && (
        <CreateTaskDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            refetch();
            setCreateOpen(false);
          }}
        />
      )}
    </div>
  );
}

function TaskRow({ task, onUpdated }: { task: Task; onUpdated: () => void }) {
  const [updating, setUpdating] = useState(false);

  // Cycle the status: PENDING → IN_PROGRESS → COMPLETED → PENDING.
  // For CANCELLED tasks, cycling moves them back to PENDING (un-cancel).
  async function cycleStatus() {
    // If the task is CANCELLED, cycling moves it back to PENDING.
    // Otherwise, use the STATUS_CYCLE map.
    const next = task.status === "CANCELLED" ? "PENDING" : STATUS_CYCLE[task.status];
    if (!next) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update status.");
        return;
      }
      toast.success(`Task moved to ${TASK_STATUS_CONFIG[next as TaskStatus]?.label ?? next}.`);
      onUpdated();
    } catch {
      toast.error("Network error.");
    } finally {
      setUpdating(false);
    }
  }

  // Cancel the task — a deliberate, separate action from the cycle.
  // CANCELLED is a terminal state (the task stays on the list for audit
  // history but is no longer being worked on). The user can un-cancel by
  // clicking the cycle button, which moves the task back to PENDING.
  async function handleCancel() {
    if (!confirm("Cancel this task? Cancelled tasks stay on the list for audit history but are no longer being worked on.")) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to cancel task.");
        return;
      }
      toast.success("Task cancelled.");
      onUpdated();
    } catch {
      toast.error("Network error.");
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to delete.");
        return;
      }
      toast.success("Task deleted.");
      onUpdated();
    } catch {
      toast.error("Network error.");
    }
  }

  // Read the label + tone from the shared TASK_STATUS_CONFIG (single source
  // of truth). Fall back to the raw status string if the status isn't in the
  // map (shouldn't happen — the contract test enforces alignment — but the
  // fallback prevents a crash if it does).
  const statusCfg = TASK_STATUS_CONFIG[task.status as TaskStatus];
  const statusLabel = statusCfg?.label ?? task.status;
  const statusVariant = STATUS_VARIANT[task.status] ?? "outline";
  const isCancelled = task.status === "CANCELLED";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className={`font-medium ${isCancelled ? "text-muted-foreground line-through" : ""}`}>{task.title}</h3>
              {task.priority === "HIGH" && !isCancelled && (
                <Badge variant="destructive" className="text-xs">High</Badge>
              )}
            </div>
            {task.description && (
              <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {task.union && (
                <span className="flex items-center gap-1">
                  <ListTodo className="h-3 w-3" />
                  {task.union.unionName}
                </span>
              )}
              {task.assignee && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {task.assignee.email}
                </span>
              )}
              {task.dueDate && (
                <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button
              variant={statusVariant}
              size="sm"
              onClick={cycleStatus}
              disabled={updating}
              className="cursor-pointer"
              title={isCancelled ? "Click to un-cancel (move back to To Do)" : "Click to cycle status"}
            >
              {updating && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {statusLabel}
            </Button>
            <div className="flex gap-1">
              {!isCancelled && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11"
                  onClick={handleCancel}
                  disabled={updating}
                  title="Cancel task"
                >
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={handleDelete} title="Delete task">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateTaskDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [dueDate, setDueDate] = useState("");
  const [unionId, setUnionId] = useState("none");
  const [assigneeId, setAssigneeId] = useState("none");
  const [creating, setCreating] = useState(false);

  // Load unions + assignees for the dropdowns
  const { data: unionsData } = useFetch<{ unions: Array<{ id: string; unionName: string }> }>("/api/unions");
  const { data: assigneesData } = useFetch<{ users: Assignee[] }>("/api/tasks/assignees");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
      };
      if (unionId !== "none") body.unionId = unionId;
      if (assigneeId !== "none") body.assigneeId = assigneeId;

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create task.");
        return;
      }
      toast.success("Task created.");
      onCreated();
      // Reset form
      setTitle("");
      setDescription("");
      setPriority("NORMAL");
      setDueDate("");
      setUnionId("none");
      setAssigneeId("none");
    } catch {
      toast.error("Network error.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>Track a follow-up, review, or action item.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Review PMWU financial return" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="task-priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="task-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          {unionsData && unionsData.unions.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="task-union">Union (optional)</Label>
              <Select value={unionId} onValueChange={setUnionId}>
                <SelectTrigger id="task-union"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific union</SelectItem>
                  {unionsData.unions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.unionName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {assigneesData && assigneesData.users.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="task-assignee">Assignee (optional)</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger id="task-assignee"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {assigneesData.users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.email} ({u.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={creating}>Cancel</Button>
            <Button type="submit" disabled={creating}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
