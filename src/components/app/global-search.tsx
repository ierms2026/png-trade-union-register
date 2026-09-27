"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Building2,
  FileText,
  ListTodo,
  ScrollText,
  Users,
  LayoutDashboard,
  CheckCircle2,
  Settings2,
  GitCompare,
  Calendar,
  Archive,
  Shield,
  Key,
  Search,
  Loader2,
} from "lucide-react";

// =============================================================================
// GlobalSearch — Cmd+K command palette.
//
// Searches across the entire application from any screen. Results are grouped:
//   - Navigation: jump to any view
//   - Unions: name, registration no, file number → navigate to union detail
//   - Tasks: title, description → navigate to Tasks
//   - Audit: action, actor → navigate to Audit Log
//   - Users: email, role → navigate to Users
//
// Data is pre-loaded on mount (lightweight: unions list + tasks list).
// Audit entries are NOT pre-loaded (too many) — the user types and the
// palette filters the pre-loaded data client-side.
//
// Open: Cmd+K (Mac) or Ctrl+K (Windows/Linux)
// Close: Escape or click outside
// =============================================================================

interface Union {
  id: string;
  unionName: string;
  registrationNo: string;
  fileNumber: string | null;
  status: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
}

interface UserEntry {
  id: string;
  email: string;
  role: string;
}

interface NavEntry {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const ALL_NAV_ENTRIES: NavEntry[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "unions", label: "Unions / My Union", icon: Building2 },
  { id: "compliance", label: "Compliance Matrix", icon: CheckCircle2 },
  { id: "configure-rules", label: "Configure Rules", icon: Settings2 },
  { id: "compare", label: "Compare Unions", icon: GitCompare },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "audit", label: "Audit Log", icon: ScrollText },
  { id: "retention", label: "Retention Queue", icon: Archive },
  { id: "users", label: "Users", icon: Users },
  { id: "security", label: "Security Dashboard", icon: Shield },
  { id: "api-keys", label: "API Keys", icon: Key },
];

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (view: string, params?: { unionId?: string }) => void;
  userRole: string;
}

export function GlobalSearch({ open, onOpenChange, onNavigate, userRole }: GlobalSearchProps) {
  const [unions, setUnions] = useState<Union[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserEntry[]>([]);
  // Chunk 6: document-content search state
  const [searchQuery, setSearchQuery] = useState("");
  const [docResults, setDocResults] = useState<Array<{
    documentId: string;
    documentType: string;
    unionName: string;
    snippet: string;
  }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Pre-load data on mount — lightweight payloads
  const loadData = useCallback(async () => {
    // Fetch unions (always available)
    fetch("/api/unions", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.unions) {
          setUnions(data.unions.map((u: Union) => ({
            id: u.id,
            unionName: u.unionName,
            registrationNo: u.registrationNo,
            fileNumber: u.fileNumber,
            status: u.status,
          })));
        }
      })
      .catch(() => {});

    // Fetch tasks (Registrar + Officer only)
    if (userRole === "REGISTRAR" || userRole === "OFFICER") {
      fetch("/api/tasks", { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.tasks) setTasks(data.tasks);
        })
        .catch(() => {});
    }

    // Fetch users (Registrar only — defense in depth: /api/users returns 403 for others)
    if (userRole === "REGISTRAR") {
      fetch("/api/users", { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.users) setUsers(data.users);
        })
        .catch(() => {});
    }
  }, [userRole]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Chunk 6: debounced document-content search.
  //
  // When the user types 2+ chars, hit /api/search and show the top 5
  // document matches in a "Document content" group. Selecting a result
  // navigates to the full /search view with that query.
  //
  // 300ms debounce — avoids hammering the API on every keystroke. The
  // rate limit (30/min) would kick in otherwise.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setDocResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          // Top 5 only — the palette is for quick jumps; the full /search
          // view shows all 50.
          setDocResults((data.results ?? []).slice(0, 5));
        } else {
          setDocResults([]);
        }
      } catch {
        setDocResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter nav entries by role
  const navEntries = ALL_NAV_ENTRIES.filter((entry) => {
    if (userRole === "OFFICER") {
      return ["dashboard", "unions", "compliance", "tasks", "calendar"].includes(entry.id);
    }
    if (userRole === "INSPECTOR") {
      return ["dashboard", "unions", "compliance", "compare", "calendar", "audit", "retention"].includes(entry.id);
    }
    return true; // REGISTRAR sees all
  });

  function handleSelect(value: string) {
    onOpenChange(false);

    // Parse the value: "nav:dashboard" or "union:abc123" or "task:xyz" or "user:id"
    // or "doc:<documentId>" (chunk 6) or "search:full" (chunk 6 — jump to /search)
    const [type, id] = value.split(":");

    switch (type) {
      case "nav":
        onNavigate(id);
        break;
      case "union":
        onNavigate("unions", { unionId: id });
        break;
      case "task":
        onNavigate("tasks");
        break;
      case "user":
        onNavigate("users");
        break;
      case "doc":
        // Navigate to the full search view with the current query — the
        // user can see all results there, not just the top 5.
        onNavigate("search");
        break;
      case "search":
        // "Search all documents for '<query>'" — jump to the full /search view
        onNavigate("search");
        break;
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search documents, unions, tasks, users, or jump to a view..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Document content search (chunk 6) — shown when query is 2+ chars */}
        {searchQuery.trim().length >= 2 && (
          <CommandGroup heading="Document Content">
            {searchLoading ? (
              <CommandItem disabled>
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Searching documents...</span>
              </CommandItem>
            ) : docResults.length === 0 ? (
              <CommandItem disabled>
                <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  No documents match &ldquo;{searchQuery}&rdquo;
                </span>
              </CommandItem>
            ) : (
              <>
                {docResults.map((doc) => (
                  <CommandItem
                    key={doc.documentId}
                    // Include the snippet in the value so cmdk's client-side
                    // filter matches against it. Without this, typing "award
                    // variation" would filter out a document whose value is
                    // just "doc:abc Registration Certificate Papua Maritime"
                    // (no match) — even though the snippet contains "award
                    // variation". The value is never shown to the user.
                    value={`doc:${doc.documentId} ${doc.documentType} ${doc.unionName} ${doc.snippet}`}
                    onSelect={handleSelect}
                  >
                    <FileText className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{doc.documentType}</span>
                      <span className="text-xs text-muted-foreground">{doc.unionName}</span>
                      <span className="truncate text-xs text-muted-foreground italic">
                        {doc.snippet}
                      </span>
                    </div>
                  </CommandItem>
                ))}
                <CommandItem
                  value={`search:full ${searchQuery}`}
                  onSelect={handleSelect}
                >
                  <Search className="mr-2 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-primary">
                    Search all documents for &ldquo;{searchQuery}&rdquo;...
                  </span>
                </CommandItem>
              </>
            )}
          </CommandGroup>
        )}

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          {navEntries.map((entry) => {
            const Icon = entry.icon;
            return (
              <CommandItem
                key={entry.id}
                value={`nav:${entry.id}`}
                onSelect={handleSelect}
              >
                <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{entry.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {/* Unions */}
        {unions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Unions (${unions.length})`}>
              {unions.map((union) => (
                <CommandItem
                  key={union.id}
                  value={`union:${union.id} ${union.unionName} ${union.registrationNo} ${union.fileNumber || ""}`}
                  onSelect={handleSelect}
                >
                  <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{union.unionName}</span>
                    <span className="text-xs text-muted-foreground">
                      {union.registrationNo}
                      {union.fileNumber ? ` · ${union.fileNumber}` : ""}
                      {" · "}Status: {union.status}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Tasks */}
        {tasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Tasks (${tasks.length})`}>
              {tasks.map((task) => (
                <CommandItem
                  key={task.id}
                  value={`task:${task.id} ${task.title} ${task.description || ""}`}
                  onSelect={handleSelect}
                >
                  <ListTodo className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{task.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {task.status.replace(/_/g, " ")} · {task.priority}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Users */}
        {users.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Users (${users.length})`}>
              {users.map((user) => (
                <CommandItem
                  key={user.id}
                  value={`user:${user.id} ${user.email} ${user.role}`}
                  onSelect={handleSelect}
                >
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{user.email}</span>
                    <span className="text-xs text-muted-foreground">{user.role}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>

      {/* Footer hint */}
      <div className="border-t pt-2 pb-1 px-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Search className="h-3 w-3" />
            <span>Search across unions, tasks, users, and navigation</span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">↵</kbd>
            <span>to select</span>
            <kbd className="ml-2 rounded border bg-muted px-1.5 py-0.5 text-[10px]">esc</kbd>
            <span>to close</span>
          </div>
        </div>
      </div>
    </CommandDialog>
  );
}
