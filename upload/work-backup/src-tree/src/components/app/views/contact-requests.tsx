"use client";

import { useState, useEffect } from "react";
import {
  Contact as AddressBook, CheckCircle2, XCircle, Loader2, Clock, History,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";

// =============================================================================
// ContactRequestsView — chunk 5 staff-side view (REGISTRAR-only)
//
// Lists contact-update requests submitted by union representatives. The
// Registrar can approve or reject each one. Reject requires a reason.
//
// Mirrors the Reviews view structure. Same dual-list pattern: PENDING by
// default, with a status filter to view APPROVED/REJECTED history.
// =============================================================================

interface ContactRequest {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  address: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  union: {
    id: string;
    unionName: string;
    registrationNo: string;
    status: string;
    address: string | null;
    contactPerson: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  requestedBy: { id: string; email: string };
  reviewedBy: { id: string; email: string } | null;
}

const STATUS_FILTERS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
] as const;

export function ContactRequestsView() {
  // --- URL-aware status filter -------------------------------------------
  // The filter (?status=) is synced to the URL so that:
  //   - Refresh keeps the filter (read on mount via lazy initializer)
  //   - Back/Forward preserves the filter (popstate re-reads the URL)
  //   - Sharing a URL reproduces the exact filtered view
  //
  // The default is "PENDING" (the most useful filter for Registrars). If
  // the URL has ?status=APPROVED, the view initializes to "APPROVED".
  //
  // We use a lazy initializer (useState(() => ...)) to read the URL on the
  // FIRST render only. This avoids the "setState in effect" anti-pattern
  // + avoids a flash of the default filter before the URL is read.
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (typeof window === "undefined") return "PENDING";
    const urlParams = new URLSearchParams(window.location.search);
    const urlStatus = urlParams.get("status");
    if (urlStatus && STATUS_FILTERS.some((f) => f.value === urlStatus)) {
      return urlStatus;
    }
    return "PENDING";
  });

  // Listen for Back/Forward + pushState — re-read the filter from the URL.
  useEffect(() => {
    function handleUrlChange() {
      const urlParams = new URLSearchParams(window.location.search);
      // Only react if we're still on the contact-requests view.
      const view = urlParams.get("view");
      if (view !== "contact-requests") return;
      const urlStatus = urlParams.get("status");
      if (urlStatus && STATUS_FILTERS.some((f) => f.value === urlStatus)) {
        setStatusFilter(urlStatus);
      } else {
        // No ?status= in the URL → default to PENDING.
        setStatusFilter("PENDING");
      }
    }
    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("urlchange", handleUrlChange);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("urlchange", handleUrlChange);
    };
  }, []);

  // When the user changes the filter via the dropdown, push the new value
  // to the URL. This makes the filter shareable + Back/Forward work.
  function handleStatusChange(newStatus: string) {
    setStatusFilter(newStatus);
    const url = new URL(window.location.origin + "/");
    url.searchParams.set("view", "contact-requests");
    if (newStatus !== "PENDING") {
      // Only add ?status= if it's not the default (keeps URLs clean).
      url.searchParams.set("status", newStatus);
    }
    window.history.pushState({}, "", url.toString());
  }

  const { data, loading, error, refetch } = useFetch<{ requests: ContactRequest[] }>(
    `/api/contact-requests?status=${statusFilter}`,
  );
  const [rejectTarget, setRejectTarget] = useState<ContactRequest | null>(null);

  async function handleApprove(req: ContactRequest) {
    if (!confirm(`Approve this contact-info update for ${req.union.unionName}?`)) return;
    try {
      const res = await fetch(`/api/contact-requests/${req.id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to approve.");
        return;
      }
      toast.success(`Approved. ${data.appliedFields?.length ?? 0} field(s) updated on ${req.union.unionName}.`);
      refetch();
    } catch (err) {
      console.error(err);
      toast.error("Network error.");
    }
  }

  if (loading) return <CardListSkeleton count={4} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;

  const requests = data?.requests ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contact Updates</h1>
          <p className="text-sm text-muted-foreground">
            Review contact-info changes submitted by union representatives
          </p>
        </div>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon={AddressBook}
          title="No requests"
          description={
            statusFilter === "PENDING"
              ? "No pending contact-update requests. New submissions from union representatives will appear here."
              : `No ${statusFilter.toLowerCase()} requests.`
          }
        />
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              onApprove={() => handleApprove(req)}
              onReject={() => setRejectTarget(req)}
            />
          ))}
        </div>
      )}

      {/* Reject dialog */}
      {rejectTarget && (
        <RejectDialog
          request={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onRejected={() => {
            setRejectTarget(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function RequestCard({
  request,
  onApprove,
  onReject,
}: {
  request: ContactRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  const statusCfg = {
    PENDING: { label: "Pending", icon: Clock, tone: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900" },
    APPROVED: { label: "Approved", icon: CheckCircle2, tone: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900" },
    REJECTED: { label: "Rejected", icon: XCircle, tone: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900" },
  }[request.status];
  const StatusIcon = statusCfg.icon;

  // Show only fields that were requested (non-null)
  const changes: Array<{ label: string; newValue: string | null; oldValue: string | null }> = [];
  if (request.address !== null) {
    changes.push({ label: "Address", newValue: request.address, oldValue: request.union.address });
  }
  if (request.contactPerson !== null) {
    changes.push({ label: "Contact Person", newValue: request.contactPerson, oldValue: request.union.contactPerson });
  }
  if (request.contactEmail !== null) {
    changes.push({ label: "Contact Email", newValue: request.contactEmail, oldValue: request.union.contactEmail });
  }
  if (request.contactPhone !== null) {
    changes.push({ label: "Contact Phone", newValue: request.contactPhone, oldValue: request.union.contactPhone });
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            {/* Header: union + status + dates */}
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{request.union.unionName}</h3>
              <Badge variant="outline">Reg. {request.union.registrationNo}</Badge>
              <Badge variant="outline" className={statusCfg.tone}>
                <StatusIcon className="mr-1 h-3 w-3" />
                {statusCfg.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Submitted by {request.requestedBy.email} on{" "}
              {new Date(request.createdAt).toLocaleString()}
              {request.reviewedAt && request.reviewedBy && (
                <> · {statusCfg.label} by {request.reviewedBy.email} on {new Date(request.reviewedAt).toLocaleString()}</>
              )}
            </p>

            {/* Changes table */}
            <div className="mt-2 overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Field</th>
                    <th className="px-3 py-1.5 text-left font-medium">Current Value</th>
                    <th className="px-3 py-1.5 text-left font-medium">Requested New Value</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{c.label}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {c.oldValue || <span className="italic">(empty)</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        {c.newValue || <span className="italic text-muted-foreground">(clear)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Rejection reason (if any) */}
            {request.status === "REJECTED" && request.rejectionReason && (
              <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                <strong>Rejection reason:</strong> {request.rejectionReason}
              </p>
            )}
          </div>

          {/* Actions (only for PENDING) */}
          {request.status === "PENDING" && (
            <div className="flex shrink-0 flex-col gap-2">
              <Button size="sm" onClick={onApprove} className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={onReject} className="gap-1.5">
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RejectDialog({
  request,
  onClose,
  onRejected,
}: {
  request: ContactRequest;
  onClose: () => void;
  onRejected: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (reason.trim().length < 10) {
      toast.error("Please provide a reason of at least 10 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/contact-requests/${request.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to reject.");
        setSubmitting(false);
        return;
      }
      toast.success("Request rejected. The representative has been notified.");
      onRejected();
    } catch (err) {
      console.error(err);
      toast.error("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Contact Update Request</DialogTitle>
          <DialogDescription>
            Rejecting this request from {request.union.unionName}. The representative will be
            notified with your reason.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">Reason (min 10 characters) *</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., The new email address doesn't match the union's official records. Please verify and resubmit."
            rows={4}
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground">{reason.length}/1000 characters</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting || reason.trim().length < 10}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Rejecting...
              </>
            ) : (
              <>
                <XCircle className="mr-2 h-4 w-4" />
                Reject Request
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
