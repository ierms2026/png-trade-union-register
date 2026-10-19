#!/usr/bin/env python3
"""Rewrite renderHero + renderSearch in public-portal.tsx with the design fixes.

Edits the file in place. Idempotent: if the new content is already present,
the script is a no-op.
"""
import re
from pathlib import Path

PATH = Path("/home/z/my-project/src/components/app/public-portal.tsx")
src = PATH.read_text()

# Detect if already applied (idempotent guard)
if "text-5xl font-bold tracking-tight" in src:
    print("Already applied — no-op.")
    raise SystemExit(0)

# === Fix #1 + #2: rewrite renderHero ===
# Match from "function renderHero() {" to the closing "}" at column 2.
# Use a non-greedy match up to the line "    }\n" that ends the function.
new_hero = '''  function renderHero() {
    // Calculate the real "last updated" date from the most recent union
    // updatedAt timestamp — not today's date.
    const all = allUnions?.unions ?? [];
    const lastUpdated = all.length > 0
      ? new Date(Math.max(...all.map((u) => new Date(u.updatedAt).getTime()))).toLocaleDateString("en-PG", { year: "numeric", month: "long", day: "numeric" })
      : null;
    // Design review fix #1 (focal point) + #2 (type hierarchy):
    // The hero was 7 competing elements (badge + h1 + 2 paragraphs + last-
    // updated + legal citation + 2 inline links). Cut to 3 elements: a
    // quiet official eyebrow, the h1 (now clearly dominant at 5xl), and ONE
    // supporting line. The legal citation moves to the footer; the inline
    // links duplicate the nav bar (already there as Resources / About tabs).
    return (
      <div className="space-y-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <Image src="/coat-of-arms.png" alt="National Emblem of Papua New Guinea" width={32} height={26} className="h-8 w-auto" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/5 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-accent-foreground">
            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z" /><path d="M9 12l2 2 4-4" /></svg>
            Office of The Industrial Registrar
          </span>
        </div>
        {/* Type hierarchy fix: h1 is now 5xl + tight tracking — clearly
            dominant. Was text-4xl which is only ~1.5x the body text (text-lg),
            so the headline didn't read as the page title. */}
        <h1 className="text-5xl font-bold tracking-tight">Register of Trade Unions</h1>
        {/* ONE supporting line at text-base (down from text-lg) so it
            clearly steps down from the h1. The Industrial Organizations
            Act link is inline — the legal citation + "View resources" /
            "About" CTAs are removed (they duplicate the nav bar). The
            last-updated date is merged into this line as a quiet suffix. */}
        <p className="mx-auto max-w-2xl text-base text-muted-foreground">
          The official public list of trade unions registered under the{" "}
          <a href="/legislation/industrial-relations-act-1962.pdf" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline decoration-accent decoration-2 underline-offset-4 hover:decoration-accent/60">Industrial Organizations Act</a>
          {lastUpdated && <> · <span className="text-muted-foreground/70">Last updated {lastUpdated}</span></>}
        </p>
      </div>
    );
  }
'''

# Match the entire existing renderHero function. The function ends with
# "  }\n" on its own line, followed by a blank line.
hero_pattern = re.compile(
    r'  function renderHero\(\) \{[\s\S]*?\n  \}\n',
    re.MULTILINE,
)
match = hero_pattern.search(src)
if not match:
    print("ERROR: could not find renderHero function")
    raise SystemExit(1)
src = src[: match.start()] + new_hero + src[match.end():]
print("renderHero rewritten.")

# === Fix #3a: rebuild the status key as a clean legend ===
# The old status key was 3 entries crammed into one row at text-xs inside a
# single bordered box. Replace with a vertical legend (one row per status)
# inside the same box, with the icon + label + plain-language description
# stacked clearly.
new_search_intro_and_key = '''  function renderSearch() {
    return (
      <div className="space-y-6">
        <div className="space-y-1.5 text-center">
          {/* Type hierarchy fix: h2 is now text-2xl (was text-lg) so it
              clearly steps down from the h1 (text-5xl) and clearly above
              body text (text-base). Description at text-sm + muted. */}
          <h2 className="text-2xl font-semibold tracking-tight">Registered Unions</h2>
          <p className="text-sm text-muted-foreground">All trade unions currently on the public register. Click a union to view its published documents.</p>
        </div>
        {/* Design review fix #3: status key was 3 entries crammed into ONE
            row at text-xs — cramped + hard to scan. Rebuilt as a vertical
            legend (one row per status) with the icon + label + plain-
            language description on each row. The box is wider (max-w-md,
            centered) so each row has breathing room. */}
        <div className="mx-auto max-w-md space-y-1.5 rounded-md border bg-muted/30 px-4 py-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status key</p>
          {Object.values(UNION_STATUS_CONFIG).map((cfg) => {
            const Icon = cfg.icon;
            return (
              <div key={cfg.label} className="flex items-baseline gap-2 text-sm">
                <Icon className="h-3.5 w-3.5 flex-shrink-0 self-center" aria-hidden="true" />
                <span className="font-medium">{cfg.label}</span>
                <span className="text-muted-foreground">— {cfg.plainLanguage}</span>
              </div>
            );
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input placeholder="Filter by name or registration number..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" aria-label="Filter unions by name or registration number" />
        </div>
'''

# Match from "  function renderSearch() {" up to (but NOT including) the
# "{unionsLoading ?" line — that's where the data-loading branch starts
# (we keep that part unchanged).
search_intro_pattern = re.compile(
    r'  function renderSearch\(\) \{\n    return \(\n      <div className="space-y-4">\n[\s\S]*?(?=        \{unionsLoading)',
    re.MULTILINE,
)
match = search_intro_pattern.search(src)
if not match:
    print("ERROR: could not find renderSearch intro (up to unionsLoading)")
    raise SystemExit(1)
src = src[: match.start()] + new_search_intro_and_key + src[match.end():]
print("renderSearch intro + status key rewritten.")

# === Fix #3b: rebuild the union rows as scannable units ===
# The old rows had weak alignment: the union name + reg number on the left,
# the status badge floating on the right with no visual connection. Replace
# with a tighter row: the union name as the primary line (font-medium,
# slightly larger), the reg number as a quiet secondary line, and the
# status badge ALIGNED on the right with `items-center` so it reads as
# part of the row, not floating. Add a subtle left-border accent on hover
# that's already there, but increase the row padding slightly (p-4 → p-4
# but with py-4 + better internal spacing).
new_rows_block = '''          <p className="text-sm text-muted-foreground">{filteredUnions.length} union{filteredUnions.length !== 1 ? "s" : ""}{searchQuery.trim() && " matched"} · sorted alphabetically</p>
          <div className="space-y-2">
            {filteredUnions.map((u) => (
              <Link key={u.id} href={`/unions/${u.registrationNo}`}>
                {/* Design review fix #3: row is now a tighter scannable unit.
                    Union name is the primary line (font-medium, text-base).
                    Reg number is a quiet secondary line (text-sm, muted).
                    Status badge is ALIGNED via items-center so it reads as
                    part of the row, not floating. The left-border accent on
                    hover is preserved (visual cue that the row is clickable). */}
                <Card className="cursor-pointer transition-colors hover:bg-muted/50 border-l-2 border-solid border-l-transparent hover:border-l-accent">
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <p className="text-base font-medium leading-tight">{u.unionName}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">Reg. No. {u.registrationNo}</p>
                    </div>
                    <StatusBadge status={u.status} withHelp />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
'''

# Match from "<p className=\"text-sm text-muted-foreground\">{filteredUnions.length}" through the closing "</div>" of the rows container.
rows_pattern = re.compile(
    r'          <p className="text-sm text-muted-foreground">\{filteredUnions\.length\}[\s\S]*?          </div>\n',
    re.MULTILINE,
)
match = rows_pattern.search(src)
if not match:
    print("ERROR: could not find the rows block")
    raise SystemExit(1)
src = src[: match.start()] + new_rows_block + src[match.end():]
print("union rows rewritten.")

# === Tighten the main content spacing ===
# The main had space-y-10 (huge gaps between hero + list). Reduce to space-y-8
# so the list (the page's focal point) doesn't feel disconnected from the hero.
src = src.replace(
    '<main className="mx-auto max-w-4xl space-y-10 p-4 py-10">',
    '<main className="mx-auto max-w-4xl space-y-8 p-4 py-10">',
)
print("main spacing tightened (space-y-10 → space-y-8).")

PATH.write_text(src)
print(f"\nWrote {PATH}")
