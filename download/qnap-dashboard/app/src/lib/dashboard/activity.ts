// =============================================================================
// Activity Selector — chunks 5.1 + 5.2
//
// Pure functions that take raw audit events and produce the shape the Recent
// Activity panel renders. The panel component renders this selector's output
// VERBATIM (per the 3.2b rule: component renders the selector's output, never
// classifies/groups/sorts on its own).
//
// HOME: a sibling module to metrics.ts (also a selector). This module is
// activity-specific; metrics.ts is compliance-specific. They share the
// same pattern: pure selectors that consume raw API data and produce
// render-ready shapes.
//
// INJECTABLE "now" + FROZEN-TIME TESTS:
//   The selector accepts `now: Date = new Date()` for testability, matching
//   the pattern established in 3.1 (NeedsAttention) and used everywhere
//   since (3.3 forecast, 4.2a snapshot). Tests freeze now.
//
// DETERMINISTIC ORDERINGS (no real clock, no implicit sort stability):
//   - stateChanging: by createdAt DESC, ties by actorName ASC
//   - sessionSummaries: by lastAt DESC, ties by user ASC
//   Ties MUST be broken by a stable secondary key — relying on JS sort
//   stability alone is brittle (different engines, different orders).
//   The tiebreakers are explicit and tested.
//
// 5.2 ADDITIVE EXTENSION:
//   Each StateChangingEvent now carries an `eventSeverity: EventSeverity`
//   field, computed by `severityForEvent(action)` from activity-config.ts.
//   The component looks up `entry.eventSeverity` to pick a Badge variant —
//   it does NOT call `severityForEvent` itself (grep guard: no event-type
//   strings in the panel).
// =============================================================================

import {
  isSessionEvent,
  isStateChangeEvent,
  severityForEvent,
  type EventSeverity,
} from "./activity-config";

/**
 * A single audit event, as returned by /api/dashboard/activity.
 * Mirrors the ActivityEntry interface in dashboard.tsx — duplicated here
 * to keep the selector self-contained (the component imports both).
 */
export interface ActivityEvent {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  severity: string;
  createdAt: string; // ISO string (the API serializes Date → string)
}

/**
 * A state-changing event to render as a top-level row.
 *
 * 5.2 ADDITIVE: the `eventSeverity` field. Computed by the selector via
 * `severityForEvent(action)` — the component NEVER calls severityForEvent
 * itself (grep guard: no event-type strings in the panel).
 *
 * The `action` field is preserved verbatim from the raw event (used by the
 * component to look up the human-readable label in ACTION_LABELS — that's
 * a string lookup, not classification, so it doesn't violate the grep
 * guard).
 *
 * NOTE: the raw event also has a `severity: string` field (the AuditLog's
 * server-set INFO/WARNING/CRITICAL value). 5.2 does NOT use that field —
 * the panel renders the event-type-based severity (this `eventSeverity`
 * field, computed from `action`) instead of the AuditLog severity. The
 * raw AuditLog severity remains in `ActivityEvent.severity` for any future
 * consumer that wants it; the panel just ignores it.
 */
export interface StateChangingEvent {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  /** Raw AuditLog severity (INFO/WARNING/CRITICAL) — NOT used by the 5.2 panel. Kept for API completeness. */
  severity: string;
  createdAt: string;
  /**
   * 5.2: event-type-based severity (success/warn/error/neutral), computed
   * from `action` via `severityForEvent`. The panel renders this as the
   * Badge variant. Unknown event types get "neutral" (the safe default).
   */
  eventSeverity: EventSeverity;
}

/**
 * A per-user session summary. One entry per user with ≥1 session event.
 *
 * Shape chosen to render as: "registrar@example.com · 4 sessions · last 3:48 PM"
 *   - user: the actorName (the only user identifier we have for free)
 *   - count: how many session events this user had in the input window
 *   - lastAt: the most recent session event's createdAt (ISO string)
 *
 * Session summaries get NO severity badge (per 5.2 spec: "Session summary
 * lines get NO severity badge (they are not events)"). Their treatment is
 * otherwise unchanged from 5.1.
 *
 * `firstAt` is NOT included — the panel only renders the LAST session time.
 * (Including firstAt would tempt the panel to render "first seen" which
 * is not in the spec; the spec says "last". If 5.2 or 6.2 wants firstAt,
 * add it then — additive, not breaking.)
 */
export interface SessionSummary {
  user: string;
  count: number;
  lastAt: string; // ISO string
}

/**
 * The full result of getActivitySummary — what the panel renders.
 *
 * - stateChanging: top-level rows (rendered first, with existing treatment +
 *   5.2 severity badge)
 * - sessionSummaries: per-user session collapse (rendered after, one line each,
 *   NO severity badge)
 * - totalCount: the total number of raw events the selector consumed (used
 *   for the "View all N" footer — N is the total events available, not the
 *   rendered count, because the Audit page shows ALL events, not just the
 *   window the dashboard fetched).
 */
export interface ActivitySummary {
  stateChanging: StateChangingEvent[];
  sessionSummaries: SessionSummary[];
  /** Total raw events the selector consumed. Used for the "View all N" footer. */
  totalCount: number;
}

/**
 * Compute the activity summary from a list of raw audit events.
 *
 * Pure: no I/O, no DB. Pass events + `now`, get back the render-ready shape.
 *
 * ORDERINGS (deterministic, frozen-time safe):
 *   - stateChanging: by createdAt DESC, ties by actorName ASC.
 *     (Most recent first; if two events have the same timestamp, the
 *     user whose name sorts first wins. Tested with a deliberate-tie
 *     fixture.)
 *   - sessionSummaries: by lastAt DESC, ties by user ASC.
 *
 * 5.2 ADDITIVE: each StateChangingEvent carries `eventSeverity` (computed
 *   from `action` via `severityForEvent`). The component looks up this
 *   field for the Badge variant — it does NOT classify or call
 *   severityForEvent itself.
 *
 * The `now` parameter is accepted for API consistency with other selectors.
 * The current implementation doesn't use `now` for ordering (only for
 * potential 5.2 relative-time computation, but the actual relative-time
 * formatting happens in the component via `formatEventRelative(date, now)`
 * — the selector preserves `createdAt` as ISO strings, not pre-formatted).
 *
 * @param events  Raw audit events from /api/dashboard/activity (already
 *                capped by the endpoint at 20 today — see 5.1 handoff for
 *                the cap-finding note).
 * @param now    Injectable "now" for testability.
 * @returns ActivitySummary with state-changing events (each carrying
 *          eventSeverity) + per-user session summaries, both
 *          deterministically ordered.
 */
export function getActivitySummary(
  events: ActivityEvent[],
  _now: Date = new Date(),
): ActivitySummary {
  // --- 1. Partition: session vs stateChange -------------------------------
  // Use the inverted classifier from activity-config.ts. Unknown types
  // fall into stateChange (the safe default — see activity-config header).
  // For state-changing events, attach the 5.2 severity (computed from the
  // action type via severityForEvent — the component reads this field, it
  // never calls severityForEvent itself).
  const sessionEvents: ActivityEvent[] = [];
  const stateChangingEvents: StateChangingEvent[] = [];
  for (const e of events) {
    if (isSessionEvent(e.action)) {
      sessionEvents.push(e);
    } else if (isStateChangeEvent(e.action)) {
      // 5.2: attach severity. isStateChangeEvent is true here (the else-if
      // guards it), so we promote the raw ActivityEvent to a StateChangingEvent
      // with the computed eventSeverity field. Unknown types flow through
      // here too — severityForEvent returns "neutral" for unknowns.
      stateChangingEvents.push({
        ...e,
        eventSeverity: severityForEvent(e.action),
      });
    }
    // (classifyEvent is exhaustive: every event is either session or
    // stateChange. The `else if` is belt-and-suspenders — the final else
    // branch is unreachable. No event is dropped.)
  }

  // --- 2. Sort stateChanging: createdAt DESC, ties by actorName ASC -----
  // localeCompare for stable, locale-aware sorting of actor names.
  stateChangingEvents.sort((a, b) => {
    const aMs = new Date(a.createdAt).getTime();
    const bMs = new Date(b.createdAt).getTime();
    if (aMs !== bMs) return bMs - aMs; // DESC
    return a.actorName.localeCompare(b.actorName); // ASC tiebreaker
  });

  // --- 3. Build per-user session summaries --------------------------------
  // Group session events by actorName. For each user, compute count + lastAt.
  // The Map preserves insertion order in JS, but we'll sort at the end
  // anyway — don't rely on insertion order.
  const byUser = new Map<string, { count: number; lastAtMs: number; lastAtIso: string }>();
  for (const e of sessionEvents) {
    const existing = byUser.get(e.actorName);
    const eMs = new Date(e.createdAt).getTime();
    if (!existing) {
      byUser.set(e.actorName, { count: 1, lastAtMs: eMs, lastAtIso: e.createdAt });
    } else {
      existing.count++;
      if (eMs > existing.lastAtMs) {
        existing.lastAtMs = eMs;
        existing.lastAtIso = e.createdAt;
      }
    }
  }

  // --- 4. Build sessionSummaries array + sort: lastAt DESC, ties by user ASC
  const sessionSummaries: SessionSummary[] = [];
  for (const [user, agg] of byUser) {
    sessionSummaries.push({
      user,
      count: agg.count,
      lastAt: agg.lastAtIso,
    });
  }
  sessionSummaries.sort((a, b) => {
    const aMs = new Date(a.lastAt).getTime();
    const bMs = new Date(b.lastAt).getTime();
    if (aMs !== bMs) return bMs - aMs; // DESC
    return a.user.localeCompare(b.user); // ASC tiebreaker
  });

  return {
    stateChanging: stateChangingEvents,
    sessionSummaries,
    totalCount: events.length,
  };
}

/**
 * Default cap on total visible rows in the Recent Activity panel.
 *
 * The panel renders stateChanging rows first, then sessionSummaries. The
 * cap is applied to the TOTAL (stateChanging.length + sessionSummaries.length)
 * — if the combined count exceeds CAP, the panel cuts cleanly at the cap
 * boundary. Summaries may straddle the cap (e.g. 4 stateChanging + 4
 * summaries = 8, cap = 6 → render 4 stateChanging + 2 summaries, the
 * remaining 2 are cut).
 *
 * "Cut cleanly, never truncate a line mid-content" — the cap operates on
 * whole rows, never on a row's text.
 *
 * Suggested 6 per the chunk spec. 6.2 may tune.
 */
export const RECENT_ACTIVITY_ROW_CAP = 6;
