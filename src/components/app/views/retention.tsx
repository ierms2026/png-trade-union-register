"use client";

import { useState } from "react";
import { Archive, CheckCircle2, Clock, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";

// =============================================================================
// Retention view — pending disposal list with Approve (REGISTRAR) + Snooze.
//
// APPROVE uses a type-to-confirm dialog: the Registrar must type the
// document type EXACTLY to enable the Confirm button. This is the same
// pattern GitHub uses for repo deletion — prevents accidental disposal.
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
  role: "REGISTRAR" | "INSPECTOR" | "OFFICER" | "REPRESENTATIVE";
}

export function RetentionView({ user }: { user: User }) {
  const { data, loading, error, refetch } = useFetch<{ pending: RetentionItem[] }>("/api/retention");
  const [approveTarget, setApproveTarget] = useState<RetentionItem | null>(null);

  if (loading) return <CardListSkeleton count={4} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data) return null;

  const isRegistrar = user.role === "REGISTRAR";

  async function approve(documentId: string) {
    try {
      const res = await fetch(`/api/retention/${documentId}/approve`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to approve disposal.");
        return;
      }
      toast.success("Document disposed.", {
        description: "This action is irreversible. The audit log records the disposal with CRITICAL severity.",
      });
      refetch();
    } catch {
      toast.error("Network error.");
    }
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
        <h1 className="text-2xl font-bold tracking-tight">Retention Queue</h1>
        <p className="text-sm text-muted-foreground">
          Documents whose retention period has elapsed. Review and approve for disposal, or snooze.
        </p>
      </div>

      {data.pending.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="No documents pending disposal"
          description="All documents are within their retention period. Check back later."
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

      {/* Type-to-Confirm Disposal Dialog */}
      {approveTarget && (
        <TypeToConfirmDialog
          item={approveTarget}
          onConfirm={() => {
            approve(approveTarget.documentId);
            setApproveTarget(null);
          }}
          onClose={() => setApproveTarget(null)}
        />
      )}
    </div>
  );
}

// --- Type-to-Confirm Dialog ------------------------------------------------

function TypeToConfirmDialog({
  item,
  onConfirm,
  onClose,
}: {
  item: RetentionItem;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typedText, setTypedText] = useState("");
  const [approving, setApproving] = useState(false);

  // The Confirm button is disabled until the typed text matches the document type EXACTLY.
  // This is the same pattern GitHub uses for repo deletion.
  const canConfirm = typedText.trim() === item.documentType.trim();

  async function handleConfirm() {
    if (!canConfirm) return;
    setApproving(true);
    onConfirm();
    setApproving(false);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Confirm Document Disposal
          </DialogTitle>
          <DialogDescription>
            This action is <strong>irreversible</strong>. The document will be permanently
            marked as disposed and removed from all active views.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Document summary */}
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
            <p className="font-medium text-red-900">{item.documentType}</p>
            <p className="text-red-700">
              {item.unionName} ({item.registrationNo})
            </p>
            <p className="mt-1 text-xs text-red-600">
              Version {item.versionNumber} · Filed {new Date(item.filedAt).toLocaleDateString()}
            </p>
          </div>

          {/* Type-to-confirm instruction */}
          <div className="space-y-2">
            <Label>
              Type <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono">{item.documentType}</code> to confirm
            </Label>
            <Input
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={item.documentType}
              autoFocus
              className={canConfirm ? "border-green-400" : ""}
            />
            {!canConfirm && typedText.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Text doesn&apos;t match yet. Type the exact document type to enable confirmation.
              </p>
            )}
            {canConfirm && (
              <p className="text-xs text-green-600">
                ✓ Matches — you can now confirm disposal.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={approving}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canConfirm || approving}
          >
            {approving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Disposing...
              </>
            ) : (
              <>
                <Archive className="mr-2 h-4 w-4" />
                Confirm Disposal
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
