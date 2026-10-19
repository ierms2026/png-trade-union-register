"use client";

import { useState } from "react";
import { FileCheck, CheckCircle2, XCircle, Eye, Loader2, Clock, FileText, ShieldCheck, Undo2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";
import { DocumentPreviewModal } from "@/components/app/document-preview-modal";
import { REVIEW_STATUS_CONFIG } from "@/lib/dashboard/vocabulary";

import { PageHeader } from "@/components/app/page-header";
// =============================================================================
// Reviews view — pending document review queue for the Registrar.
// Mirrors the retention view's structure. Each card has View, Approve, and
// Reject buttons. Reject requires a reason (min 10 chars).
//
// Wave 3 / Item 1: TWO-PERSON APPROVAL WORKFLOW.
// The queue is split into TWO buckets:
//   1. "Pending First Review" — documents with no first approval yet. The
//      Approve button records FIRST APPROVAL (does NOT finalize). The
//      document moves to bucket 2.
//   2. "Awaiting Second Approval" — documents with first approval but
//      reviewStatus still PENDING. A DIFFERENT Registrar (not the first
//      approver) must click Approve to finalize. The first approver sees
//      a "Withdraw" button instead of "Approve" (they can't second their
//      own approval — but they can take it back).
//
// Either bucket: clicking Reject cancels everything (clears first approval
// if any + sets reviewStatus = REJECTED + notifies the uploading Officer).
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
  // Wave 3 / Item 1: two-person approval metadata.
  firstApprovedById: string | null;
  firstApprovedAt: string | null;
  firstApproverEmail: string | null;
}

interface ReviewsResponse {
  pending: ReviewItem[];
  awaitingSecondApproval: ReviewItem[];
}

export function ReviewsView({ user }: { user?: { id: string; role: string } }) {
  const { data, loading, error, refetch } = useFetch<ReviewsResponse>("/api/reviews");
  const [rejectTarget, setRejectTarget] = useState<ReviewItem | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
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
      // Wave 3 / Item 1: differentiate the toast based on which stage fired.
      if (result.stage === "first_approval") {
        toast.success("First approval recorded.", {
          description: "Another Registrar needs to confirm to finalize the approval. They've been notified.",
        });
      } else {
        toast.success("Document approved.", {
          description: "The document now counts toward the union's compliance score. The uploading Officer has been notified.",
        });
      }
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

  // Wave 3 / Item 1: withdraw first approval. Only the first approver can
  // call this — the API enforces it server-side, but we also hide the
  // button for non-approvers (see ReviewCard below).
  async function withdraw(documentId: string) {
    setWithdrawingId(documentId);
    try {
      const res = await fetch(`/api/reviews/${documentId}/withdraw`, { method: "POST", credentials: "include" });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error || "Failed to withdraw approval."); return; }
      toast.success("First approval withdrawn.", {
        description: "The document is back in the pending queue. No notification was sent.",
      });
      refetch();
    } catch { toast.error("Network error."); }
    finally { setWithdrawingId(null); }
  }

  const pending = data.pending;
  const awaiting = data.awaitingSecondApproval;
  const totalPending = pending.length + awaiting.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review Queue"
        description={
          <>
            Documents uploaded by Union Officials, awaiting your review. Pending documents don&apos;t count toward compliance until approved.
            {totalPending > 0 && (
              <span className="ml-1">
                {" · "}
                <span className="font-medium text-foreground">{pending.length}</span> need first review
                {awaiting.length > 0 && (
                  <>
                    {" · "}
                    <span className="font-medium text-amber-700 dark:text-amber-400">{awaiting.length}</span> awaiting second approval
                  </>
                )}
              </span>
            )}
          </>
        }
      />

      {totalPending === 0 ? (
        <EmptyState icon={FileCheck} title="No documents pending review"
          description="All uploaded documents have been reviewed. New uploads will appear here automatically." />
      ) : (
        <div className="space-y-6">
          {/* Bucket 2: Awaiting Second Approval (shown FIRST — these need attention from a different Registrar) */}
          {awaiting.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <h2 className="text-lg font-semibold">Awaiting Second Approval</h2>
                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900">
                  {awaiting.length}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                These documents have been given first approval by a Registrar. A <strong>different</strong> Registrar must confirm to finalize.
                The first approver can withdraw their approval if needed.
              </p>
              <div className="space-y-3">
                {awaiting.map((item) => (
                  <ReviewCard
                    key={item.documentId}
                    item={item}
                    stage="awaiting_second"
                    currentUserId={user?.id}
                    onApprove={approve}
                    onReject={(it) => setRejectTarget(it)}
                    onWithdraw={withdraw}
                    withdrawing={withdrawingId === item.documentId}
                    onPreview={(it) =>
                      setPreviewDoc({
                        documentType: it.documentType, version: it.versionNumber,
                        fileName: it.fileName, fileExtension: it.fileExtension,
                        downloadUrl: `/api/unions/${it.unionId}/documents/${it.documentId}/download`,
                      })
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {/* Bucket 1: Pending First Review */}
          {pending.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Pending First Review</h2>
                <Badge variant="outline">{pending.length}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                These documents have been uploaded but haven&apos;t been reviewed yet. Click Approve to give first approval — a different Registrar will then need to confirm.
              </p>
              <div className="space-y-3">
                {pending.map((item) => (
                  <ReviewCard
                    key={item.documentId}
                    item={item}
                    stage="pending_first"
                    currentUserId={user?.id}
                    onApprove={approve}
                    onReject={(it) => setRejectTarget(it)}
                    onWithdraw={withdraw}
                    withdrawing={withdrawingId === item.documentId}
                    onPreview={(it) =>
                      setPreviewDoc({
                        documentType: it.documentType, version: it.versionNumber,
                        fileName: it.fileName, fileExtension: it.fileExtension,
                        downloadUrl: `/api/unions/${it.unionId}/documents/${it.documentId}/download`,
                      })
                    }
                  />
                ))}
              </div>
            </section>
          )}
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

// =============================================================================
// ReviewCard — single review queue item. Wave 3 / Item 1: behavior depends
// on the `stage` prop + whether the current user is the first approver.
// =============================================================================

function ReviewCard({
  item,
  stage,
  currentUserId,
  onApprove,
  onReject,
  onWithdraw,
  withdrawing,
  onPreview,
}: {
  item: ReviewItem;
  stage: "pending_first" | "awaiting_second";
  currentUserId?: string;
  onApprove: (documentId: string) => void;
  onReject: (item: ReviewItem) => void;
  onWithdraw: (documentId: string) => void;
  withdrawing: boolean;
  onPreview: (item: ReviewItem) => void;
}) {
  // The first approver can't second their own approval — show Withdraw instead.
  const isCurrentUserFirstApprover =
    item.firstApprovedById !== null && item.firstApprovedById === currentUserId;

  return (
    <Card className={stage === "awaiting_second" ? "border-amber-200 dark:border-amber-900" : undefined}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium">{item.documentType}</h3>
              <Badge variant="outline" className="text-xs">v{item.versionNumber}</Badge>
              {stage === "pending_first" ? (
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="cursor-help text-xs">
                        <Clock className="mr-1 h-3 w-3" />Pending
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      {REVIEW_STATUS_CONFIG.PENDING.definition}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                // Wave 3 / Item 1: yellow badge for awaiting-second-approval state.
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className="cursor-help bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900 dark:hover:bg-amber-950/30">
                        <ShieldCheck className="mr-1 h-3 w-3" />Awaiting 2nd approval
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      First approval given by {item.firstApproverEmail ?? "another Registrar"} on{" "}
                      {item.firstApprovedAt ? new Date(item.firstApprovedAt).toLocaleString() : "—"}.
                      A different Registrar must confirm to finalize.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{item.unionName} ({item.registrationNo})</p>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>File: {item.fileName}{item.fileExtension ?? ""}</span>
              <span>Size: {(item.fileSize / 1024).toFixed(1)} KB</span>
              <span>Uploaded: {new Date(item.uploadedAt).toLocaleString()}</span>
              {item.uploadedByEmail && <span>By: {item.uploadedByEmail}</span>}
            </div>
            {stage === "awaiting_second" && item.firstApproverEmail && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                First approved by <strong>{item.firstApproverEmail}</strong>
                {item.firstApprovedAt && <> on {new Date(item.firstApprovedAt).toLocaleString()}</>}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onPreview(item)}>
              <Eye className="mr-1 h-3 w-3" />View
            </Button>
            {stage === "pending_first" ? (
              // Pending first review: Approve records FIRST approval.
              <Button size="sm" variant="default" onClick={() => onApprove(item.documentId)}>
                <CheckCircle2 className="mr-1 h-3 w-3" />Approve
              </Button>
            ) : isCurrentUserFirstApprover ? (
              // Awaiting second approval + current user is the first approver:
              // they CANNOT second their own approval. Show Withdraw instead.
              <Button
                size="sm"
                variant="outline"
                onClick={() => onWithdraw(item.documentId)}
                disabled={withdrawing}
                title="Withdraw your first approval (the document goes back to the pending queue)"
              >
                {withdrawing
                  ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Withdrawing...</>
                  : <><Undo2 className="mr-1 h-3 w-3" />Withdraw</>}
              </Button>
            ) : (
              // Awaiting second approval + current user is a DIFFERENT Registrar:
              // they can finalize with a second approval.
              <Button size="sm" variant="default" onClick={() => onApprove(item.documentId)}>
                <CheckCircle2 className="mr-1 h-3 w-3" />Confirm Approval
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={() => onReject(item)}>
              <XCircle className="mr-1 h-3 w-3" />Reject
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
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
