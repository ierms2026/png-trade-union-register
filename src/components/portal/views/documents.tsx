"use client";

import { useState, type FormEvent } from "react";
import {
  Upload, FileText, Clock, CheckCircle2, XCircle, Loader2,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";
import { DocumentPreviewModal } from "@/components/app/document-preview-modal";

// =============================================================================
// PortalDocumentsView — chunk 5
//
// Rep-facing document list + upload form. Reps can:
//   - View all their union's documents (regardless of isPublic)
//   - See review status (PENDING / APPROVED / REJECTED) per document
//   - Upload new documents or new versions of existing types
//
// Uploads route to the existing /api/unions/[unionId]/documents endpoint
// (updated in chunk 5 to accept REPRESENTATIVE). Every upload enters the
// review queue — Registrar approves before it's "official".
// =============================================================================

interface PortalUser {
  id: string;
  email: string;
  role: "REPRESENTATIVE";
  assignedUnionId: string | null;
  twoFactorEnabled: boolean;
}

interface DocumentVersion {
  id: string;
  versionNumber: number;
  fileName: string;
  fileSize: number;
  fileExtension: string | null;
  uploadedAt: string;
  uploadedByEmail: string;
}

interface UnionDocument {
  id: string;
  documentType: string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  reviewedAt: string | null;
  rejectionReason: string | null;
  disposedAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  latestVersion: DocumentVersion | null;
}

// Pull the list of available document types from the compliance rules —
// the rep can only upload types that exist as rules.
interface ComplianceMatrixResponse {
  documentTypes: string[];
}

import { REVIEW_STATUS_CONFIG } from "@/lib/dashboard/vocabulary";

export function PortalDocumentsView({ user }: { user: PortalUser }) {
  const { data, loading, error, refetch } = useFetch<{ documents: UnionDocument[] }>(
    "/api/portal/documents",
  );
  const { data: complianceData } = useFetch<ComplianceMatrixResponse>("/api/portal/compliance");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<UnionDocument | null>(null);

  const documents = data?.documents ?? [];
  const documentTypes = complianceData?.documentTypes ?? [];

  if (loading) return <CardListSkeleton count={4} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Upload, view, and track the review status of your union&apos;s documents
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} disabled={documentTypes.length === 0}>
          <Upload className="mr-2 h-4 w-4" />
          Upload Document
        </Button>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents on file"
          description="Upload your first document to get started. All uploads are reviewed by the Registrar before becoming official."
          action={{
            label: "Upload Document",
            onClick: () => setUploadOpen(true),
          }}
        />
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => {
            const cfg = REVIEW_STATUS_CONFIG[doc.reviewStatus];
            const StatusIcon = cfg.icon;
            return (
              <Card key={doc.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <h3 className="truncate text-sm font-semibold">{doc.documentType}</h3>
                      </div>
                      {doc.latestVersion ? (
                        <div className="ml-6 space-y-0.5 text-xs text-muted-foreground">
                          <p>
                            v{doc.latestVersion.versionNumber} ·{" "}
                            {doc.latestVersion.fileName}
                            {doc.latestVersion.fileExtension && ` (${doc.latestVersion.fileExtension})`}
                          </p>
                          <p>
                            {(doc.latestVersion.fileSize / 1024).toFixed(1)} KB · uploaded{" "}
                            {new Date(doc.latestVersion.uploadedAt).toLocaleDateString()} by{" "}
                            {doc.latestVersion.uploadedByEmail}
                          </p>
                          {doc.reviewStatus === "REJECTED" && doc.rejectionReason && (
                            <p className="mt-1 rounded border border-red-200 bg-red-50 p-2 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                              <strong>Rejected:</strong> {doc.rejectionReason}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="ml-6 text-xs text-muted-foreground">No version uploaded</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge variant="outline" className={cfg.tone}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {cfg.label}
                      </Badge>
                      {doc.latestVersion && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewDoc(doc)}
                        >
                          <History className="mr-1 h-3 w-3" />
                          View
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Upload dialog */}
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        unionId={user.assignedUnionId}
        documentTypes={documentTypes}
        existingTypes={documents.map((d) => d.documentType)}
        onUploaded={() => {
          refetch();
          setUploadOpen(false);
        }}
      />

      {/* Preview modal */}
      {previewDoc && previewDoc.latestVersion && (
        <DocumentPreviewModal
          open={true}
          onOpenChange={(v) => { if (!v) setPreviewDoc(null); }}
          documentType={previewDoc.documentType}
          version={previewDoc.latestVersion.versionNumber}
          fileName={previewDoc.latestVersion.fileName}
          fileExtension={previewDoc.latestVersion.fileExtension}
          downloadUrl={`/api/unions/${user.assignedUnionId}/documents/${previewDoc.id}/versions/${previewDoc.latestVersion.id}/download`}
        />
      )}
    </div>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  unionId,
  documentTypes,
  existingTypes,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unionId: string | null;
  documentTypes: string[];
  existingTypes: string[];
  onUploaded: () => void;
}) {
  const [documentType, setDocumentType] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setDocumentType("");
    setTitle("");
    setFile(null);
    setEffectiveDate("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!unionId) {
      toast.error("No assigned union.");
      return;
    }
    if (!documentType || !title || !file) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", documentType);
      formData.append("title", title);
      if (effectiveDate) formData.append("effectiveDate", effectiveDate);

      const res = await fetch(`/api/unions/${unionId}/documents`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Upload failed.");
        return;
      }
      toast.success(`Uploaded v${data.version.versionNumber} of ${documentType}. It's now pending Registrar review.`);
      reset();
      onUploaded();
    } catch (err) {
      console.error(err);
      toast.error("Network error during upload.");
    } finally {
      setSubmitting(false);
    }
  }

  const isNewType = documentType && !existingTypes.includes(documentType);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Upload a new document or a new version of an existing type. All uploads
            enter the review queue — the Registrar approves before it&apos;s official.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-type">Document Type *</Label>
            <Select value={documentType} onValueChange={setDocumentType} required>
              <SelectTrigger id="doc-type">
                <SelectValue placeholder="Select a document type" />
              </SelectTrigger>
              <SelectContent>
                {documentTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                    {existingTypes.includes(t) && " (new version)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isNewType && (
              <p className="text-xs text-muted-foreground">
                This will be the first version of this document type for your union.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Document Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., 2026 Annual Return"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="file">File *</Label>
            <Input
              id="file"
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="effective-date">Effective Date (optional)</Label>
            <Input
              id="effective-date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !file || !documentType || !title}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload for Review
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
