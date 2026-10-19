import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================================
// ScrollToTop functional bugfix (found during Wave 4 audit, deferred as
// "out of a11y scope" — fixed here as a standalone bug).
//
// BUG: ScrollToTop listened to `window.scrollY` + the window "scroll" event.
// But the app shell uses `<main id="main-content" className="flex-1
// overflow-y-auto">` as the scroll container — the window itself never
// scrolls (the layout is min-h-screen flex flex-col with <main> taking the
// remaining height). So the scroll event never fired, window.scrollY was
// always 0, and the button NEVER appeared — even after scrolling down
// 5000px inside <main>.
//
// FIX: query `#main-content` after mount + attach the scroll listener to
// THAT element. The click handler also calls `mainEl.scrollTo(...)` (not
// `window.scrollTo`). Defensive retry loop covers the edge case where the
// element isn't in the DOM yet at mount time.
//
// TESTS:
//   - The component no longer references window.scrollY (the broken pattern).
//   - The component references document.getElementById("main-content").
//   - The component attaches the scroll listener to the element (not window).
//   - The click handler scrolls the element (not window).
//   - Defensive: retry loop for the case where the element isn't in the DOM
//     yet at mount time.
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");
const SCROLL_TO_TOP = resolve(SRC_ROOT, "src/components/app/scroll-to-top.tsx");
const APP_SHELL = resolve(SRC_ROOT, "src/components/app/app-shell.tsx");

describe("ScrollToTop bugfix: listens to the <main> scroll container, not window", () => {
  // Read the source + strip JS/JSX comments before pattern-matching, so
  // explanatory comments mentioning the old broken pattern (e.g. "listened
  // to window.scrollY") don't false-positive.
  const rawSrc = readFileSync(SCROLL_TO_TOP, "utf-8");
  // Strip line comments (// ...) + block comments (/* ... */)
  const src = rawSrc
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  it("app-shell has <main id=\"main-content\"> (the scroll container)", () => {
    // Verify the target element exists in the shell — the bugfix depends
    // on this id being stable. If a future refactor renames it, this test
    // catches it.
    const shellSrc = readFileSync(APP_SHELL, "utf-8");
    expect(shellSrc).toMatch(/<main[^>]*id="main-content"/);
  });

  it("ScrollToTop no longer uses window.scrollY in code (only in comments)", () => {
    // The OLD code had `setVisible(window.scrollY > 400)`. The NEW code
    // uses `el.scrollTop` (the element's scroll position). After stripping
    // comments, no occurrence of window.scrollY should remain.
    expect(src).not.toMatch(/window\.scrollY/);
  });

  it("ScrollToTop no longer attaches a scroll listener to window", () => {
    // The OLD code had `window.addEventListener("scroll", ...)`. The NEW
    // code attaches to the element. Verify window.addEventListener with
    // "scroll" is gone (window may still be referenced for other things
    // — we only care about the scroll listener).
    expect(src).not.toMatch(/window\.addEventListener\(\s*["']scroll["']/);
  });

  it("ScrollToTop queries document.getElementById for the scroll container", () => {
    // The code uses a SCROLL_CONTAINER_ID constant (value "main-content")
    // rather than the literal string. Verify the getElementById call +
    // the constant definition.
    expect(src).toMatch(/document\.getElementById\(/);
    expect(src).toMatch(/SCROLL_CONTAINER_ID\s*=\s*["']main-content["']/);
  });

  it("ScrollToTop attaches the scroll listener to the queried element (not window)", () => {
    // The attach function should call el.addEventListener("scroll", ...).
    expect(src).toMatch(/addEventListener\(\s*["']scroll["']/);
    expect(src).not.toMatch(/window\.addEventListener\(\s*["']scroll["']/);
  });

  it("ScrollToTop uses the element's scrollTop (not window.scrollY) for visibility", () => {
    // The visibility check should be `el.scrollTop > THRESHOLD` (or
    // container.scrollTop — variable name may differ). After stripping
    // comments, the only scrollTop reference should be on the element,
    // not window.
    expect(src).toMatch(/\.scrollTop\s*>\s*VISIBILITY_THRESHOLD/);
  });

  it("ScrollToTop's click handler calls el.scrollTo (not window.scrollTo as primary)", () => {
    // The click handler should query the element + call scrollTo on it.
    // window.scrollTo as a FALLBACK is acceptable (defensive) — but the
    // PRIMARY path must be el.scrollTo.
    expect(src).toMatch(/el\.scrollTo\(\s*\{\s*top:\s*0,\s*behavior:\s*["']smooth["']\s*\}\s*\)/);
  });

  it("ScrollToTop has a defensive retry loop for when the element isn't in the DOM yet", () => {
    // The element should be in the DOM by mount time (app-shell renders
    // <main> as a sibling of <ScrollToTop />), but a retry loop covers
    // edge cases (SSR hydration timing, future refactors).
    expect(src).toMatch(/setInterval/);
    expect(src).toMatch(/MAX_RETRIES/);
    // The retry loop must be cleared on unmount (no leak).
    expect(src).toMatch(/clearInterval\(retryTimer\)/);
  });

  it("ScrollToTop cleans up the scroll listener on unmount (no leak)", () => {
    // The detach function should call removeEventListener. The cleanup
    // return from useEffect should call detach.
    expect(src).toMatch(/removeEventListener\(\s*["']scroll["']/);
    expect(src).toMatch(/detach\(\)/);
  });

  it("ScrollToTop cleans up the retry timer on unmount (no leak)", () => {
    // If the component unmounts while the retry loop is still running
    // (element never found), the timer must be cleared.
    expect(src).toMatch(/if \(retryTimer\)/);
  });

  it("the visibility threshold is preserved (400px — same as before)", () => {
    // Don't change the UX during the bugfix — keep the 400px threshold.
    expect(src).toMatch(/VISIBILITY_THRESHOLD\s*=\s*400/);
  });

  it("the button's position + aria-label are preserved (no visual/a11y regression)", () => {
    // The bugfix should only change the scroll-detection mechanism, not
    // the button's appearance or a11y.
    expect(src).toMatch(/aria-label="Scroll to top"/);
    expect(src).toMatch(/fixed bottom-6 left-6/);
    expect(src).toMatch(/h-11 w-11/); // Wave 1 touch-target fix preserved
  });
});

describe("ScrollToTop bugfix: integration with app-shell", () => {
  const shellSrc = readFileSync(APP_SHELL, "utf-8");

  it("app-shell renders <ScrollToTop /> as a sibling of <main>", () => {
    // The bugfix depends on <main id="main-content"> being in the DOM when
    // ScrollToTop mounts. Verify the render order: <main> is rendered
    // BEFORE <ScrollToTop /> in app-shell.tsx (so it's in the DOM by the
    // time ScrollToTop's useEffect runs).
    const mainIdx = shellSrc.indexOf('<main id="main-content"');
    const scrollIdx = shellSrc.indexOf("<ScrollToTop");
    expect(mainIdx, "<main> must exist in app-shell").toBeGreaterThan(-1);
    expect(scrollIdx, "<ScrollToTop /> must exist in app-shell").toBeGreaterThan(-1);
    expect(mainIdx, "<main> must be rendered BEFORE <ScrollToTop />").toBeLessThan(scrollIdx);
  });
});
