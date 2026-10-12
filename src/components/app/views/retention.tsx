"use client";

import { useState, useRef } from "react";
import { Archive, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DefinitionPopover } from "@/components/app/definition-popover";

// =============================================================================
// Retention view — pending disposal list with Approve (REGISTRAR) + Snooze.
//
// APPROVE uses ConfirmDialog with requireText (type-to-confirm): the Registrar
// must type the document type EXACTLY to enable the Confirm button. This is
// the same pattern GitHub uses for repo deletion — prevents accidental
// disposal. The dialog is the shared ConfirmDialog (built on Radix
// AlertDialog), so it gets focus trapping, focus return, Escape-to-cancel,
// aria-hidden on the trigger, and block-close-while-loading for free.
//
// After a successful disposal, the row is removed from the list by refetch(),
// so returnFocusRef points at the view heading (with tabIndex=-1) — focus
// lands there instead of body.
// =============================================================================

interface RetentionItem {
  documentId: string;
  documentType: string;
  unionId: string;
  unionName: string;
  registrationNo: string;
  filedAt: string;
  retentionYrs: number;
  disposalDueDate: string;
  snoozedUntil: string | null;
  versionNumber: number;
  fileName: string;
}

interface User {
  role: "REGISTRAR" | "INSPECTOR" | "OFFICER";
}

export function RetentionView({ user }: { user: User }) {
  const { data, loading, error, refetch } = useFetch<{ pending: RetentionItem[] }>("/api/retention");
  const [approveTarget, setApproveTarget] = useState<RetentionItem | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  if (loading) return <CardListSkeleton count={4} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data) return null;

  const isRegistrar = user.role === "REGISTRAR";

  // Approve (dispose) — async + THROWS on failure so ConfirmDialog's error
  // path catches it and the dialog stays open with an inline error. On
  // success, ConfirmDialog closes itself and refetch() pulls the new list
  // (the disposed row disappears). Focus then returns to headingRef.
  async function approve(documentId: string) {
    const res = await fetch(`/api/retention/${documentId}/approve`, {
      method: "POST",
      credentials: "include",
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || "Failed to approve disposal.");
    }
    toast.success("Document disposed.", {
      description: "This action is irreversible. The audit log records the disposal with CRITICAL severity.",
    });
    refetch();
  }

  async function snooze(documentId: string) {
    try {
      const res = await fetch(`/api/retention/${documentId}/reject`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to snooze.");
        return;
      }
      toast.success("Disposal snoozed for 30 days.");
      refetch();
    } catch {
      toast.error("Network error.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight">
          Retention & Disposal
          <span className="ml-2 align-middle"><DefinitionPopover termKey="retention.queue" size="sm" align="start" /></span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Documents whose retention period has elapsed. Review and approve for disposal, or snooze.
        </p>
      </div>

      {data.pending.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="No documents pending disposal"
          description="All documents are within their retention period. Documents appear here when they reach their retention expiry."
          action={{label: "Refresh", onClick: refetch}}
        />
      ) : (
        <div className="space-y-3">
          {data.pending.map((item) => {
            const isOverdue = new Date(item.disposalDueDate).getTime() < Date.now();
            return (
              <Card key={item.documentId}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{item.documentType}</h3>
                        <Badge variant="outline" className="text-xs">v{item.versionNumber}</Badge>
                        {isOverdue ? (
                          <Badge variant="destructive" className="text-xs">Overdue</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Due</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.unionName} ({item.registrationNo})
                      </p>
                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>Filed: {new Date(item.filedAt).toLocaleDateString()}</span>
                        <span>Retention: {item.retentionYrs === 99 ? "Permanent" : `${item.retentionYrs} years`}</span>
                        <span>Due: {new Date(item.disposalDueDate).toLocaleDateString()}</span>
                        {item.snoozedUntil && (
                          <span className="text-amber-600">
                            Snoozed until: {new Date(item.snoozedUntil).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {isRegistrar && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setApproveTarget(item)}
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Approve Disposal
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => snooze(item.documentId)}
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        Snooze 30d
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Type-to-Confirm Disposal Dialog (shared ConfirmDialog, requireText mode) */}
      <ConfirmDialog
        open={approveTarget !== null}
        onOpenChange={(next) => { if (!next) setApproveTarget(null); }}
        title="Confirm Document Disposal"
        description="This action is irreversible. The document will be permanently marked as disposed and removed from all active views."
        confirmLabel="Confirm Disposal"
        destructive
        requireText={approveTarget?.documentType}
        onConfirm={async () => {
          if (!approveTarget) return;
          await approve(approveTarget.documentId);
        }}
        returnFocusRef={headingRef}
      >
        {approveTarget && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
            <p className="font-medium text-red-900">{approveTarget.documentType}</p>
            <p className="text-red-700">
              {approveTarget.unionName} ({approveTarget.registrationNo})
            </p>
            <p className="mt-1 text-xs text-red-600">
              Version {approveTarget.versionNumber} · Filed {new Date(approveTarget.filedAt).toLocaleDateString()}
            </p>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
