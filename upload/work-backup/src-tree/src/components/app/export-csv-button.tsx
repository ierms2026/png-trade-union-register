"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

// =============================================================================
// ExportCsvButton — a reusable button that triggers a CSV download.
//
// USAGE:
//   <ExportCsvButton href="/api/export/unions" />
//   <ExportCsvButton href={`/api/export/audit?${params}`} label="Export Filtered" />
//
// The button navigates the browser to the export URL, which returns a
// Content-Type: text/csv response with a Content-Disposition: attachment
// header. The browser downloads the file automatically.
// =============================================================================

interface ExportCsvButtonProps {
  href: string;
  label?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
}

export function ExportCsvButton({
  href,
  label = "Export CSV",
  size = "sm",
  variant = "outline",
}: ExportCsvButtonProps) {
  return (
    <a href={href} download>
      <Button variant={variant} size={size} className="gap-1.5">
        <Download className="h-3.5 w-3.5" />
        {label}
      </Button>
    </a>
  );
}
