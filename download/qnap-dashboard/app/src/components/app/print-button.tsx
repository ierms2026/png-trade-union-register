"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * PrintButton — a client component that triggers window.print().
 *
 * Must be a client component because `onClick` is a client-side event
 * handler. The union detail page is a server component, so it can't
 * pass an event handler directly.
 */
export function PrintButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      className="ml-2"
    >
      <Printer className="mr-1.5 h-3.5 w-3.5" />
      Print
    </Button>
  );
}
