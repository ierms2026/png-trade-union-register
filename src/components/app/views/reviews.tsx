"use client";

import { useState } from "react";
import { FileCheck, CheckCircle2, XCircle, Eye, Loader2, Clock, FileText } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";
import { DocumentPreviewModal } from "@/components/app/document-preview-modal";

// =============================================================================
// Reviews view — pending document review queue for the Registrar.
// Mirrors the retention view's structure. Each card has View, Approve, and
// Reject buttons. Reject requires a reason (min 10 chars).
// =============================================================================

interface ReviewItem {
  documentId: string;
  documentType: string;
  unionId: string;
  unionName: string;
  registrationNo: string;
  versionNumber: number;
  fileName: string;
  fileExtension: string | null;
  uploadedAt: string;
  uploadedById: string | null;
  uploadedByEmail: string | null;
  fileSize: number;
}

export function ReviewsView() {
  const { data, loading, error, refetch } = useFetch<{ pending: ReviewItem[] }>("/api/reviews");
  const [rejectTarget, setRejectTarget] = useState<ReviewItem | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{
    documentType: string; version: number; fileName: string;
    fileExtension: string | null; downloadUrl: string;
  } | null>(null);

  if (loading) return <CardListSkeleton count={4} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data) return null;

  async function approve(documentId: string) {
    try {
      const res = await fetch(`/api/reviews/${documentId}/approve`, { method: "POST", credentials: "include" });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error || "Failed to approve document."); return; }
      toast.success("Document approved.", {
        description: "The document now counts toward the union's compliance score. The uploading Officer has been notified.",
      });
      refetch();
    } catch { toast.error("Network error."); }
  }

  async function reject(documentId: string, reason: string) {
    try {
      const res = await fetch(`/api/reviews/${documentId}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ reason }),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error || "Failed to reject document."); return; }
      toast.success("Document rejected.", { description: "The uploading Officer has been notified with your reason." });
      refetch();
    } catch { toast.error("Network error."); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Review Queue</h1>
        <p className="text-sm text-muted-foreground">
          Documents uploaded by Union Officials, awaiting your review. Pending documents don&apos;t count toward compliance until approved.
        </p>
      </div>

      {data.pending.length === 0 ? (
        <EmptyState icon={FileCheck} title="No documents pending review"
          description="All uploaded documents have been reviewed. New uploads will appear here automatically." />
      ) : (
        <div className="space-y-3">
          {data.pending.map((item) => (
            <Card key={item.documentId}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-medium">{item.documentType}</h3>
                      <Badge variant="outline" className="text-xs">v{item.versionNumber}</Badge>
                      <Badge variant="secondary" className="text-xs">
                        <Clock className="mr-1 h-3 w-3" />Pending
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.unionName} ({item.registrationNo})</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>File: {item.fileName}{item.fileExtension ?? ""}</span>
                      <span>Size: {(item.fileSize / 1024).toFixed(1)} KB</span>
                      <span>Uploaded: {new Date(item.uploadedAt).toLocaleString()}</span>
                      {item.uploadedByEmail && <span>By: {item.uploadedByEmail}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() =>
                      setPreviewDoc({
                        documentType: item.documentType, version: item.versionNumber,
                        fileName: item.fileName, fileExtension: item.fileExtension,
                        downloadUrl: `/api/unions/${item.unionId}/documents/${item.documentId}/download`,
                      })
                    }>
                      <Eye className="mr-1 h-3 w-3" />View
                    </Button>
                    <Button size="sm" variant="default" onClick={() => approve(item.documentId)}>
                      <CheckCircle2 className="mr-1 h-3 w-3" />Approve
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setRejectTarget(item)}>
                      <XCircle className="mr-1 h-3 w-3" />Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {rejectTarget && (
        <RejectDialog item={rejectTarget}
          onConfirm={(reason) => { reject(rejectTarget.documentId, reason); setRejectTarget(null); }}
          onClose={() => setRejectTarget(null)} />
      )}

      {previewDoc && (
        <DocumentPreviewModal open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}
          documentType={previewDoc.documentType} version={previewDoc.version}
          fileName={previewDoc.fileName} fileExtension={previewDoc.fileExtension}
          downloadUrl={previewDoc.downloadUrl} />
      )}
    </div>
  );
}

function RejectDialog({ item, onConfirm, onClose }: {
  item: ReviewItem; onConfirm: (reason: string) => void; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const canConfirm = reason.trim().length >= 10;

  async function handleConfirm() {
    if (!canConfirm) return;
    setRejecting(true);
    onConfirm(reason.trim());
    setRejecting(false);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />Reject Document
          </DialogTitle>
          <DialogDescription>
            The uploading Officer will be notified with your reason. They can upload a revised version for re-review.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{item.documentType}</p>
            <p className="text-muted-foreground">{item.unionName} ({item.registrationNo})</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Version {item.versionNumber} · Uploaded {new Date(item.uploadedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rejection-reason">Reason for rejection <span className="text-destructive">*</span></Label>
            <Textarea id="rejection-reason" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Explain what needs to be fixed before re-uploading. The Officer will see this message."
              rows={4} autoFocus className={canConfirm ? "border-green-400" : ""} />
            <p className="text-xs text-muted-foreground">
              {reason.trim().length < 10
                ? `${10 - reason.trim().length} more characters needed.`
                : "✓ Reason is detailed enough."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={rejecting}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={!canConfirm || rejecting}>
            {rejecting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Rejecting...</>
                       : <><XCircle className="mr-2 h-4 w-4" />Confirm Rejection</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
