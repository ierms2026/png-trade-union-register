"use client";

import { useState, useMemo } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFetch } from "@/components/app/use-fetch";
import { CalendarSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";

// =============================================================================
// Calendar view — monthly grid with 4 tabs (all/documents/tasks/compliance).
//
// Enhanced: events are clickable (drill-through to the source view) + days
// with 4+ events open a detail dialog showing all events for that day.
// =============================================================================

type Tab = "all" | "documents" | "tasks" | "compliance";

interface CalendarEvent {
  date: string; // YYYY-MM-DD
  type: "task" | "document" | "compliance";
  title: string;
  id: string;
  meta?: Record<string, unknown>;
}

const TAB_LABELS: Record<Tab, string> = {
  all: "All",
  documents: "Documents",
  tasks: "Tasks",
  compliance: "Compliance",
};

const EVENT_COLORS: Record<string, string> = {
  // STEP 6 (polish): WCAG-AA-compliant tailwind color pairs (was chart
  // tokens + accent tokens — failed contrast). These are tiny 10px pills
  // so AA (4.5:1) is the right target.
  task: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900",
  document: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
  compliance: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900",
};

const EVENT_DOT_COLORS: Record<string, string> = {
  task: "bg-primary",
  document: "bg-chart-4",
  compliance: "bg-accent",
};

// Where each event type navigates when clicked
const EVENT_LINKS: Record<string, string> = {
  task: "/?view=tasks",
  document: "/?view=unions",
  compliance: "/?view=compliance",
};

export function CalendarView({ onNavigate }: { onNavigate?: (view: string, params?: { unionId?: string; unionTab?: string }) => void }) {
  const [tab, setTab] = useState<Tab>("all");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<{ dateStr: string; events: CalendarEvent[] } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  const { data, loading, error, refetch } = useFetch<{ events: CalendarEvent[] }>(
    `/api/calendar?tab=${tab}&month=${monthStr}`,
  );

  // Build the calendar grid: weeks starting Sunday.
  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const cells: Array<{ day: number | null; dateStr: string | null }> = [];
    for (let i = 0; i < startWeekday; i++) {
      cells.push({ day: null, dateStr: null });
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, dateStr });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: null, dateStr: null });
    }
    return cells;
  }, [year, month]);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of data?.events ?? []) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [data]);

  // Whether the currently-loaded month has zero events. Used to show an
  // inline "no events this month" notice above the grid (the grid still
  // renders, so the user can see the month shape — but the notice tells
  // them there's nothing on the schedule and what to do next).
  const hasNoEventsThisMonth = !loading && !error && (data?.events?.length ?? 0) === 0;

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }
  function goToToday() {
    setCurrentDate(new Date());
  }

  function handleEventClick(e: CalendarEvent) {
    // IA-2: deep-link to the right union tab when the event has a unionId.
    // Falls back to the bare view if no unionId in meta.
    if (onNavigate) {
      const meta = e.meta as Record<string, unknown> | undefined;
      const unionId = typeof meta?.unionId === "string" ? meta.unionId : null;
      if (e.type === "task") {
        if (unionId) onNavigate("unions", { unionId, unionTab: "tasks" });
        else onNavigate("tasks");
      } else if (e.type === "document") {
        if (unionId) onNavigate("unions", { unionId, unionTab: "documents" });
        else onNavigate("unions");
      } else if (e.type === "compliance") {
        if (unionId) onNavigate("unions", { unionId, unionTab: "compliance" });
        else onNavigate("compliance");
      }
    }
  }

  function handleDayClick(dateStr: string, events: CalendarEvent[]) {
    if (events.length > 0) {
      setSelectedDay({ dateStr, events });
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground">Tasks, document uploads, and compliance events. Click an event to navigate to its source.</p>
      </div>

      {/* Tabs + month navigation */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Wave 4 / a11y #8: calendar tab bar uses ARIA tablist pattern
            (role=tablist + role=tab + aria-selected + roving tabIndex).
            Also adds focus-visible:ring-2 (was missing — keyboard users
            had no visible focus indicator). */}
        <div className="flex gap-1 rounded-md border p-1" role="tablist" aria-label="Calendar view types">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[140px] text-center text-sm font-medium">
            {new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </div>
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToToday}>Today</Button>
        </div>
      </div>

      {loading ? (
        <CalendarSkeleton />
      ) : error ? (
        <ErrorState description={error} onRetry={refetch} />
      ) : (
        <>
        {hasNoEventsThisMonth && (
          <div
            data-testid="calendar-empty-notice"
            className="rounded-md border border-dashed border-muted bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
          >
            <span className="font-medium text-foreground">No events this month.</span>{" "}
            Document renewals, task due dates, and compliance milestones will appear here as they are scheduled.
            Try a different tab (Documents / Tasks / Compliance) or use the prev/next buttons to look at other months.
          </div>
        )}
        <Card>
          <CardContent className="p-4">
            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-1 border-b pb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1 pt-2">
              {days.map((cell, i) => {
                if (!cell.dateStr) {
                  return <div key={i} className="aspect-square min-h-[80px] rounded border border-dashed border-muted" aria-hidden="true" />;
                }
                const dayEvents = eventsByDate.get(cell.dateStr) ?? [];
                const isToday = cell.dateStr === todayStr;
                // Wave 4 / a11y #2: convert <div onClick> → <button type="button">
                // so day cells are natively focusable + Enter/Space-activated
                // (WCAG 2.1.1 Keyboard). Even days with no events get a
                // button (so SR users can explore the grid uniformly); the
                // aria-label differentiates empty vs event-bearing days.
                return (
                  <button
                    key={i}
                    type="button"
                    className={`aspect-square min-h-[80px] rounded border p-1.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isToday ? "border-primary bg-primary/5" : "border-muted"
                    } ${dayEvents.length > 0 ? "cursor-pointer hover:border-foreground/30 hover:bg-muted/30" : ""}`}
                    onClick={() => handleDayClick(cell.dateStr!, dayEvents)}
                    aria-label={`${cell.dateStr}${dayEvents.length > 0 ? ` — ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : " — no events"}`}
                    aria-current={isToday ? "date" : undefined}
                  >
                    <div className={`mb-1 text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                      {cell.day}
                      {dayEvents.length > 0 && (
                        <span className="ml-1 inline-flex h-3 min-w-3 items-center justify-center rounded-full bg-muted px-1 text-[9px] font-semibold text-muted-foreground">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((e, j) => (
                        // Wave 4 / a11y #2: event chips are also <button>
                        // (not <div onClick>) so they're keyboard-focusable
                        // + Enter-activated. stopPropagation prevents the
                        // day-cell onClick from also firing.
                        <button
                          key={j}
                          type="button"
                          className={`block w-full truncate rounded border px-1 py-0.5 text-left text-[10px] cursor-pointer hover:brightness-110 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring ${EVENT_COLORS[e.type]}`}
                          title={e.title}
                          aria-label={`${e.title} — ${e.type}${e.meta?.unionName ? ` · ${e.meta.unionName}` : ""}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            handleEventClick(e);
                          }}
                        >
                          {e.title}
                        </button>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-muted-foreground hover:text-foreground" aria-hidden="true">
                          +{dayEvents.length - 3} more...
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
        </>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(EVENT_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className={`inline-flex rounded border px-2 py-0.5 ${color}`}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </span>
          </div>
        ))}
        <span className="text-muted-foreground">Click an event to navigate to its source view. Click a day to see all events.</span>
      </div>

      {/* Day detail dialog */}
      <Dialog open={!!selectedDay} onOpenChange={(open) => { if (!open) setSelectedDay(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedDay ? new Date(selectedDay.dateStr + "T12:00:00Z").toLocaleDateString("en-US", {
                weekday: "long", year: "numeric", month: "long", day: "numeric",
              }) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {selectedDay?.events.map((e, i) => (
              // Wave 4 / a11y #2: event rows in the day-detail dialog are
              // <button> (not <div onClick>) so they're keyboard-focusable +
              // Enter-activated. Each has an aria-label with the event title
              // + type + union (so SR users get the full context without
              // reading the nested <p> elements).
              <button
                key={i}
                type="button"
                className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left cursor-pointer hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${EVENT_COLORS[e.type]}`}
                aria-label={`${e.title} — ${e.type}${e.meta?.status ? ` · ${e.meta.status}` : ""}${e.meta?.unionName ? ` · ${e.meta.unionName}` : ""}`}
                onClick={() => {
                  handleEventClick(e);
                  setSelectedDay(null);
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.title}</p>
                  <p className="text-xs opacity-70 capitalize">
                    {e.type}
                    {e.meta?.status ? ` · ${e.meta.status}` : ""}
                    {e.meta?.unionName ? ` · ${e.meta.unionName}` : ""}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
