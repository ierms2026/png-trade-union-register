"use client";

import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

// =============================================================================
// ScrollToTop — floating button that appears after the user scrolls down.
//
// Renders a fixed-position button in the bottom-left corner (avoids the
// toast notifications in the bottom-right). Only visible when the user
// has scrolled more than 400px from the top of the scroll container.
// Clicking it smooth-scrolls back to the top.
//
// The button is small, uses the navy primary color with the gold accent
// border, and has a subtle entrance/exit animation via opacity + translate.
//
// SCROLL CONTAINER (Wave 5 bugfix):
//   The app shell uses `<main id="main-content" className="flex-1
//   overflow-y-auto">` as the scroll container — the window itself never
//   scrolls (the layout is min-h-screen flex flex-col with <main> taking
//   the remaining height). The PREVIOUS implementation listened to
//   `window.scrollY` + `window` "scroll" event, which never fired because
//   the window doesn't scroll — so the button never appeared.
//
//   This implementation queries `#main-content` after mount + attaches the
//   scroll listener to THAT element. The click handler also calls
//   `mainEl.scrollTo(...)` (not `window.scrollTo`). Defensive: if the
//   element isn't found (e.g., ScrollToTop mounted before the shell —
//   shouldn't happen given the render order in app-shell.tsx), the effect
//   polls for it on a 100ms retry until it appears, then attaches.
// =============================================================================

const SCROLL_CONTAINER_ID = "main-content";
/** px from the top of the scroll container before the button appears. */
const VISIBILITY_THRESHOLD = 400;
/** ms to wait between retries when the scroll container isn't in the DOM yet. */
const RETRY_INTERVAL_MS = 100;
/** max retries before giving up (10s total — prevents an infinite loop if
 *  the #main-content element genuinely doesn't exist on this page). */
const MAX_RETRIES = 100;

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let container: HTMLElement | null = null;
    let handleScroll: (() => void) | null = null;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setInterval> | null = null;

    function attach(el: HTMLElement) {
      container = el;
      handleScroll = () => setVisible(el.scrollTop > VISIBILITY_THRESHOLD);
      el.addEventListener("scroll", handleScroll, { passive: true });
      // Check initial position (in case the page loads scrolled down —
      // e.g., the browser restores the previous scroll position on reload).
      handleScroll();
    }

    function detach() {
      if (container && handleScroll) {
        container.removeEventListener("scroll", handleScroll);
      }
      container = null;
      handleScroll = null;
    }

    // The #main-content element is rendered by app-shell.tsx as a sibling
    // of <ScrollToTop />. By the time this useEffect runs (after mount),
    // it should already be in the DOM. The retry loop is defensive — it
    // covers edge cases like SSR hydration timing or a future refactor
    // that conditionally renders the shell.
    function tryAttach() {
      const el = document.getElementById(SCROLL_CONTAINER_ID);
      if (el) {
        attach(el);
        if (retryTimer) {
          clearInterval(retryTimer);
          retryTimer = null;
        }
        return true;
      }
      return false;
    }

    if (!tryAttach()) {
      retryTimer = setInterval(() => {
        retryCount++;
        if (tryAttach() || retryCount >= MAX_RETRIES) {
          if (retryTimer) {
            clearInterval(retryTimer);
            retryTimer = null;
          }
        }
      }, RETRY_INTERVAL_MS);
    }

    return () => {
      detach();
      if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
      }
    };
  }, []);

  if (!visible) return null;

  return (
    <Button
      variant="default"
      size="icon"
      className="fixed bottom-6 left-6 z-40 h-11 w-11 rounded-full border-2 border-accent shadow-lg transition-all hover:scale-105"
      onClick={() => {
        // Wave 5 bugfix: scroll the <main> container (not window). The
        // window doesn't scroll in this layout — calling window.scrollTo
        // would be a no-op, leaving the user stuck.
        const el = document.getElementById(SCROLL_CONTAINER_ID);
        if (el) {
          el.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          // Fallback: if the container isn't found (defensive — shouldn't
          // happen given the button is only visible when the container
          // has scrolled), try the window. Worst case this is a no-op.
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }}
      aria-label="Scroll to top"
    >
      <ArrowUp className="h-5 w-5" />
    </Button>
  );
}
