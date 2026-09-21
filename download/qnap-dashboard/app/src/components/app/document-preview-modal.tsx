"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

// =============================================================================
// DocumentPreviewModal — in-app PDF preview via iframe.
//
// Opens a Dialog containing an <iframe> that loads the document's download
// URL. The browser's native PDF viewer renders the file inline, so the
// user stays on the union page instead of navigating to a new tab.
//
// WHY IFRAME (not a JS PDF renderer):
//   - pdf.js / react-pdf add 500KB+ to the bundle for a feature that the
//     browser already handles natively. Every modern browser has a built-in
//     PDF viewer that supports zoom, search, page navigation, and download.
//   - The iframe approach works with any file type the browser can render
//     (PDF, images, etc.) without extra dependencies.
//
// FALLBACK:
//   If the browser can't display the file inline (rare — some mobile
//   browsers don't support PDF in iframes), a "Open in new tab" button
//   is provided as a fallback.
// =============================================================================

interface DocumentPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentType: string;
  version: number;
  fileName: string;
  fileExtension: string | null;
  downloadUrl: string;
}

export function DocumentPreviewModal({
  open,
  onOpenChange,
  documentType,
  version,
  fileName,
  fileExtension,
  downloadUrl,
}: DocumentPreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg">{documentType}</DialogTitle>
              <DialogDescription className="text-xs">
                Version {version} · {fileName}
                {fileExtension && ` · ${fileExtension.toUpperCase()}`}
              </DialogDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Open in new tab
              </a>
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <iframe
            src={downloadUrl}
            className="h-full w-full border-0"
            title={`${documentType} — Version ${version}`}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
