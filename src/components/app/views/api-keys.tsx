"use client";

import { useState, type FormEvent } from "react";
import { Key, Plus, Copy, Trash2, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
// API Keys view — key list with create (one-time display) + revoke.
// =============================================================================

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

const ALLOWED_SCOPES = [
  "unions:read",
  "unions:write",
  "documents:read",
  "documents:write",
  "compliance:read",
  "audit:read",
];

export function ApiKeysView() {
  const { data, loading, error, refetch } = useFetch<{ apiKeys: ApiKey[] }>("/api/api-keys");
  const [createOpen, setCreateOpen] = useState(false);

  if (loading) return <CardListSkeleton count={3} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="text-sm text-muted-foreground">
            Programmatic access tokens for scripts and integrations.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Key
        </Button>
      </div>

      {data.apiKeys.length === 0 ? (
        <EmptyState
          icon={Key}
          title="No API keys"
          description="Create an API key to enable programmatic access to the registry."
          action={{ label: "Create key", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {data.apiKeys.map((key) => (
                <ApiKeyRow key={key.id} apiKey={key} onUpdated={refetch} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {createOpen && (
        <CreateKeyDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            refetch();
            // Don't close immediately — the dialog shows the one-time key
          }}
        />
      )}
    </div>
  );
}

function ApiKeyRow({ apiKey, onUpdated }: { apiKey: ApiKey; onUpdated: () => void }) {
  const [revoking, setRevoking] = useState(false);
  const isExpired = new Date(apiKey.expiresAt).getTime() < Date.now();
  const isRevoked = apiKey.revokedAt !== null;

  async function handleRevoke() {
    if (!confirm("Revoke this API key? This cannot be undone. Scripts using this key will stop working immediately.")) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/api-keys/${apiKey.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ revoked: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to revoke key.");
        return;
      }
      toast.success("API key revoked.");
      onUpdated();
    } catch {
      toast.error("Network error.");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
          <Key className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{apiKey.name}</p>
            {isRevoked && <Badge variant="destructive" className="text-xs">Revoked</Badge>}
            {isExpired && !isRevoked && <Badge variant="secondary" className="text-xs">Expired</Badge>}
            {!isRevoked && !isExpired && <Badge variant="default" className="text-xs">Active</Badge>}
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{apiKey.prefix}...</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {apiKey.scopes.split(",").map((s) => (
              <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Expires: {new Date(apiKey.expiresAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleRevoke}
        disabled={revoking || isRevoked}
        className="text-destructive"
      >
        {revoking ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Trash2 className="mr-1 h-3 w-3" />}
        Revoke
      </Button>
    </div>
  );
}

function CreateKeyDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["unions:read"]);
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function toggleScope(scope: string) {
    if (scopes.includes(scope)) {
      setScopes(scopes.filter((s) => s !== scope));
    } else {
      setScopes([...scopes, scope]);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (scopes.length === 0) {
      toast.error("Select at least one scope.");
      return;
    }
    if (!expiresAt) {
      toast.error("Expiry date is required.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          scopes,
          expiresAt: new Date(expiresAt).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create key.");
        return;
      }
      toast.success("API key created.");
      setCreatedKey(data.key);
      onCreated();
    } catch {
      toast.error("Network error.");
    } finally {
      setCreating(false);
    }
  }

  function copyKey() {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey);
    setCopied(true);
    toast.success("Key copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setCreatedKey(null);
    setName("");
    setScopes(["unions:read"]);
    setExpiresAt("");
    setCopied(false);
    onClose();
  }

  // Default expiry: 90 days from now
  const defaultExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{createdKey ? "Key Created" : "Create API Key"}</DialogTitle>
          <DialogDescription>
            {createdKey
              ? "Copy this key now — you won't be able to see it again."
              : "Generate a programmatic access token for scripts and integrations."}
          </DialogDescription>
        </DialogHeader>

        {createdKey ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-amber-50 p-3 dark:bg-amber-950/20">
              <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                ⚠️ This is the ONLY time the full key will be shown. Copy it now.
              </p>
              <code className="block break-all rounded bg-background p-2 text-xs">{createdKey}</code>
            </div>
            <div className="flex gap-2">
              <Button onClick={copyKey} className="flex-1">
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? "Copied!" : "Copy key"}
              </Button>
              <Button variant="outline" onClick={handleClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Nightly backup script"
              />
            </div>
            <div className="space-y-2">
              <Label>Scopes</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALLOWED_SCOPES.map((scope) => (
                  <label
                    key={scope}
                    className={`flex cursor-pointer items-center gap-2 rounded border p-2 text-xs ${
                      scopes.includes(scope) ? "border-primary bg-primary/5" : "border-muted"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                      className="h-3 w-3"
                    />
                    <span className="font-mono">{scope}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiresAt">Expiry Date</Label>
              <Input
                id="expiresAt"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                max={new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                placeholder={defaultExpiry}
              />
              <p className="text-xs text-muted-foreground">Maximum 365 days from creation.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={creating}>Cancel</Button>
              <Button type="submit" disabled={creating}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
