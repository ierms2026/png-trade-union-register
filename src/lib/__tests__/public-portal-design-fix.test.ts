import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================================
// Public portal design review fixes (Wave 5 follow-up).
//
// A senior art-director critique (VLM) flagged 8 issues. The top 3 were:
//   #1 — No focal point: hero had 7 competing elements (badge + h1 + 2
//        paragraphs + last-updated + legal citation + 2 inline links).
//   #2 — Type hierarchy collapsed: h1 was text-4xl, body was text-lg —
//        only ~1.5x difference, so the headline didn't dominate.
//   #3 — Status key was cramped (3 entries in one row at text-xs) + union
//        rows had weak alignment (badge floating disconnected from name).
//
// Fixes applied:
//   #1 — Hero cut to 3 elements: quiet eyebrow (coat of arms + "Office of
//        The Industrial Registrar" badge), dominant h1, ONE supporting line.
//        The legal citation + inline CTAs were removed (they duplicate the
//        nav bar's Resources / About tabs).
//   #2 — h1: text-4xl → text-5xl (clearly dominant). h2: text-lg → text-2xl
//        (clearly steps down from h1, clearly above body). Body: text-lg →
//        text-base (clearly below h1). Meta: text-xs / text-[11px] (clearly
//        the smallest). The hierarchy now survives a 3-second squint test.
//   #3 — Status key rebuilt as a vertical legend (one row per status, max-w-md
//        centered, each row has icon + label + plain-language description).
//        Union rows rebuilt: union name as primary line (text-base font-
//        medium), reg number as quiet secondary (text-sm muted), status badge
//        aligned via items-center + gap-4 so it reads as part of the row.
//
// These tests lock in the fixes so a future refactor doesn't regress them.
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");
const PUBLIC_PORTAL = resolve(SRC_ROOT, "src/components/app/public-portal.tsx");

describe("Public portal design fix #1: hero has ONE clear focal point", () => {
  const src = readFileSync(PUBLIC_PORTAL, "utf-8");

  // Extract the renderHero function body (scoped checks — don't catch
  // mentions in renderSearch or other functions).
  const heroMatch = src.match(/function renderHero\(\)[\s\S]*?\n  \}/);
  const heroBody = heroMatch ? heroMatch[0] : "";

  it("renderHero function exists", () => {
    expect(heroBody.length, "renderHero must exist").toBeGreaterThan(0);
  });

  it("hero no longer has the 'Published by the Industrial Registrar' badge (replaced with quieter eyebrow)", () => {
    expect(heroBody).not.toMatch(/Published by the Industrial Registrar/);
  });

  it("hero no longer has the legal citation paragraph ('in accordance with Section 5')", () => {
    // The legal citation was a 4-line paragraph that competed with the h1.
    // Removed — the footer already has the legal citation.
    expect(heroBody).not.toMatch(/in accordance with Section 5/);
  });

  it("hero no longer has the inline 'View resources' / 'About this register' CTAs", () => {
    // These duplicated the nav bar's Resources / About tabs.
    expect(heroBody).not.toMatch(/View resources/);
    expect(heroBody).not.toMatch(/About this register/);
  });

  it("hero has a quiet eyebrow with the coat of arms + 'Office of The Industrial Registrar'", () => {
    expect(heroBody).toMatch(/Office of The Industrial Registrar/);
  });

  it("hero eyebrow is subdued (border-accent/40 + bg-accent/5, not border-2 + bg-accent/10)", () => {
    // The old badge was border-2 + bg-accent/10 + shadow-sm (loud).
    // The new eyebrow is border-accent/40 + bg-accent/5 (quiet).
    expect(heroBody).toMatch(/border border-accent\/40 bg-accent\/5/);
    expect(heroBody).not.toMatch(/border-2 border-accent bg-accent\/10/);
    expect(heroBody).not.toMatch(/shadow-sm/);
  });

  it("hero has exactly ONE h1 (the page title)", () => {
    const h1Count = (heroBody.match(/<h1\b/g) || []).length;
    expect(h1Count).toBe(1);
  });

  it("hero supporting text is ONE line (not 2 paragraphs + last-updated + citation)", () => {
    // Count <p> tags inside the hero — should be exactly 1 (the supporting line).
    const pCount = (heroBody.match(/<p\b/g) || []).length;
    expect(pCount, "hero should have exactly ONE <p> (the supporting line)").toBe(1);
  });
});

describe("Public portal design fix #2: type hierarchy survives a squint test", () => {
  const src = readFileSync(PUBLIC_PORTAL, "utf-8");
  // Strip JSX comments before pattern-matching — comments mention the
  // old class names (e.g. "was text-4xl") which would false-positive.
  const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const heroMatch = src.match(/function renderHero\(\)[\s\S]*?\n  \}/);
  const heroBody = heroMatch ? stripComments(heroMatch[0]) : "";
  const searchMatch = src.match(/function renderSearch\(\)[\s\S]*?\n  \}/);
  const searchBody = searchMatch ? stripComments(searchMatch[0]) : "";

  it("h1 is text-5xl (was text-4xl — clearly dominant)", () => {
    expect(heroBody).toMatch(/<h1 className="text-5xl font-bold tracking-tight">/);
    expect(heroBody).not.toMatch(/text-4xl/);
  });

  it("hero supporting line is text-base (was text-lg — clearly below h1)", () => {
    expect(heroBody).toMatch(/<p className="mx-auto max-w-2xl text-base text-muted-foreground">/);
    expect(heroBody).not.toMatch(/text-lg text-muted-foreground/);
  });

  it("h2 (Registered Unions) is text-2xl (was text-lg — clearly below h1, above body)", () => {
    expect(searchBody).toMatch(/<h2 className="text-2xl font-semibold tracking-tight">Registered Unions<\/h2>/);
  });

  it("h2 description is text-sm (clearly below the h2)", () => {
    expect(searchBody).toMatch(/<p className="text-sm text-muted-foreground">All trade unions currently on the public register/);
  });

  it("type scale is now: h1 (5xl) → h2 (2xl) → body (base) → meta (sm/xs) — 4 distinct levels", () => {
    // The scale: 5xl (~48px) → 2xl (~24px) → base (~16px) → sm (~14px) → xs (~12px).
    // Each step is clearly differentiated — survives a 3-second squint test.
    expect(heroBody).toMatch(/text-5xl/);
    expect(searchBody).toMatch(/text-2xl/);
    expect(heroBody).toMatch(/text-base/);
    expect(searchBody).toMatch(/text-sm/);
  });
});

describe("Public portal design fix #3a: status key is a clean vertical legend", () => {
  const src = readFileSync(PUBLIC_PORTAL, "utf-8");
  const searchMatch = src.match(/function renderSearch\(\)[\s\S]*?\n  \}/);
  const searchBody = searchMatch ? searchMatch[0] : "";

  it("status key is no longer a single cramped row (no flex-wrap on the key container)", () => {
    // The old key was: <div className="flex flex-wrap items-center justify-center gap-4 ...">
    // — 3 entries crammed into one row at text-xs.
    // The new key is: <div className="mx-auto max-w-md space-y-1.5 ...">
    // — vertical stack, one row per status.
    expect(searchBody).not.toMatch(/flex flex-wrap items-center justify-center gap-4 rounded-md border bg-muted\/30 px-4 py-2 text-xs/);
  });

  it("status key is now a vertical legend (space-y-1.5, max-w-md, centered)", () => {
    expect(searchBody).toMatch(/mx-auto max-w-md space-y-1.5 rounded-md border bg-muted\/30 px-4 py-3/);
  });

  it("status key has a 'Status key' heading (text-[11px] uppercase tracking-wider)", () => {
    expect(searchBody).toMatch(/<p className="mb-1 text-\[11px\] font-semibold uppercase tracking-wider text-muted-foreground">Status key<\/p>/);
  });

  it("each status entry is its own row (flex items-baseline, not inline)", () => {
    // Each row: icon + label (font-medium) + plain-language description (muted).
    expect(searchBody).toMatch(/<div key=\{cfg\.label\} className="flex items-baseline gap-2 text-sm">/);
  });

  it("status entries are at text-sm (was text-xs — readable, not cramped)", () => {
    // The old key was text-xs (12px). The new key is text-sm (14px) —
    // readable, especially for the plain-language descriptions.
    const keyBlockMatch = searchBody.match(/Status key[\s\S]*?<\/div>/);
    expect(keyBlockMatch, "status key block must exist").not.toBeNull();
    const keyBlock = keyBlockMatch![0];
    expect(keyBlock).toMatch(/text-sm/);
  });
});

describe("Public portal design fix #3b: union rows are scannable units", () => {
  const src = readFileSync(PUBLIC_PORTAL, "utf-8");
  const searchMatch = src.match(/function renderSearch\(\)[\s\S]*?\n  \}/);
  const searchBody = searchMatch ? searchMatch[0] : "";

  it("union name is the primary line (text-base font-medium, was font-medium only)", () => {
    expect(searchBody).toMatch(/<p className="text-base font-medium leading-tight">\{u\.unionName\}<\/p>/);
  });

  it("reg number is a quiet secondary line (text-sm muted, with mt-0.5 spacing)", () => {
    expect(searchBody).toMatch(/<p className="mt-0\.5 text-sm text-muted-foreground">Reg\. No\. \{u\.registrationNo\}<\/p>/);
  });

  it("row uses items-center (badge aligned with the name, not floating)", () => {
    expect(searchBody).toMatch(/<CardContent className="flex items-center justify-between gap-4 p-4">/);
  });

  it("row has gap-4 (breathing room between name + badge, was no explicit gap)", () => {
    expect(searchBody).toMatch(/justify-between gap-4 p-4/);
  });

  it("row name block has min-w-0 (prevents overflow on long union names)", () => {
    expect(searchBody).toMatch(/<div className="min-w-0">/);
  });

  it("row preserves the left-border accent on hover (visual cue that row is clickable)", () => {
    expect(searchBody).toMatch(/border-l-2 border-solid border-l-transparent hover:border-l-accent/);
  });
});

describe("Public portal design fix: main content spacing tightened", () => {
  const src = readFileSync(PUBLIC_PORTAL, "utf-8");

  it("main has space-y-8 (was space-y-10 — tighter rhythm between hero + list)", () => {
    expect(src).toMatch(/<main className="mx-auto max-w-4xl space-y-8 p-4 py-10">/);
    expect(src).not.toMatch(/space-y-10/);
  });
});

describe("Public portal design fix: no regressions in functionality", () => {
  const src = readFileSync(PUBLIC_PORTAL, "utf-8");

  it("nav bar still has all 4 tabs (Register, Resources, About, Help)", () => {
    expect(src).toMatch(/handleTabChange\("register"\)/);
    expect(src).toMatch(/handleTabChange\("resources"\)/);
    expect(src).toMatch(/handleTabChange\("about"\)/);
    expect(src).toMatch(/handleTabChange\("help"\)/);
  });

  it("Sign In button still present in header", () => {
    expect(src).toMatch(/Sign In/);
  });

  it("Industrial Organizations Act link still in hero (inline in supporting line)", () => {
    expect(src).toMatch(/\/legislation\/industrial-relations-act-1962\.pdf/);
  });

  it("last-updated date still shown (merged into the supporting line)", () => {
    expect(src).toMatch(/Last updated/);
  });

  it("footer still has the legal citation (the proper home for it)", () => {
    expect(src).toMatch(/in accordance with the Industrial Organizations Act/);
  });

  it("filter Input still has aria-label (Wave 5 a11y fix preserved)", () => {
    expect(src).toMatch(/aria-label="Filter unions by name or registration number"/);
  });

  it("decorative Search icon in filter has aria-hidden (Wave 5 a11y fix preserved)", () => {
    expect(src).toMatch(/<Search className="absolute left-3[^>]*aria-hidden="true"/);
  });
});
