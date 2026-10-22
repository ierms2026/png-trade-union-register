"use client";

import { useState, type FormEvent } from "react";
import { Settings2, Save, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { TableSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";

import { PageHeader } from "@/components/app/page-header";
// =============================================================================
// Configure Rules view — list + edit compliance rules with "Preview Impact".
//
// Each rule shows: documentType, required toggle, renewalYears, retentionYrs.
// Clicking "Edit" opens a dialog with editable fields + a "Preview Impact"
// button that calls /api/compliance/rules/preview to show which unions
// would change status if the edit is saved.
// =============================================================================

interface ComplianceRule {
  id: string;
  documentType: string;
  required: boolean;
  renewalYears: number;
  retentionYrs: number;
  updatedAt: string;
}

interface PreviewDiffEntry {
  unionId: string;
  unionName: string;
  documentType: string;
  currentStatus: string;
  newStatus: string;
}

interface PreviewResponse {
  ruleId: string;
  documentType: string;
  changes: { required?: boolean; renewalYears?: number; retentionYrs?: number };
  diff: PreviewDiffEntry[];
  summary: { totalChanged: number; escalated: number; improved: number };
}

export function ConfigureRulesView() {
  const { data, loading, error, refetch } = useFetch<{ rules: ComplianceRule[] }>("/api/compliance/rules");
  const [editingRule, setEditingRule] = useState<ComplianceRule | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  function openEdit(rule: ComplianceRule) {
    setEditingRule(rule);
    setEditDialogOpen(true);
  }

  function closeEdit() {
    setEditDialogOpen(false);
    setEditingRule(null);
  }

  if (loading) return <TableSkeleton rows={6} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data || data.rules.length === 0) {
    return (
      <EmptyState
        icon={Settings2}
        title="No compliance rules"
        description="Compliance rules define which document types are required and their renewal cycles."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <PageHeader title="Configure Rules" description="Edit document-type compliance rules. Changes take effect immediately across all unions." />      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-lg">Compliance Rules ({data.rules.length})</CardTitle>
          <CardDescription>Each rule applies to every union's filing of that document type.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/30 border-l-2 border-solid border-l-transparent hover:border-l-accent"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{rule.documentType}</p>
                    <Badge variant={rule.required ? "default" : "secondary"}>
                      {rule.required ? "Required" : "Optional"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Renewal: {rule.renewalYears === 99 ? "Permanent" : `${rule.renewalYears} year(s)`} ·{" "}
                    Retention: {rule.retentionYrs === 99 ? "Permanent" : `${rule.retentionYrs} year(s)`}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => openEdit(rule)}>
                  <Settings2 className="mr-1 h-3 w-3" />
                  Edit
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {editingRule && (
        <EditRuleDialog
          rule={editingRule}
          open={editDialogOpen}
          onClose={closeEdit}
          onSaved={() => {
            refetch();
            closeEdit();
          }}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Edit Rule Dialog with Preview Impact
// -----------------------------------------------------------------------------

interface EditRuleDialogProps {
  rule: ComplianceRule;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function EditRuleDialog({ rule, open, onClose, onSaved }: EditRuleDialogProps) {
  const [required, setRequired] = useState(rule.required);
  const [renewalYears, setRenewalYears] = useState(String(rule.renewalYears));
  const [retentionYrs, setRetentionYrs] = useState(String(rule.retentionYrs));
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);

  function buildChanges() {
    const changes: { required?: boolean; renewalYears?: number; retentionYrs?: number } = {};
    if (required !== rule.required) changes.required = required;
    const ry = parseInt(renewalYears, 10);
    if (!isNaN(ry) && ry !== rule.renewalYears) changes.renewalYears = ry;
    const rt = parseInt(retentionYrs, 10);
    if (!isNaN(rt) && rt !== rule.retentionYrs) changes.retentionYrs = rt;
    return changes;
  }

  async function handlePreview() {
    const changes = buildChanges();
    if (Object.keys(changes).length === 0) {
      toast.info("No changes to preview.");
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await fetch("/api/compliance/rules/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ruleId: rule.id, changes }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Preview failed.");
        return;
      }
      setPreview(data);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const changes = buildChanges();
    if (Object.keys(changes).length === 0) {
      toast.info("No changes to save.");
      onClose();
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/compliance/rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(changes),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save rule.");
        return;
      }
      toast.success(`Rule "${rule.documentType}" updated.`);
      onSaved();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Rule: {rule.documentType}</DialogTitle>
          <DialogDescription>
            Changes apply to every union's filing of this document type.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="required-switch">Required</Label>
              <p className="text-xs text-muted-foreground">
                If disabled, this document type is N/A for all unions.
              </p>
            </div>
            <Switch
              id="required-switch"
              checked={required}
              onCheckedChange={setRequired}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="renewalYears">Renewal (years)</Label>
              <Input
                id="renewalYears"
                type="number"
                min={0}
                value={renewalYears}
                onChange={(e) => setRenewalYears(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Use 99 for permanent (no renewal).</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="retentionYrs">Retention (years)</Label>
              <Input
                id="retentionYrs"
                type="number"
                min={0}
                value={retentionYrs}
                onChange={(e) => setRetentionYrs(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Use 99 for permanent retention.</p>
            </div>
          </div>

          {/* Preview Impact section */}
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Preview Impact</p>
                <p className="text-xs text-muted-foreground">
                  See which unions would change status before saving.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePreview}
                disabled={previewing}
              >
                {previewing ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Eye className="mr-1 h-3 w-3" />
                )}
                Preview
              </Button>
            </div>

            {preview && (
              <div className="mt-3 space-y-2 border-t pt-3">
                <div className="flex gap-4 text-xs">
                  <span><strong>{preview.summary.totalChanged}</strong> unions change</span>
                  <span className="text-destructive">+{preview.summary.escalated} escalate</span>
                  <span className="text-chart-3">+{preview.summary.improved} improve</span>
                </div>
                {preview.diff.length > 0 && (
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {preview.diff.map((d, i) => (
                      <div key={i} className="flex items-center justify-between rounded bg-background p-2 text-xs">
                        <span className="font-medium">{d.unionName}</span>
                        <span className="flex items-center gap-2">
                          <Badge variant="outline">{d.currentStatus}</Badge>
                          <span>→</span>
                          <Badge variant={d.newStatus === "COMPLIANT" ? "default" : "destructive"}>{d.newStatus}</Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
