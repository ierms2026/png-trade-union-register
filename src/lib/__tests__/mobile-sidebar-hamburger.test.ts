import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================================
// Mobile sidebar hamburger (Wave 5 follow-up).
//
// Audit finding (deferred from Wave 4): the desktop sidebar is hidden below
// `lg` (`hidden ... lg:block`). Mobile users had to navigate via the Cmd+K
// search palette — functional but unfamiliar. A standard hamburger + drawer
// pattern is what users expect on mobile.
//
// Fix: added a hamburger button in the header (visible below lg only) that
// opens a Sheet (Radix Dialog under the hood) containing the SAME SidebarNav
// component as the desktop aside. The Sheet provides:
//   - Focus trap (Radix Dialog default behavior)
//   - Escape to close
//   - Overlay click to close
//   - Focus return to the hamburger trigger on close
//   - aria-labelledby / aria-describedby via SheetTitle / SheetDescription
//
// Clicking a nav item inside the Sheet closes the drawer AND navigates
// (via the onNavigate wrapper).
//
// Tests verify the structural contract — full keyboard/focus behavior is
// provided by Radix Dialog (already covered by the ui/sheet.tsx primitive's
// own tests). We don't duplicate that coverage here.
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");
const APP_SHELL = resolve(SRC_ROOT, "src/components/app/app-shell.tsx");
const SHEET_PRIMITIVE = resolve(SRC_ROOT, "src/components/ui/sheet.tsx");

describe("Mobile sidebar hamburger: button in header", () => {
  const src = readFileSync(APP_SHELL, "utf-8");

  it("imports the Menu icon from lucide-react", () => {
    expect(src).toMatch(/Menu\b/);
    expect(src).toMatch(/from "lucide-react"/);
  });

  it("imports Sheet + SheetContent + SheetHeader + SheetTitle + SheetDescription from ui/sheet", () => {
    expect(src).toMatch(/import\s*\{[\s\S]*?Sheet,[\s\S]*?SheetContent,[\s\S]*?SheetHeader,[\s\S]*?SheetTitle,[\s\S]*?SheetDescription,[\s\S]*?\}\s*from\s*["']@\/components\/ui\/sheet["']/);
  });

  it("has a hamburger button visible only below lg (lg:hidden)", () => {
    // The button must be hidden on desktop (where the aside sidebar is visible)
    // and visible on mobile. The lg:hidden class achieves this.
    expect(src).toMatch(/<Button[^>]*className="lg:hidden"[^>]*>/);
  });

  it("hamburger button has aria-label='Open navigation menu'", () => {
    expect(src).toMatch(/aria-label="Open navigation menu"/);
  });

  it("hamburger button has aria-haspopup='dialog' (announces as a dialog trigger to SR)", () => {
    expect(src).toMatch(/aria-haspopup="dialog"/);
  });

  it("hamburger button has aria-expanded bound to mobileNavOpen state", () => {
    // aria-expanded tells SR users whether the drawer is currently open.
    expect(src).toMatch(/aria-expanded=\{mobileNavOpen\}/);
  });

  it("hamburger button uses the Menu icon", () => {
    expect(src).toMatch(/<Menu\s+className="h-5 w-5"\s*\/>/);
  });

  it("hamburger button onClick opens the Sheet (setMobileNavOpen(true))", () => {
    expect(src).toMatch(/onClick=\{\(\) => setMobileNavOpen\(true\)\}/);
  });

  it("hamburger button has h-11 w-11 OR is a size='icon' button (touch target ≥44px)", () => {
    // Wave 1 established the ≥44px touch-target rule. The hamburger must
    // comply — either via explicit h-11 w-11 className OR via size="icon"
    // (which the Wave 1 contract test already verifies has h-11 w-11).
    // The button uses size="icon" — verify. Note: the JSX spans multiple
    // lines (Prettier reformats), so we use [\s\S] instead of . to match
    // across newlines.
    expect(src).toMatch(/<Button[\s\S]*?size="icon"[\s\S]*?aria-label="Open navigation menu"/);
  });
});

describe("Mobile sidebar hamburger: Sheet drawer", () => {
  const src = readFileSync(APP_SHELL, "utf-8");

  it("has mobileNavOpen state (controls the Sheet open/close)", () => {
    expect(src).toMatch(/const \[mobileNavOpen, setMobileNavOpen\] = useState\(false\)/);
  });

  it("renders a <Sheet> with open + onOpenChange bound to mobileNavOpen state", () => {
    expect(src).toMatch(/<Sheet\s+open=\{mobileNavOpen\}\s+onOpenChange=\{setMobileNavOpen\}>/);
  });

  it("SheetContent uses side='left' (slides in from the left, matching the desktop sidebar position)", () => {
    expect(src).toMatch(/<SheetContent\s+side="left"/);
  });

  it("Sheet has a SheetTitle (provides aria-labelledby for the dialog)", () => {
    // Radix Dialog requires a Title for aria-labelledby. Without it, SR users
    // hear "dialog" with no name. SheetTitle renders the Radix Title primitive.
    expect(src).toMatch(/<SheetTitle>/);
  });

  it("Sheet has a SheetDescription (provides aria-describedby for the dialog)", () => {
    // Recommended by Radix — gives SR users a description of the dialog's
    // purpose. Without it, Radix logs a console warning.
    expect(src).toMatch(/<SheetDescription>/);
  });

  it("Sheet reuses the SAME SidebarNav component as the desktop aside (no duplication)", () => {
    // Find the SidebarNav usage inside the Sheet (the second occurrence in
    // the file). Verify it's the same component (not a copy).
    const sidebarNavMatches = [...src.matchAll(/<SidebarNav\b/g)];
    expect(sidebarNavMatches.length, "SidebarNav must be used twice (desktop aside + mobile Sheet)").toBe(2);
  });

  it("Sheet's SidebarNav onNavigate closes the Sheet before calling the real onNavigate", () => {
    // The wrapper: (view) => { setMobileNavOpen(false); onNavigate(view); }
    // This dismisses the drawer when the user picks a destination — matches
    // the standard mobile-nav UX expectation.
    expect(src).toMatch(/onNavigate=\{\(view\) => \{[\s\S]*?setMobileNavOpen\(false\);[\s\S]*?onNavigate\(view\);[\s\S]*?\}\}/);
  });

  it("Sheet's SidebarNav receives the same nav + standalone + activeView props as the desktop aside", () => {
    // Find the mobile Sheet's SidebarNav block + verify it has all 4 props.
    const sheetBlockMatch = src.match(/<Sheet[\s\S]*?<SidebarNav[\s\S]*?\/>/);
    expect(sheetBlockMatch, "Sheet > SidebarNav block must exist").not.toBeNull();
    const sheetBlock = sheetBlockMatch![0];
    expect(sheetBlock).toMatch(/nav=\{nav\}/);
    expect(sheetBlock).toMatch(/standalone=\{standalone\}/);
    expect(sheetBlock).toMatch(/activeView=\{activeView\}/);
  });
});

describe("Mobile sidebar hamburger: desktop sidebar still works", () => {
  const src = readFileSync(APP_SHELL, "utf-8");

  it("desktop <aside> is still lg:block (visible on desktop, hidden on mobile)", () => {
    // The mobile Sheet is ADDITIVE — it doesn't replace the desktop aside.
    // Both exist; CSS controls which is visible at each breakpoint.
    expect(src).toMatch(/<aside className="hidden w-60 shrink-0 border-r bg-card lg:block">/);
  });

  it("desktop <aside> still uses the original onNavigate (not the wrapper)", () => {
    // The desktop aside calls onNavigate directly — no need to close any
    // Sheet (it's not visible on desktop). Only the mobile Sheet uses the
    // wrapper.
    const asideBlockMatch = src.match(/<aside[\s\S]*?<\/aside>/);
    expect(asideBlockMatch, "<aside> block must exist").not.toBeNull();
    const asideBlock = asideBlockMatch![0];
    expect(asideBlock).toMatch(/onNavigate=\{onNavigate\}/);
    // The aside must NOT use the wrapper (no setMobileNavOpen call).
    expect(asideBlock).not.toMatch(/setMobileNavOpen/);
  });
});

describe("Mobile sidebar hamburger: Sheet primitive provides a11y guarantees", () => {
  // These tests verify the SHEET PRIMITIVE itself provides the a11y
  // guarantees we rely on. If a future refactor swaps the Sheet primitive
  // for something else, these tests catch the regression.

  const sheetSrc = readFileSync(SHEET_PRIMITIVE, "utf-8");

  it("Sheet is built on Radix Dialog (provides focus trap + Escape + overlay click + focus return)", () => {
    expect(sheetSrc).toMatch(/@radix-ui\/react-dialog/);
  });

  it("SheetContent renders a SheetPrimitive.Close (the X button, top-right)", () => {
    expect(sheetSrc).toMatch(/SheetPrimitive\.Close/);
  });

  it("SheetClose has sr-only 'Close' text (SR-accessible name)", () => {
    expect(sheetSrc).toMatch(/<span className="sr-only">Close<\/span>/);
  });

  it("SheetTitle renders SheetPrimitive.Title (provides aria-labelledby)", () => {
    expect(sheetSrc).toMatch(/SheetPrimitive\.Title/);
  });

  it("SheetDescription renders SheetPrimitive.Description (provides aria-describedby)", () => {
    expect(sheetSrc).toMatch(/SheetPrimitive\.Description/);
  });

  it("Sheet supports side='left' (the variant used by the mobile sidebar)", () => {
    expect(sheetSrc).toMatch(/side === "left"/);
    expect(sheetSrc).toMatch(/slide-out-to-left/);
    expect(sheetSrc).toMatch(/slide-in-from-left/);
  });

  it("SheetContent has an overlay (click-outside-to-close)", () => {
    expect(sheetSrc).toMatch(/SheetOverlay/);
    expect(sheetSrc).toMatch(/bg-black\/50/);
  });
});

describe("Mobile sidebar hamburger: no regressions in prior-wave work", () => {
  const src = readFileSync(APP_SHELL, "utf-8");

  it("Wave 4 skip-to-content link still present (first focusable element)", () => {
    expect(src).toMatch(/Skip to main content/);
    expect(src).toMatch(/href="#main-content"/);
  });

  it("Wave 4 main landmark with id='main-content' still present", () => {
    expect(src).toMatch(/<main[^>]*id="main-content"/);
  });

  it("Wave 5 ScrollToTop still rendered as a sibling of the main layout", () => {
    expect(src).toMatch(/<ScrollToTop\s*\/>/);
  });

  it("Wave 4 notifications Bell button still has h-11 w-11 (touch target preserved)", () => {
    expect(src).toMatch(/<Button variant="ghost" size="icon" className="relative h-11 w-11">/);
  });
});
