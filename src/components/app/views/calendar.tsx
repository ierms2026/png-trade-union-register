"use client";

import { useState, useMemo } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFetch } from "@/components/app/use-fetch";
import { CalendarSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";

// =============================================================================
// Calendar view — monthly grid with 4 tabs (all/documents/tasks/compliance).
//
// Shows events for the selected month. The `tab` query param filters
// which event types are shown. Events are grouped by day; each day cell
// shows its events as colored badges.
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
  task: "bg-blue-100 text-blue-800 border-blue-200",
  document: "bg-purple-100 text-purple-800 border-purple-200",
  compliance: "bg-amber-100 text-amber-800 border-amber-200",
};

export function CalendarView() {
  const [tab, setTab] = useState<Tab>("all");
  const [currentDate, setCurrentDate] = useState(new Date());

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
    const startWeekday = firstDay.getDay(); // 0 = Sunday
    const totalDays = lastDay.getDate();
    const cells: Array<{ day: number | null; dateStr: string | null }> = [];
    // Leading empty cells
    for (let i = 0; i < startWeekday; i++) {
      cells.push({ day: null, dateStr: null });
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, dateStr });
    }
    // Trailing empty cells to fill the last week
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

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }
  function goToToday() {
    setCurrentDate(new Date());
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground">Tasks, document uploads, and compliance events.</p>
      </div>

      {/* Tabs + month navigation */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-md border p-1">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[140px] text-center text-sm font-medium">
            {new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </div>
          <Button variant="outline" size="icon" onClick={nextMonth}>
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
                  return <div key={i} className="aspect-square min-h-[80px] rounded border border-dashed border-muted" />;
                }
                const dayEvents = eventsByDate.get(cell.dateStr) ?? [];
                const isToday = cell.dateStr === todayStr;
                return (
                  <div
                    key={i}
                    className={`aspect-square min-h-[80px] rounded border p-1.5 ${
                      isToday ? "border-primary bg-primary/5" : "border-muted"
                    }`}
                  >
                    <div className={`mb-1 text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                      {cell.day}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((e, j) => (
                        <div
                          key={j}
                          className={`truncate rounded border px-1 py-0.5 text-[10px] ${EVENT_COLORS[e.type]}`}
                          title={e.title}
                        >
                          {e.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-muted-foreground">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
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
      </div>
    </div>
  );
}
