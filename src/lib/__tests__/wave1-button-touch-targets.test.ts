import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// =============================================================================
// Wave 1 / Item 2: Button touch targets ≥44×44 CSS pixels (WCAG 2.5.5 AAA).
//
// Audit finding: 15 icon-only buttons in the app shell + main views had touch
// targets smaller than 44×44 px:
//   - <Button size="icon" className="h-7 w-7">  → 28×28
//   - <Button size="icon" className="h-8 w-8">  → 32×32
//   - <Button size="icon" className="h-9 w-9">  → 36×36
//   - <Button size="icon">                      → 36×36 (shadcn default size-9)
//   - <Button size="sm"> (icon-only, no text)   → 32×~36
//
// On touch devices these are hard to hit — especially destructive actions
// (Delete, Cancel, Dismiss) where a mis-tap can hit a neighboring button.
//
// Fix: every `<Button size="icon">` in the app/* tree must override the size
// to h-11 w-11 (44px). Icon-only `<Button size="sm">` instances must switch
// to size="icon" + h-11 w-11 (they have no text, so the h-8 default is too
// short AND they're missing the icon-size semantics).
//
// These contract tests scan the source files (same belt-and-suspenders pattern
// as wave1-compliance-cell-a11y.test.ts) so they run in the Node vitest
// environment without needing jsdom / RTL / network.
//
// SCOPE: src/components/app/** — the user-facing app. We deliberately do NOT
// scan src/components/ui/** (the shadcn primitive library — out of scope; the
// audit explicitly excludes global primitive changes). Text-bearing buttons
// are also out of scope (the shadcn default `h-9` is acceptable for AA when
// the text gives the button inherent width; this audit item targets the
// icon-only buttons that have NO inherent size).
// =============================================================================

const APP_ROOT = resolve(__dirname, "../../../src/components/app");

// Walk the app tree, collect every .tsx file path.
function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, acc);
    } else if (full.endsWith(".tsx")) {
      acc.push(full);
    }
  }
  return acc;
}

// Find every <Button ...> element with size="icon" in the file content.
// Returns an array of the raw substring for each match (the opening tag
// through the closing `>`).
function findIconButtonBlocks(src: string): string[] {
  const blocks: string[] = [];
  // Match <Button ... size="icon" ... > — opening tag may span multiple lines.
  // `[^>]` already matches newlines (the only char it excludes is `>`), so no
  // /s flag needed. We non-greedily scan from `<Button` to the first `>` after
  // size="icon" appears, ensuring we capture the whole opening tag in one match.
  const re = /<Button\b[^>]*?\bsize="icon"\b[^>]*?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    blocks.push(m[0]);
  }
  return blocks;
}

// Find every <Button ...> element with size="sm" whose ONLY element child is
// an icon (an SVG like <Eye ... /> or <Trash2 ... />), with no text node.
// Such buttons are functionally icon-only and must use size="icon" + h-11 w-11.
//
// We treat `size="sm"` as a violation ONLY when:
//   - the button has size="sm" AND
//   - the button has no visible text between > and </Button> (whitespace-only
//     or comment-only is allowed), AND
//   - the button has at least one <Icon ... /> child element.
function findSmIconOnlyBlocks(src: string): string[] {
  const violations: string[] = [];
  // Match <Button ... size="sm" ...>...</Button> (dotall, non-greedy).
  const re = /<Button\b[^>]*?\bsize="sm"\b[^>]*?>([\s\S]*?)<\/Button>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const inner = m[1];
    // Strip comments before checking for text.
    const withoutComments = inner.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // Strip JSX whitespace + newlines.
    const textOnly = withoutComments
      .replace(/<[^>]+>/g, "") // strip element tags
      .replace(/\s+/g, "")
      .trim();
    if (textOnly.length > 0) continue; // has visible text → in spec, skip
    // Has at least one child element (likely an icon).
    if (!/<[A-Z][A-Za-z0-9]*\b/.test(withoutComments)) continue;
    violations.push(m[0]);
  }
  return violations;
}

describe("Wave 1 / Item 2: icon-only button touch targets ≥44×44 px", () => {
  const files = walk(APP_ROOT);

  it("every <Button size=\"icon\"> in src/components/app has h-11 w-11 in its className", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf-8");
      const blocks = findIconButtonBlocks(src);
      for (const block of blocks) {
        // Extract the className attribute value (may be on the same line or
        // a continuation line; allow single or double quotes, and template
        // literals with backticks).
        const classNameMatch = block.match(/className=\{?\s*["'`]([^"'`]*?)["'`]\s*\}?/);
        if (!classNameMatch) {
          offenders.push(`${file}: <Button size="icon"> with no className override — defaults to size-9 (36px). Block: ${block.replace(/\s+/g, " ").slice(0, 120)}`);
          continue;
        }
        const cls = classNameMatch[1];
        if (!/\bh-11\b/.test(cls) || !/\bw-11\b/.test(cls)) {
          offenders.push(`${file}: <Button size="icon"> className="${cls}" — missing h-11 w-11. Block: ${block.replace(/\s+/g, " ").slice(0, 120)}`);
        }
      }
    }
    if (offenders.length > 0) {
      console.log(`\n  ✗ <Button size="icon"> touch-target violations:\n    ${offenders.join("\n    ")}\n`);
    }
    expect(offenders).toEqual([]);
  });

  it("no <Button size=\"sm\"> is used as an icon-only button (must switch to size=\"icon\" + h-11 w-11)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf-8");
      const blocks = findSmIconOnlyBlocks(src);
      for (const block of blocks) {
        offenders.push(`${file}: ${block.replace(/\s+/g, " ").slice(0, 120)}`);
      }
    }
    if (offenders.length > 0) {
      console.log(`\n  ✗ <Button size="sm"> icon-only touch-target violations:\n    ${offenders.join("\n    ")}\n`);
    }
    expect(offenders).toEqual([]);
  });

  it("no <Button size=\"icon\"> uses a sub-44px size override (h-7/h-8/h-9/h-10 w-7/w-8/w-9/w-10)", () => {
    // Regression guard: even if a future PR adds a className, it must NOT
    // override h-11 w-11 with a smaller size.
    const offenders: string[] = [];
    const forbiddenSizePattern = /\b(h-(?:7|8|9|10))\b.*?\b(w-(?:7|8|9|10))\b/;
    for (const file of files) {
      const src = readFileSync(file, "utf-8");
      const blocks = findIconButtonBlocks(src);
      for (const block of blocks) {
        const classNameMatch = block.match(/className=\{?\s*["'`]([^"'`]*?)["'`]\s*\}?/);
        if (!classNameMatch) continue;
        const cls = classNameMatch[1];
        // Allow h-11/w-11 — the spec. Forbid smaller.
        if (forbiddenSizePattern.test(cls)) {
          offenders.push(`${file}: <Button size="icon"> className="${cls}" — sub-44px override. Block: ${block.replace(/\s+/g, " ").slice(0, 120)}`);
        }
      }
    }
    if (offenders.length > 0) {
      console.log(`\n  ✗ <Button size="icon"> sub-44px overrides:\n    ${offenders.join("\n    ")}\n`);
    }
    expect(offenders).toEqual([]);
  });

  it("expected fix sites are present (sanity check — confirms the audit was acted on)", () => {
    // Confirm the 15 specific fix sites are in place. This catches accidental
    // reverts that the broader regex tests above might miss (e.g. if a button
    // is converted to a non-Button element with the same size violation).
    const expectedSites: Array<{ file: string; fragment: string }> = [
      // welcome-panel: dismiss button
      { file: "welcome-panel.tsx", fragment: 'size="icon"' },
      { file: "welcome-panel.tsx", fragment: "h-11 w-11 shrink-0" },
      // tasks: cancel + delete
      { file: "views/tasks.tsx", fragment: 'title="Cancel task"' },
      { file: "views/tasks.tsx", fragment: 'title="Delete task"' },
      // legislation: edit + delete
      { file: "views/legislation.tsx", fragment: 'title="Edit"' },
      { file: "views/legislation.tsx", fragment: 'title="Delete"' },
      // documents: preview + view details
      { file: "views/documents.tsx", fragment: 'title="Preview document"' },
      { file: "views/documents.tsx", fragment: 'title="View details"' },
      // document-detail: preview version + download version
      { file: "views/document-detail.tsx", fragment: 'title="Preview this version"' },
      { file: "views/document-detail.tsx", fragment: 'title="Download this version"' },
      // theme-toggle: placeholder + actual
      { file: "theme-toggle.tsx", fragment: 'h-11 w-11" />' },
      // calendar: prev + next month
      { file: "views/calendar.tsx", fragment: "onClick={prevMonth}" },
      { file: "views/calendar.tsx", fragment: "onClick={nextMonth}" },
      // app-shell: mobile search trigger + notifications bell
      { file: "app-shell.tsx", fragment: "h-11 w-11 sm:hidden" },
      { file: "app-shell.tsx", fragment: 'className="relative h-11 w-11"' },
    ];

    const missing: string[] = [];
    for (const site of expectedSites) {
      const filePath = resolve(APP_ROOT, site.file);
      const src = readFileSync(filePath, "utf-8");
      if (!src.includes(site.fragment)) {
        missing.push(`${site.file}: expected fragment "${site.fragment}" not found`);
      }
    }
    if (missing.length > 0) {
      console.log(`\n  ✗ Missing fix sites:\n    ${missing.join("\n    ")}\n`);
    }
    expect(missing).toEqual([]);
  });

  it("the global Button primitive is NOT modified (out of scope — shadcn library)", () => {
    // The audit explicitly excludes src/components/ui/button.tsx from the fix
    // scope. Modifying the primitive would change every button in the app,
    // which is not what Wave 1 / Item 2 calls for. This test guards against
    // an over-eager future PR that changes `icon: "size-9"` to `icon: "size-11"`.
    const buttonPath = resolve(__dirname, "../../../src/components/ui/button.tsx");
    const src = readFileSync(buttonPath, "utf-8");
    // The original `icon: "size-9"` must still be present (NOT bumped to size-11).
    expect(src).toMatch(/icon:\s*"size-9"/);
    // The original `sm: "h-8 ..."` must still be present.
    expect(src).toMatch(/sm:\s*"h-8\b/);
  });
});
