"use client";

import { useState, type FormEvent } from "react";
import {
  Webhook, Plus, Trash2, Loader2, CheckCircle2, XCircle, Clock,
  Copy, ExternalLink, Activity,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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

import { PageHeader } from "@/components/app/page-header";
// =============================================================================
// WebhooksView — chunk 9 staff view (REGISTRAR-only)
//
// Manages webhook endpoints for external integrations. The Registrar can:
//   - List all registered webhook endpoints
//   - Register a new endpoint (URL + name + event subscriptions)
//   - Delete an endpoint (cascades to delivery history)
//   - Toggle endpoint active/inactive
//   - View the delivery log for an endpoint (recent deliveries + status)
//
// The signing secret is shown ONCE at creation time (same UX as API keys).
// =============================================================================

interface WebhookEndpoint {
  id: string;
  url: string;
  name: string;
  events: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { deliveries: number };
}

interface Delivery {
  id: string;
  eventId: string;
  eventType: string;
  status: "PENDING" | "DELIVERED" | "FAILED";
  attempts: number;
  maxAttempts: number;
  lastResponseCode: number | null;
  lastError: string | null;
  nextRetryAt: string | null;
  firstAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

const EVENT_TYPES = [
  { value: "COMPLIANCE_STATUS_CHANGE", label: "Compliance Status Change" },
  { value: "DOCUMENT_UPLOADED", label: "Document Uploaded" },
  { value: "DOCUMENT_REVIEWED", label: "Document Reviewed" },
  { value: "CONTACT_UPDATE_SUBMITTED", label: "Contact Update Submitted" },
  { value: "CONTACT_UPDATE_REVIEWED", label: "Contact Update Reviewed" },
] as const;

const DELIVERY_STATUS_CONFIG: Record<
  Delivery["status"],
  { label: string; icon: typeof Clock; tone: string }
> = {
  PENDING: {
    label: "Pending",
    icon: Clock,
    tone: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
  },
  DELIVERED: {
    label: "Delivered",
    icon: CheckCircle2,
    tone: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900",
  },
  FAILED: {
    label: "Failed",
    icon: XCircle,
    tone: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900",
  },
};

export function WebhooksView() {
  const { data, loading, error, refetch } = useFetch<{ endpoints: WebhookEndpoint[] }>("/api/webhooks");
  const [createOpen, setCreateOpen] = useState(false);
  const [deliveriesFor, setDeliveriesFor] = useState<WebhookEndpoint | null>(null);

  if (loading) return <CardListSkeleton count={3} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;

  const endpoints = data?.endpoints ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <PageHeader title="Webhooks" description="Register external endpoints to receive event notifications (e.g., compliance status changes)" />        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Register Endpoint
        </Button>
      </div>

      {endpoints.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="No webhook endpoints registered"
          description="Register an external URL to receive event notifications when compliance statuses change, documents are uploaded, or contact updates are submitted."
          action={{
            label: "Register Endpoint",
            onClick: () => setCreateOpen(true),
          }}
        />
      ) : (
        <div className="space-y-3">
          {endpoints.map((ep) => (
            <EndpointCard
              key={ep.id}
              endpoint={ep}
              onDeleted={refetch}
              onViewDeliveries={() => setDeliveriesFor(ep)}
            />
          ))}
        </div>
      )}

      <CreateEndpointDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          refetch();
          setCreateOpen(false);
        }}
      />

      {deliveriesFor && (
        <DeliveriesDialog
          endpoint={deliveriesFor}
          onClose={() => setDeliveriesFor(null)}
        />
      )}
    </div>
  );
}

function EndpointCard({
  endpoint,
  onDeleted,
  onViewDeliveries,
}: {
  endpoint: WebhookEndpoint;
  onDeleted: () => void;
  onViewDeliveries: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const eventList = endpoint.events
    ? endpoint.events.split(",").filter(Boolean)
    : [];

  async function handleDelete() {
    if (!confirm(`Delete webhook endpoint "${endpoint.name}"? This will also delete all delivery history.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/webhooks/${endpoint.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("Failed to delete endpoint.");
        return;
      }
      toast.success("Endpoint deleted.");
      onDeleted();
    } catch {
      toast.error("Network error.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Webhook className="h-4 w-4 shrink-0 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{endpoint.name}</h3>
              {endpoint.active ? (
                <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300">
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  Inactive
                </Badge>
              )}
              {endpoint._count.deliveries > 0 && (
                <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  {endpoint._count.deliveries} pending
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">{endpoint.url}</p>
            <div className="flex flex-wrap gap-1 pt-1">
              {eventList.length === 0 ? (
                <Badge variant="outline" className="text-xs">All events</Badge>
              ) : (
                eventList.map((e) => {
                  const label = EVENT_TYPES.find((et) => et.value === e)?.label ?? e;
                  return (
                    <Badge key={e} variant="outline" className="text-xs">
                      {label}
                    </Badge>
                  );
                })
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Registered {new Date(endpoint.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <Button size="sm" variant="outline" onClick={onViewDeliveries}>
              <Activity className="mr-1 h-3 w-3" />
              Deliveries
            </Button>
            <Button size="sm" variant="outline" onClick={handleDelete} disabled={deleting} className="text-destructive">
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateEndpointDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  function reset() {
    setName("");
    setUrl("");
    setSelectedEvents([]);
    setCreatedSecret(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) {
      toast.error("Please fill in name and URL.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          events: selectedEvents,
        }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create endpoint.");
        return;
      }
      setCreatedSecret(data.secret);
      toast.success("Endpoint registered. Save the secret — it won't be shown again.");
    } catch {
      toast.error("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    onOpenChange(false);
    if (createdSecret) {
      // If we created one, refetch the list
      onCreated();
      reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register Webhook Endpoint</DialogTitle>
          <DialogDescription>
            The external system will receive HTTP POST notifications at the URL you provide.
            The signing secret is generated server-side + shown once — save it securely.
          </DialogDescription>
        </DialogHeader>

        {createdSecret ? (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Save this signing secret — it won&apos;t be shown again.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Signing Secret</Label>
              <div className="flex gap-2">
                <Input readOnly value={createdSecret} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(createdSecret);
                    toast.success("Copied to clipboard.");
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wh-name">Name</Label>
              <Input
                id="wh-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., DLIR Data Warehouse"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-url">URL</Label>
              <Input
                id="wh-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://external-system.example.com/webhooks/urm"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Events (leave empty for all)</Label>
              <div className="space-y-2">
                {EVENT_TYPES.map((et) => (
                  <label
                    key={et.value}
                    className="flex items-center gap-2 rounded-md border p-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEvents.includes(et.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedEvents([...selectedEvents, et.value]);
                        } else {
                          setSelectedEvents(selectedEvents.filter((v) => v !== et.value));
                        }
                      }}
                    />
                    {et.label}
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !name.trim() || !url.trim()}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Register
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeliveriesDialog({
  endpoint,
  onClose,
}: {
  endpoint: WebhookEndpoint;
  onClose: () => void;
}) {
  const { data, loading, error } = useFetch<{ deliveries: Delivery[] }>(
    `/api/webhooks/${endpoint.id}/deliveries?limit=20`
  );

  const deliveries = data?.deliveries ?? [];

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delivery Log — {endpoint.name}</DialogTitle>
          <DialogDescription>
            Recent webhook deliveries to {endpoint.url}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Failed to load deliveries: {error}</p>
        ) : deliveries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No deliveries yet. Deliveries will appear here when events are dispatched.
          </p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {deliveries.map((d) => {
              const cfg = DELIVERY_STATUS_CONFIG[d.status];
              const StatusIcon = cfg.icon;
              return (
                <div key={d.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cfg.tone}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {cfg.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{d.eventType}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(d.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    <p>Event ID: <span className="font-mono">{d.eventId}</span></p>
                    <p>Attempts: {d.attempts}/{d.maxAttempts}
                      {d.lastResponseCode && ` · HTTP ${d.lastResponseCode}`}
                    </p>
                    {d.lastError && (
                      <p className="text-red-600 dark:text-red-400">Error: {d.lastError}</p>
                    )}
                    {d.nextRetryAt && (
                      <p>Next retry: {new Date(d.nextRetryAt).toLocaleString()}</p>
                    )}
                    {d.deliveredAt && (
                      <p className="text-green-600 dark:text-green-400">
                        Delivered: {new Date(d.deliveredAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
