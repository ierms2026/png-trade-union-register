"use client";

import { useState, type FormEvent } from "react";
import { ListTodo, Plus, Trash2, Loader2, User } from "lucide-react";
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
import { EmptyState } from "@/components/app/empty-state";

// =============================================================================
// Tasks view — task list with click-to-cycle status + create dialog.
//
// FEATURES:
//   - List tasks (role-scoped: Officers see their union's + assigned tasks)
//   - Click a task's status badge to cycle: PENDING → IN_PROGRESS → COMPLETED
//   - Create new task (with assignee dropdown for Registrars)
//   - Delete a task (Officers: own tasks only; Registrars: any)
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

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PENDING: { label: "Pending", variant: "secondary" },
  IN_PROGRESS: { label: "In Progress", variant: "default" },
  COMPLETED: { label: "Completed", variant: "outline" },
};

const STATUS_CYCLE: Record<string, string> = {
  PENDING: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
  COMPLETED: "PENDING",
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

  async function cycleStatus() {
    const next = STATUS_CYCLE[task.status];
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
      toast.success(`Task moved to ${STATUS_CONFIG[next]?.label ?? next}.`);
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

  const cfg = STATUS_CONFIG[task.status] ?? { label: task.status, variant: "outline" as const };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{task.title}</h3>
              {task.priority === "HIGH" && (
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
              variant={cfg.variant}
              size="sm"
              onClick={cycleStatus}
              disabled={updating}
              className="cursor-pointer"
              title="Click to cycle status"
            >
              {updating && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {cfg.label}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
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
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Label>Union (optional)</Label>
              <Select value={unionId} onValueChange={setUnionId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Label>Assignee (optional)</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
