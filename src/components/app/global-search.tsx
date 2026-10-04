"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Building2,
  FileText,
  ListTodo,
  Users,
  Search,
  Loader2,
} from "lucide-react";
import { getPaletteEntries, type PaletteEntry, type StaffRole } from "@/lib/dashboard/nav-structure";

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



interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (view: string, params?: { unionId?: string; query?: string; documentId?: string }) => void;
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

  // --- Navigation entries — derived from NAV_STRUCTURE (single source of
  // truth). The role filter is handled by getPaletteEntries, so the palette
  // can NEVER offer a destination the menu hides. Aliases are included in
  // the cmdk `value` so old names (e.g. "Compliance Matrix", "Legislation")
  // still match — but only the canonical label is shown to the user.
  const navEntries = useMemo<PaletteEntry[]>(
    () => getPaletteEntries(userRole as StaffRole),
    [userRole],
  );

  function handleSelect(value: string) {
    onOpenChange(false);

    // Parse the value: "nav:dashboard" or "union:abc123 extra text" or
    // "doc:<documentId> <documentType> <unionName> <snippet>" etc.
    // The type is before the first colon; the id is the first token after
    // the colon (up to the first space). Extra text after the id is for
    // cmdk's client-side filtering only — it's never used for navigation.
    const colonIdx = value.indexOf(":");
    const type = colonIdx >= 0 ? value.slice(0, colonIdx) : value;
    const rest = colonIdx >= 0 ? value.slice(colonIdx + 1) : "";
    const spaceIdx = rest.indexOf(" ");
    const id = spaceIdx >= 0 ? rest.slice(0, spaceIdx) : rest;

    switch (type) {
      case "nav":
        onNavigate(id);
        break;
      case "union":
        // Carry the unionId through so the union detail opens directly
        onNavigate("unions", { unionId: id });
        break;
      case "task":
        onNavigate("tasks");
        break;
      case "user":
        onNavigate("users");
        break;
      case "doc":
        // Navigate directly to the document detail page
        onNavigate("document-detail", { documentId: id });
        break;
      case "search":
        // Carry the typed query through so the search page opens with results
        onNavigate("search", { query: searchQuery });
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

        {/* Navigation — derived from NAV_STRUCTURE via getPaletteEntries.
            The cmdk `value` includes the canonical label + all aliases so
            old names (e.g. "Compliance Matrix", "Legislation") still match
            fuzzy search. Only the canonical `entry.label` is rendered. */}
        <CommandGroup heading="Navigation">
          {navEntries.map((entry) => {
            const Icon = entry.icon;
            // Build the cmdk value: "nav:<route> <label> <alias1> <alias2>..."
            // The route is the first token (parsed by handleSelect); the
            // rest is for cmdk's client-side fuzzy filter. Aliases are
            // NEVER shown to the user — they're search-only.
            const aliasText = entry.aliases.join(" ");
            const value = `nav:${entry.route} ${entry.label} ${aliasText}`.trim();
            return (
              <CommandItem
                key={entry.route}
                value={value}
                onSelect={handleSelect}
              >
                <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <div className="flex min-w-0 flex-col">
                  <span>{entry.label}</span>
                  {/* Secondary hint: the group the destination lives under.
                      Helps disambiguate when two destinations have similar
                      labels (e.g. "Compliance" the page vs "Compliance" the
                      group). Small + muted so it doesn't compete with the
                      label. */}
                  <span className="text-xs text-muted-foreground">{entry.groupLabel}</span>
                </div>
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
