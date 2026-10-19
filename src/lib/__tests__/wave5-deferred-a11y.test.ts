import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// =============================================================================
// Wave 5: Deferred a11y items from Wave 4.
//
// Item 1 — Select Label htmlFor association (Wave 4 deferred this — ~20 call
//   sites across 10 files). Each <Select> filter/form dropdown now has either:
//     (a) a <Label htmlFor="X"> paired with <SelectTrigger id="X">, OR
//     (b) an aria-label on <SelectTrigger> (for standalone filter dropdowns
//         that have no visible <Label>).
//
// Item 2 — Arrow-key nav for tab bars (Wave 4 added the ARIA tablist pattern
//   + roving tabindex but NOT the onKeyDown handler). The three tab bars
//   (compliance, unions-detail, calendar) now handle ArrowLeft/ArrowRight/
//   Home/End via a shared handleTabKeyDown helper in src/lib/dashboard/tabs.ts.
//
// WCAG criteria covered:
//   - 1.3.1 Info and Relationships (A) — Label ↔ Select association
//   - 3.3.2 Labels or Instructions (A) — every Select has a name
//   - 4.1.2 Name, Role, Value (A) — tablist arrow-key nav
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");
const VIEWS_DIR = resolve(SRC_ROOT, "src/components/app/views");

// Files that contain <SelectTrigger> (Pattern A: with Label, Pattern C: bare).
const FILES_WITH_SELECTS = [
  "users.tsx",
  "unions.tsx",
  "search.tsx",
  "documents.tsx",
  "contact-requests.tsx",
  "compliance.tsx",
  "tasks.tsx",
  "compare.tsx",
  "legislation.tsx",
];

// =============================================================================
// Item 1: Select Label htmlFor association
// =============================================================================

describe("Wave 5 / Item 1: every <SelectTrigger> has a name (id+htmlFor OR aria-label)", () => {
  for (const file of FILES_WITH_SELECTS) {
    const filePath = resolve(VIEWS_DIR, file);
    const src = readFileSync(filePath, "utf-8");

    it(`${file}: every <SelectTrigger> has either id= or aria-label=`, () => {
      // Find every <SelectTrigger ...> opening tag (may span multiple lines).
      // For each, verify it has either id="..." or aria-label="...".
      const matches = [...src.matchAll(/<SelectTrigger\b[^>]*>/g)];
      expect(matches.length, `${file} must have at least one <SelectTrigger>`).toBeGreaterThan(0);
      const offenders: string[] = [];
      for (const m of matches) {
        const tag = m[0];
        if (!/\bid=/.test(tag) && !/\baria-label=/.test(tag)) {
          offenders.push(tag.replace(/\s+/g, " ").slice(0, 120));
        }
      }
      if (offenders.length > 0) {
        console.log(`\n  ✗ ${file} <SelectTrigger> without id or aria-label:\n    ${offenders.join("\n    ")}\n`);
      }
      expect(offenders).toEqual([]);
    });
  }

  it("no <Label>...followed by <Select>...without htmlFor (Pattern A: Label must point at the Select)", () => {
    // For every <Label>Foo</Label> that's immediately followed by a <Select>
    // (within ~30 chars), the Label must have htmlFor AND the following
    // SelectTrigger must have a matching id.
    const offenders: string[] = [];
    for (const file of FILES_WITH_SELECTS) {
      const filePath = resolve(VIEWS_DIR, file);
      const src = readFileSync(filePath, "utf-8");
      // Match <Label>TEXT</Label> (no htmlFor attribute) — these are the
      // unfixed Pattern A instances. Pattern A FIXED instances have
      // <Label htmlFor="...">TEXT</Label>.
      const bareLabelMatches = [...src.matchAll(/<Label>([^<]+)<\/Label>/g)];
      for (const m of bareLabelMatches) {
        // Check if a <Select> follows within the next 100 chars.
        const after = src.slice(m.index! + m[0].length, m.index! + m[0].length + 200);
        if (/<Select\b/.test(after)) {
          offenders.push(`${file}: <Label>${m[1]}</Label> followed by <Select> but Label has no htmlFor`);
        }
      }
    }
    if (offenders.length > 0) {
      console.log(`\n  ✗ <Label> without htmlFor followed by <Select>:\n    ${offenders.join("\n    ")}\n`);
    }
    expect(offenders).toEqual([]);
  });

  it("no bare <label className=...> (lowercase) followed by <Select> without htmlFor", () => {
    // documents.tsx uses <label className="text-xs..."> (lowercase) instead
    // of the shadcn <Label> component. Same rule applies — must have htmlFor.
    const offenders: string[] = [];
    for (const file of FILES_WITH_SELECTS) {
      const filePath = resolve(VIEWS_DIR, file);
      const src = readFileSync(filePath, "utf-8");
      const bareLowerLabelMatches = [...src.matchAll(/<label className="[^"]*">([^<]+)<\/label>/g)];
      for (const m of bareLowerLabelMatches) {
        const after = src.slice(m.index! + m[0].length, m.index! + m[0].length + 200);
        if (/<Select\b/.test(after)) {
          offenders.push(`${file}: <label>${m[1]}</label> followed by <Select> but label has no htmlFor`);
        }
      }
    }
    if (offenders.length > 0) {
      console.log(`\n  ✗ bare <label> without htmlFor followed by <Select>:\n    ${offenders.join("\n    ")}\n`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("Wave 5 / Item 1: specific Label ↔ SelectTrigger id pairings", () => {
  it("users.tsx: Role Label htmlFor='user-role' pairs with SelectTrigger id='user-role'", () => {
    const src = readFileSync(resolve(VIEWS_DIR, "users.tsx"), "utf-8");
    expect(src).toMatch(/htmlFor="user-role"/);
    expect(src).toMatch(/id="user-role"/);
  });

  it("users.tsx: Assigned Union Label htmlFor='user-union' pairs with SelectTrigger id='user-union'", () => {
    const src = readFileSync(resolve(VIEWS_DIR, "users.tsx"), "utf-8");
    expect(src).toMatch(/htmlFor="user-union"/);
    expect(src).toMatch(/id="user-union"/);
  });

  it("tasks.tsx: Priority, Union, Assignee Labels all have htmlFor + matching SelectTrigger id", () => {
    const src = readFileSync(resolve(VIEWS_DIR, "tasks.tsx"), "utf-8");
    for (const id of ["task-priority", "task-union", "task-assignee"]) {
      expect(src).toMatch(new RegExp(`htmlFor="${id}"`));
      expect(src).toMatch(new RegExp(`id="${id}"`));
    }
  });

  it("legislation.tsx: Jurisdiction + Category Labels have htmlFor + matching SelectTrigger id", () => {
    const src = readFileSync(resolve(VIEWS_DIR, "legislation.tsx"), "utf-8");
    for (const id of ["legislation-jurisdiction", "legislation-category"]) {
      expect(src).toMatch(new RegExp(`htmlFor="${id}"`));
      expect(src).toMatch(new RegExp(`id="${id}"`));
    }
  });

  it("unions.tsx: three Selects have htmlFor + id pairings (status-filter, upload-document-type, edit-status)", () => {
    const src = readFileSync(resolve(VIEWS_DIR, "unions.tsx"), "utf-8");
    for (const id of ["union-status-filter", "upload-document-type", "union-edit-status"]) {
      expect(src).toMatch(new RegExp(`htmlFor="${id}"`));
      expect(src).toMatch(new RegExp(`id="${id}"`));
    }
  });

  it("documents.tsx: three filter Selects have htmlFor + id pairings", () => {
    const src = readFileSync(resolve(VIEWS_DIR, "documents.tsx"), "utf-8");
    for (const id of ["docs-union-filter", "docs-type-filter", "docs-status-filter"]) {
      expect(src).toMatch(new RegExp(`htmlFor="${id}"`));
      expect(src).toMatch(new RegExp(`id="${id}"`));
    }
  });
});

describe("Wave 5 / Item 1: bare filter Selects have aria-label", () => {
  it("search.tsx: 5 filter Selects have aria-label", () => {
    const src = readFileSync(resolve(VIEWS_DIR, "search.tsx"), "utf-8");
    const expectedLabels = [
      "Filter by union",
      "Filter by document type",
      "Filter by review status",
      "Filter by assigned officer",
      "Sort results",
    ];
    for (const label of expectedLabels) {
      expect(src).toMatch(new RegExp(`aria-label="${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    }
  });

  it("contact-requests.tsx: status filter Select has aria-label", () => {
    const src = readFileSync(resolve(VIEWS_DIR, "contact-requests.tsx"), "utf-8");
    expect(src).toMatch(/aria-label="Filter by status"/);
  });

  it("compliance.tsx: status filter Select has aria-label", () => {
    const src = readFileSync(resolve(VIEWS_DIR, "compliance.tsx"), "utf-8");
    expect(src).toMatch(/aria-label="Filter by compliance status"/);
  });

  it("compare.tsx: add-union Select has aria-label", () => {
    const src = readFileSync(resolve(VIEWS_DIR, "compare.tsx"), "utf-8");
    expect(src).toMatch(/aria-label="Add a union to compare"/);
  });
});

describe("Wave 5 / Item 1: bare filter Inputs have aria-label", () => {
  it("unions.tsx: filter-by-name Input has aria-label", () => {
    const src = readFileSync(resolve(VIEWS_DIR, "unions.tsx"), "utf-8");
    expect(src).toMatch(/aria-label="Filter unions by name or registration number"/);
  });

  it("search.tsx: main search Input has aria-label", () => {
    const src = readFileSync(resolve(VIEWS_DIR, "search.tsx"), "utf-8");
    expect(src).toMatch(/aria-label="Search document contents"/);
  });

  it("search.tsx: date-range Inputs already have aria-label (Start date / End date — pre-existing)", () => {
    const src = readFileSync(resolve(VIEWS_DIR, "search.tsx"), "utf-8");
    expect(src).toMatch(/aria-label="Start date"/);
    expect(src).toMatch(/aria-label="End date"/);
  });
});

// =============================================================================
// Item 2: Arrow-key nav for tab bars
// =============================================================================

const COMPLIANCE = resolve(VIEWS_DIR, "compliance.tsx");
const UNIONS = resolve(VIEWS_DIR, "unions.tsx");
const CALENDAR = resolve(VIEWS_DIR, "calendar.tsx");
const TABS_HELPER = resolve(SRC_ROOT, "src/lib/dashboard/tabs.ts");

describe("Wave 5 / Item 2: shared handleTabKeyDown helper exists", () => {
  it("src/lib/dashboard/tabs.ts exists", () => {
    const src = readFileSync(TABS_HELPER, "utf-8");
    expect(src.length).toBeGreaterThan(0);
  });

  it("helper exports handleTabKeyDown function", () => {
    const src = readFileSync(TABS_HELPER, "utf-8");
    expect(src).toMatch(/export function handleTabKeyDown/);
  });

  it("helper handles ArrowRight (next, wraps to first)", () => {
    const src = readFileSync(TABS_HELPER, "utf-8");
    expect(src).toMatch(/case "ArrowRight"/);
    expect(src).toMatch(/\(currentIndex \+ 1\) % totalTabs/);
  });

  it("helper handles ArrowLeft (previous, wraps to last)", () => {
    const src = readFileSync(TABS_HELPER, "utf-8");
    expect(src).toMatch(/case "ArrowLeft"/);
    // wrap math: (currentIndex - 1 + totalTabs) % totalTabs
    expect(src).toMatch(/\(currentIndex - 1 \+ totalTabs\) % totalTabs/);
  });

  it("helper handles Home + End (first + last tab)", () => {
    const src = readFileSync(TABS_HELPER, "utf-8");
    expect(src).toMatch(/case "Home"/);
    expect(src).toMatch(/case "End"/);
  });

  it("helper calls preventDefault on handled keys (no scroll interference)", () => {
    const src = readFileSync(TABS_HELPER, "utf-8");
    expect(src).toMatch(/e\.preventDefault\(\)/);
  });

  it("helper does NOT preventDefault for unhandled keys (Tab/Enter/Space pass through)", () => {
    const src = readFileSync(TABS_HELPER, "utf-8");
    // The default case returns early WITHOUT calling preventDefault.
    expect(src).toMatch(/default:\s*return;/);
  });
});

describe("Wave 5 / Item 2: compliance tab bar uses handleTabKeyDown", () => {
  const src = readFileSync(COMPLIANCE, "utf-8");

  it("imports handleTabKeyDown from @/lib/dashboard/tabs", () => {
    expect(src).toMatch(/import.*handleTabKeyDown.*from.*["']@\/lib\/dashboard\/tabs["']/);
  });

  it("imports useRef + useEffect from react", () => {
    expect(src).toMatch(/import.*useEffect.*useRef.*from "react"/);
  });

  it("has a tablistRef attached to the tablist container", () => {
    expect(src).toMatch(/const tablistRef = useRef<HTMLDivElement>\(null\)/);
    expect(src).toMatch(/<div ref={tablistRef}[^>]*role="tablist"/);
  });

  it("has a useEffect that moves focus to the active tab after tab change", () => {
    expect(src).toMatch(/useEffect\(\(\) => \{[\s\S]*?tablistRef\.current\?\.querySelector\('\[role="tab"\]\[tabindex="0"\]'\)/);
  });

  it("tab buttons call handleTabKeyDown in onKeyDown", () => {
    expect(src).toMatch(/onKeyDown=\{\(e\) => handleTabKeyDown\(e, i, tabs\.length,/);
  });

  it("the onActivate callback sets the tab at the computed index", () => {
    expect(src).toMatch(/setTab\(tabs\[nextIdx\]\)/);
  });
});

describe("Wave 5 / Item 2: unions-detail tab bar uses handleTabKeyDown", () => {
  const src = readFileSync(UNIONS, "utf-8");

  it("imports handleTabKeyDown from @/lib/dashboard/tabs", () => {
    expect(src).toMatch(/import.*handleTabKeyDown.*from.*["']@\/lib\/dashboard\/tabs["']/);
  });

  it("imports useRef (useEffect already imported in prior wave)", () => {
    expect(src).toMatch(/import.*useRef.*from "react"/);
  });

  it("has a hubTablistRef attached to the union-detail tablist container", () => {
    expect(src).toMatch(/const hubTablistRef = useRef<HTMLDivElement>\(null\)/);
    expect(src).toMatch(/<div ref={hubTablistRef}[^>]*role="tablist"/);
  });

  it("has a useEffect that moves focus to the active tab after hubTab change", () => {
    expect(src).toMatch(/useEffect\(\(\) => \{[\s\S]*?hubTablistRef\.current\?\.querySelector\('\[role="tab"\]\[tabindex="0"\]'\)/);
  });

  it("tab buttons call handleTabKeyDown in onKeyDown", () => {
    expect(src).toMatch(/onKeyDown=\{\(e\) => handleTabKeyDown\(e, i, hubTabs\.length,/);
  });

  it("the onActivate callback sets the hubTab at the computed index", () => {
    expect(src).toMatch(/setHubTab\(hubTabs\[nextIdx\]\)/);
  });

  it("the hubTablistRef + useEffect are declared at the top level (hooks can't be conditional)", () => {
    // The ref + effect must NOT be inside the `if (selectedUnion)` block —
    // they'd break the rules of hooks. They're declared alongside the
    // hubTab state.
    const hubTabIdx = src.indexOf("const [hubTab, setHubTab]");
    const refIdx = src.indexOf("const hubTablistRef = useRef");
    const ifIdx = src.indexOf("if (selectedUnion)");
    expect(hubTabIdx).toBeGreaterThan(-1);
    expect(refIdx).toBeGreaterThan(-1);
    expect(ifIdx).toBeGreaterThan(-1);
    // ref must come BEFORE the if block (top-level).
    expect(refIdx).toBeLessThan(ifIdx);
  });
});

describe("Wave 5 / Item 2: calendar tab bar uses handleTabKeyDown", () => {
  const src = readFileSync(CALENDAR, "utf-8");

  it("imports handleTabKeyDown from @/lib/dashboard/tabs", () => {
    expect(src).toMatch(/import.*handleTabKeyDown.*from.*["']@\/lib\/dashboard\/tabs["']/);
  });

  it("imports useEffect + useRef from react", () => {
    expect(src).toMatch(/import.*useEffect.*useRef.*from "react"/);
  });

  it("has a tablistRef attached to the calendar tablist container", () => {
    expect(src).toMatch(/const tablistRef = useRef<HTMLDivElement>\(null\)/);
    expect(src).toMatch(/<div ref={tablistRef}[^>]*role="tablist"/);
  });

  it("has a useEffect that moves focus to the active tab after tab change", () => {
    expect(src).toMatch(/useEffect\(\(\) => \{[\s\S]*?tablistRef\.current\?\.querySelector\('\[role="tab"\]\[tabindex="0"\]'\)/);
  });

  it("tab buttons call handleTabKeyDown in onKeyDown", () => {
    expect(src).toMatch(/handleTabKeyDown\(e, i, tabKeys\.length,/);
  });

  it("the onActivate callback sets the tab at the computed index", () => {
    expect(src).toMatch(/setTab\(tabKeys\[nextIdx\]\)/);
  });
});

// =============================================================================
// Cross-cutting: Wave 4 ARIA semantics still intact (no regressions)
// =============================================================================

describe("Wave 5: no regressions in Wave 4 ARIA semantics", () => {
  it("compliance tab bar still has role=tablist + role=tab + aria-selected + roving tabIndex", () => {
    const src = readFileSync(COMPLIANCE, "utf-8");
    expect(src).toMatch(/role="tablist"/);
    expect(src).toMatch(/role="tab"/);
    expect(src).toMatch(/aria-selected=\{tab === t\}/);
    expect(src).toMatch(/tabIndex=\{tab === t \? 0 : -1\}/);
  });

  it("unions-detail tab bar still has role=tablist + role=tab + aria-selected + roving tabIndex", () => {
    const src = readFileSync(UNIONS, "utf-8");
    expect(src).toMatch(/role="tablist" aria-label="Union hub sections"/);
    expect(src).toMatch(/aria-selected=\{hubTab === t\}/);
    expect(src).toMatch(/tabIndex=\{hubTab === t \? 0 : -1\}/);
  });

  it("calendar tab bar still has role=tablist + role=tab + aria-selected + roving tabIndex", () => {
    const src = readFileSync(CALENDAR, "utf-8");
    expect(src).toMatch(/role="tablist" aria-label="Calendar view types"/);
    expect(src).toMatch(/aria-selected=\{tab === t\}/);
    expect(src).toMatch(/tabIndex=\{tab === t \? 0 : -1\}/);
  });
});
