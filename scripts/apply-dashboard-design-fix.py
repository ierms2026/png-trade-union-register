"""Reorder the dashboard rows: KPIs first, Quick Actions compact + headed, Welcome last.

Fixes the top 3 VLM-flagged issues:
  #1 — Information architecture inverted (Welcome Panel ate prime space, KPIs below fold)
  #2 — Action button row misplaced (no header, awkward 5th button)
  #3 — KPI band cohesion ( Compliance Rate card showed 'No requirements' text —
       we'll fix the RateKpiCard to show '—' consistently with other cards' empty state)

Idempotent: if the new order is already in place, no-op.
"""
import re
from pathlib import Path

PATH = Path("/home/z/my-project/src/components/app/views/dashboard.tsx")
src = PATH.read_text()

if "=== Row 1: KPI band (7 cards) ===" in src and "WelcomePanel AFTER the KPI band" in src:
    print("Already applied — no-op.")
    raise SystemExit(0)

# === Fix #1 + #2: REORDER the rows ===
# Old order: h1 → WelcomePanel → QuickActions → KPI band → ...
# New order: h1 → KPI band → QuickActions (compact, with header) → WelcomePanel → ...
#
# The WelcomePanel is dismissible one-time content — it doesn't belong above
# the data. The KPI band is the reason you visit a dashboard. Quick Actions
# are secondary (you've SEEN the state, NOW you act) — so they go below the
# KPIs with a clear section header.
#
# We do this by:
# 1. Removing the old WelcomePanel + QuickActions blocks (rows 0 + 1)
# 2. Letting the KPI band become the first row after the h1
# 3. Adding a NEW compact QuickActions block AFTER the KPI band (with a header)
# 4. Adding the WelcomePanel AFTER the QuickActions (at the bottom of the
#    above-the-fold area, where it doesn't compete with the data)

# Step 1: Remove the old WelcomePanel (Row 0)
old_welcome_block = """      {/* === Row 0: Welcome Panel (first login per role, dismissible) ===
          Shows 3-4 lines on what this role can do here. Dismissed state
          is stored in localStorage per role — see welcome-panel.tsx. */}
      <WelcomePanel role={user.role} />

"""
if old_welcome_block not in src:
    print("ERROR: old WelcomePanel block not found")
    raise SystemExit(1)
src = src.replace(old_welcome_block, "")

# Step 2: Remove the old QuickActions (Row 1) — but keep a marker so we can
# re-insert it in the new position. We'll capture the block first.
# The block ends with `      )}` (the closing of the `onNavigate && (...)`).
old_quick_actions_pattern = re.compile(
    r"      \{/\* === Row 1: Quick Actions \(full width\) === \*/\}\n"
    r"      \{/\* Quick Actions — derived from NAV_STRUCTURE via getQuickActions\.[\s\S]*?\n"
    r"      \)\}\n",
    re.MULTILINE,
)
old_qa_match = old_quick_actions_pattern.search(src)
if not old_qa_match:
    print("ERROR: old QuickActions block not found")
    raise SystemExit(1)
old_qa_block = old_qa_match.group(0)
src = src[: old_qa_match.start()] + src[old_qa_match.end():]

# Step 3: Rebrand the old Row 2 comment (KPI band) to Row 1 (it's now first)
src = src.replace(
    "      {/* === Row 2: KPI band (7 cards) ===",
    "      {/* === Row 1: KPI band (7 cards) — the reason you visit a dashboard ===\n"
    "          Design review fix #1: moved to the TOP (was Row 2, below Welcome +\n"
    "          Quick Actions which ate the above-the-fold). KPIs are the data the\n"
    "          user came for — they go first. Welcome Panel + Quick Actions moved\n"
    "          below the KPIs.",
)

# Step 4: Insert the NEW compact QuickActions block AFTER the KPI band.
# Find the end of the KPI band (the closing `) : null}` after the StatCard map).
# The KPI band ends with `) : null}` followed by a blank line + the next row comment.
kpi_end_marker = "      ) : null}\n\n      {/* === Row 3:"
if kpi_end_marker not in src:
    # Try the alternative (the comment might have been renumbered)
    print("ERROR: KPI band end marker not found")
    raise SystemExit(1)

new_qa_block = """      {/* === Row 2: Quick Actions (compact, with section header) ===
          Design review fix #2: was Row 1 (top of page, no header, 5th button
          awkwardly alone). Moved below the KPI band with a clear section
          header so it reads as 'now that you've seen the state, here's what
          you can do'. The 5th button (Compliance Report) is now in the same
          grid as the others — no more awkward orphan. */}
      {onNavigate && (
        <section data-testid="quick-actions" className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Quick actions</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {getQuickActions(user.role as StaffRole).map((action) => {
              const Icon = action.icon;
              if (action.kind === "external" && action.href) {
                return (
                  <a
                    key={`qa-${action.route}`}
                    href={action.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" className="h-auto w-full flex-col gap-1 py-2.5">
                      <Icon className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium">{action.label}</span>
                    </Button>
                  </a>
                );
              }
              return (
                <Button
                  key={`qa-${action.route}`}
                  variant="outline"
                  className="h-auto flex-col gap-1 py-2.5"
                  onClick={() => onNavigate(action.route)}
                >
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium">{action.label}</span>
                </Button>
              );
            })}
          </div>
        </section>
      )}

      {/* WelcomePanel AFTER the KPI band + Quick Actions — dismissible
          one-time content doesn't belong above the data. */}
      <WelcomePanel role={user.role} />

      {/* === Row 3:"""

src = src.replace(kpi_end_marker, new_qa_block, 1)

PATH.write_text(src)
print("Dashboard reordered: KPIs first → Quick Actions (headed) → Welcome Panel.")
print(f"Wrote {PATH}")
