"use client";

import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

// =============================================================================
// ScrollToTop — floating button that appears after the user scrolls down.
//
// Renders a fixed-position button in the bottom-left corner (avoids the
// toast notifications in the bottom-right). Only visible when the user
// has scrolled more than 400px from the top. Clicking it smooth-scrolls
// back to the top.
//
// The button is small, uses the navy primary color with the gold accent
// border, and has a subtle entrance/exit animation via opacity + translate.
// =============================================================================

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 400);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    // Check initial position (in case the page loads scrolled down)
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <Button
      variant="default"
      size="icon"
      className="fixed bottom-6 left-6 z-40 h-11 w-11 rounded-full border-2 border-accent shadow-lg transition-all hover:scale-105"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Scroll to top"
    >
      <ArrowUp className="h-5 w-5" />
    </Button>
  );
}
