"use client";

import { useState } from "react";
import { FileText, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentPreviewModal } from "@/components/app/document-preview-modal";

// =============================================================================
// DocumentList — client component that renders the document cards on the
// union detail page + manages the preview modal state.
//
// Extracted as a client component because the modal needs `useState` for
// open/close. The parent union page is a server component and can't hold
// client state.
//
// Each document card shows: icon, document type, version + upload date +
// file extension. The "View" button opens the DocumentPreviewModal instead
// of navigating to a new tab.
// =============================================================================

interface DocumentItem {
  id: string;
  documentType: string;
  versions: Array<{
    id: string;
    versionNumber: number;
    fileName: string;
    uploadedAt: string | Date;
    fileExtension: string | null;
  }>;
}

interface DocumentListProps {
  documents: DocumentItem[];
}

export function DocumentList({ documents }: DocumentListProps) {
  const [previewDoc, setPreviewDoc] = useState<{
    documentType: string;
    version: number;
    fileName: string;
    fileExtension: string | null;
    downloadUrl: string;
  } | null>(null);

  if (documents.length === 0) {
    return (
      <Card className="print-card">
        <CardContent className="py-8 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground no-print" />
          <p className="text-sm font-medium">No public documents published</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The Registrar has not published any documents for this union yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {documents.map((doc) => {
          const lv = doc.versions[0];
          const downloadUrl = lv ? `/api/public/files/${lv.id}` : null;
          return (
            <Card key={doc.id} className="print-card print-avoid-break">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground no-print" />
                  <div>
                    <p className="text-sm font-medium">{doc.documentType}</p>
                    {lv && (
                      <p className="text-xs text-muted-foreground">
                        Version {lv.versionNumber} · uploaded{" "}
                        {new Date(lv.uploadedAt).toLocaleDateString()}
                        {lv.fileExtension && ` · ${lv.fileExtension.toUpperCase()}`}
                      </p>
                    )}
                  </div>
                </div>
                {downloadUrl && lv && (
                  <div className="flex items-center gap-2 no-print">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPreviewDoc({
                          documentType: doc.documentType,
                          version: lv.versionNumber,
                          fileName: lv.fileName,
                          fileExtension: lv.fileExtension,
                          downloadUrl,
                        })
                      }
                    >
                      <ExternalLink className="mr-1 h-3 w-3" />
                      View
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {previewDoc && (
        <DocumentPreviewModal
          open={!!previewDoc}
          onOpenChange={(open) => !open && setPreviewDoc(null)}
          documentType={previewDoc.documentType}
          version={previewDoc.version}
          fileName={previewDoc.fileName}
          fileExtension={previewDoc.fileExtension}
          downloadUrl={previewDoc.downloadUrl}
        />
      )}
    </>
  );
}
