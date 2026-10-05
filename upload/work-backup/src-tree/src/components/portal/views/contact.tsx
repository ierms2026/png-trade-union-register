"use client";

import { useState, type FormEvent, useEffect } from "react";
import {
  Contact as AddressBook, Clock, CheckCircle2, XCircle, Loader2, Edit3, X,
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
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { CONTACT_UPDATE_STATUS_CONFIG } from "@/lib/dashboard/vocabulary";

// =============================================================================
// PortalContactView — chunk 5
//
// Rep-facing contact-info view. Shows:
//   1. Current contact info (read-only display)
//   2. "Update Contact Info" button → opens edit dialog
//   3. Pending/recent contact-update requests with status
//
// Submissions go to /api/portal/contact/requests (POST) → creates a
// ContactUpdateRequest in PENDING state. Registrar approves/rejects from
// the staff Reviews view.
// =============================================================================

interface PortalUser {
  id: string;
  email: string;
  role: "REPRESENTATIVE";
  assignedUnionId: string | null;
  twoFactorEnabled: boolean;
}

interface CurrentContact {
  unionName: string;
  registrationNo: string;
  status: string;
  address: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

interface ContactUpdateRequest {
  id: string;
  address: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

interface ContactData {
  current: CurrentContact;
  pendingRequests: ContactUpdateRequest[];
}

export function PortalContactView({ user: _user }: { user: PortalUser }) {
  const { data, loading, error, refetch } = useFetch<ContactData>("/api/portal/contact");
  const [editOpen, setEditOpen] = useState(false);

  // If there's a PENDING request, disable the "Update" button (one at a time).
  const hasPending = data?.pendingRequests.some((r) => r.status === "PENDING") ?? false;

  if (loading) return <CardListSkeleton count={3} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contact Information</h1>
        <p className="text-sm text-muted-foreground">
          Update your union&apos;s contact details. Changes are reviewed by the Registrar before taking effect.
        </p>
      </div>

      {/* Current info card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AddressBook className="h-5 w-5" />
              Current Contact Information
            </CardTitle>
            <CardDescription>
              {data.current.unionName} · Reg. No. {data.current.registrationNo}
            </CardDescription>
          </div>
          <Button
            onClick={() => setEditOpen(true)}
            disabled={hasPending}
            title={hasPending ? "You have a pending request — wait for it to be reviewed" : "Submit a contact-info update"}
          >
            <Edit3 className="mr-2 h-4 w-4" />
            Update
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Address" value={data.current.address} />
          <InfoRow label="Contact Person" value={data.current.contactPerson} />
          <InfoRow label="Contact Email" value={data.current.contactEmail} />
          <InfoRow label="Contact Phone" value={data.current.contactPhone} />
        </CardContent>
      </Card>

      {/* Pending request banner */}
      {hasPending && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex items-start gap-3 p-4">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                You have a contact-info update awaiting Registrar review.
              </p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                Once the Registrar acts on it, you&apos;ll receive a notification. You can submit another update after the current one is resolved.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Request history */}
      {data.pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Update History</CardTitle>
            <CardDescription>Your recent contact-info update requests</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {data.pendingRequests.map((req) => (
                <RequestRow key={req.id} request={req} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      <EditContactDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        current={data.current}
        onSubmitted={() => {
          refetch();
          setEditOpen(false);
        }}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b py-2 last:border-0 sm:grid-cols-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm sm:col-span-2">{value || <span className="text-muted-foreground italic">Not set</span>}</dd>
    </div>
  );
}

function RequestRow({ request }: { request: ContactUpdateRequest }) {
  const cfg = {
    PENDING: {
      label: CONTACT_UPDATE_STATUS_CONFIG.PENDING.label,
      icon: Clock,
      tone: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
    },
    APPROVED: {
      label: CONTACT_UPDATE_STATUS_CONFIG.APPROVED.label,
      icon: CheckCircle2,
      tone: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900",
    },
    REJECTED: {
      label: CONTACT_UPDATE_STATUS_CONFIG.REJECTED.label,
      icon: XCircle,
      tone: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900",
    },
  }[request.status];
  const StatusIcon = cfg.icon;

  // Show only fields that were requested in this update
  const changedFields: Array<{ label: string; value: string | null }> = [];
  if (request.address !== null) changedFields.push({ label: "Address", value: request.address });
  if (request.contactPerson !== null) changedFields.push({ label: "Contact Person", value: request.contactPerson });
  if (request.contactEmail !== null) changedFields.push({ label: "Contact Email", value: request.contactEmail });
  if (request.contactPhone !== null) changedFields.push({ label: "Contact Phone", value: request.contactPhone });

  return (
    <li className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cfg.tone}>
            <StatusIcon className="mr-1 h-3 w-3" />
            {cfg.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Submitted {new Date(request.createdAt).toLocaleDateString()}
            {request.reviewedAt && ` · Reviewed ${new Date(request.reviewedAt).toLocaleDateString()}`}
          </span>
        </div>
      </div>
      <div className="space-y-1">
        {changedFields.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No changes</p>
        ) : (
          changedFields.map((f, i) => (
            <div key={i} className="text-xs">
              <span className="font-medium uppercase tracking-wide text-muted-foreground">{f.label}:</span>{" "}
              <span>{f.value || <span className="italic text-muted-foreground">(clear)</span>}</span>
            </div>
          ))
        )}
      </div>
      {request.status === "REJECTED" && request.rejectionReason && (
        <p className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <strong>Reason:</strong> {request.rejectionReason}
        </p>
      )}
    </li>
  );
}

function EditContactDialog({
  open,
  onOpenChange,
  current,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: CurrentContact;
  onSubmitted: () => void;
}) {
  const [address, setAddress] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset form to current values when dialog opens
  useEffect(() => {
    if (open) {
      setAddress("");
      setContactPerson("");
      setContactEmail("");
      setContactPhone("");
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body: Record<string, string> = {};
      // Only include fields the rep actually typed — empty means "no change".
      if (address.trim()) body.address = address.trim();
      if (contactPerson.trim()) body.contactPerson = contactPerson.trim();
      if (contactEmail.trim()) body.contactEmail = contactEmail.trim();
      if (contactPhone.trim()) body.contactPhone = contactPhone.trim();

      if (Object.keys(body).length === 0) {
        toast.error("Please enter at least one change.");
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/portal/contact/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to submit update request.");
        setSubmitting(false);
        return;
      }
      toast.success("Contact-info update submitted for review. The Registrar will be notified.");
      onSubmitted();
    } catch (err) {
      console.error(err);
      toast.error("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSubmitting(false); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Update Contact Information</DialogTitle>
          <DialogDescription>
            Enter only the fields you want to change. Leave others blank. The
            Registrar will review your request before changes take effect.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={current.address || "Enter new address"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-person">Contact Person</Label>
            <Input
              id="contact-person"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder={current.contactPerson || "Enter contact person name"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-email">Contact Email</Label>
            <Input
              id="contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder={current.contactEmail || "Enter contact email"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-phone">Contact Phone</Label>
            <Input
              id="contact-phone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder={current.contactPhone || "Enter contact phone"}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit for Review"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
