"""Sweep all views: replace ad-hoc h1 + subtitle patterns with <PageHeader>.

This is the design-system-layer fix. Instead of fixing each view's type
hierarchy individually, we replace the inconsistent h1 patterns with a
single shared <PageHeader> component that enforces one canonical type
scale (text-3xl font-bold tracking-tight).

The script handles 2 patterns:
  Pattern A (most common):
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Title</h1>
      <p className="text-sm text-muted-foreground">Subtitle</p>
    </div>

  Pattern B (some views):
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Title</h1>
      <p className="text-sm text-muted-foreground">
        Multi-line subtitle
      </p>
    </div>

Both become:
    <PageHeader title="Title" description="Subtitle" />

Idempotent: if <PageHeader> is already imported, no-op for that file.
"""
import re
from pathlib import Path

VIEWS_DIR = Path("/home/z/my-project/src/components/app/views")
PAGE_HEADER_IMPORT = 'import { PageHeader } from "@/components/app/page-header";'

# Pattern: <div>\n  <h1 className="text-{2xl|3xl} font-bold tracking-tight">Title</h1>\n  <p className="text-sm text-muted-foreground">Subtitle</p>\n</div>
# The subtitle <p> may span multiple lines.
H1_PATTERN = re.compile(
    r'<div>\s*\n\s*'
    r'<h1[^>]*className="text-(?:2xl|3xl|4xl|5xl) font-bold tracking-tight"[^>]*>([^<]+)</h1>\s*\n\s*'
    r'(?:<p[^>]*className="text-sm text-muted-foreground"[^>]*>([\s\S]*?)</p>\s*\n)?'
    r'</div>',
    re.MULTILINE,
)

# Also match h1 without a wrapping <div> (some views have the h1 + p inline)
H1_INLINE_PATTERN = re.compile(
    r'<h1[^>]*className="text-(?:2xl|3xl|4xl|5xl) font-bold tracking-tight"[^>]*>([^<]+)</h1>\s*\n\s*'
    r'(?:<p[^>]*className="text-sm text-muted-foreground"[^>]*>([\s\S]*?)</p>\s*\n)?',
    re.MULTILINE,
)

files_changed = 0
files_skipped = 0

for txx in sorted(VIEWS_DIR.glob("*.tsx")):
    src = txx.read_text()

    # Skip if PageHeader is already imported (idempotent)
    if PAGE_HEADER_IMPORT in src:
        files_skipped += 1
        continue

    # Skip if there's no h1 with the target pattern
    if not re.search(r'text-(?:2xl|3xl|4xl|5xl) font-bold tracking-tight', src):
        files_skipped += 1
        continue

    original = src
    changes = []

    def replace_h1(match):
        title = match.group(1).strip()
        # group 2 is the optional description — may be None or multi-line
        desc_raw = match.group(2) if match.lastindex >= 2 and match.group(2) else None
        if desc_raw:
            # Clean up: strip whitespace, collapse newlines, decode entities
            desc = " ".join(desc_raw.split())
            # Decode common HTML entities
            desc = desc.replace("&apos;", "'").replace("&amp;", "&").replace("&quot;", '"')
            changes.append(f'  <PageHeader title="{title}" description="{desc}" />')
            return f'<PageHeader title="{title}" description="{desc}" />'
        else:
            changes.append(f'  <PageHeader title="{title}" />')
            return f'<PageHeader title="{title}" />'

    # Try the div-wrapped pattern first
    src = H1_PATTERN.sub(replace_h1, src)

    # If no div-wrapped match, try the inline pattern
    if src == original:
        src = H1_INLINE_PATTERN.sub(replace_h1, src)

    if src == original:
        print(f"  SKIP {txx.name} — pattern not matched (manual review needed)")
        files_skipped += 1
        continue

    # Add the PageHeader import at the top (after the first import line)
    # Find the last `import ... from "..."` line and insert after it
    import_lines = list(re.finditer(r'^import\s+.*?from\s+["\'].*?["\'];?\s*$', src, re.MULTILINE))
    if import_lines:
        last_import_end = import_lines[-1].end()
        src = src[:last_import_end] + "\n" + PAGE_HEADER_IMPORT + src[last_import_end:]
    else:
        # No imports found — prepend
        src = PAGE_HEADER_IMPORT + "\n" + src

    txx.write_text(src)
    files_changed += 1
    print(f"  ✓ {txx.name} — {len(changes)} h1(s) replaced with PageHeader")

print(f"\nDone: {files_changed} files changed, {files_skipped} skipped.")
