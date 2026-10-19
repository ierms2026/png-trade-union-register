"use client";

import { useState } from "react";
import { Scale, Plus, Pencil, Trash2, X, FileText, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFetch } from "@/components/app/use-fetch";
import { TableSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";
import { toast } from "sonner";

interface LegislationEntry {
  id: string; title: string; shortTitle: string; year: number;
  jurisdiction: string; category: string; summary: string; url: string; lastUpdated: string;
}

const CATEGORIES = ["Act", "Regulation", "Amendment", "Ordinance", "Code", "Order"];
const JURISDICTIONS = ["Papua New Guinea", "Commonwealth", "Provincial", "International"];

const emptyForm: Omit<LegislationEntry, "id" | "lastUpdated"> = {
  title: "", shortTitle: "", year: new Date().getFullYear(),
  jurisdiction: "Papua New Guinea", category: "Act", summary: "", url: "",
};

export function LegislationView() {
  const { data: legislation, loading, error, refetch } = useFetch<LegislationEntry[]>("/api/legislation");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<LegislationEntry | null>(null);

  function handleAdd() { setEditingId(null); setFormData(emptyForm); setShowForm(true); }

  function handleEdit(entry: LegislationEntry) {
    setEditingId(entry.id);
    setFormData({ title: entry.title, shortTitle: entry.shortTitle, year: entry.year, jurisdiction: entry.jurisdiction, category: entry.category, summary: entry.summary, url: entry.url });
    setShowForm(true);
  }

  async function handleSave() {
    if (!formData.title.trim() || !formData.summary.trim()) { toast.error("Title and Summary are required."); return; }
    setSaving(true);
    try {
      const method = editingId ? "PUT" : "POST";
      const body = editingId ? { id: editingId, ...formData } : formData;
      const res = await fetch("/api/legislation", { method, headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to save."); }
      toast.success(editingId ? "Resource updated." : "Resource added.");
      setShowForm(false); refetch();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to save."); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/legislation?id=${deleteId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to delete."); }
      toast.success("Entry deleted.");
      setDeleteId(null); setDeleteEntry(null); refetch();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to delete."); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Resources</h1>
          <p className="text-sm text-muted-foreground">Manage acts, regulations, articles, and amendments.</p>
        </div>
        <Button onClick={handleAdd} className="gap-2"><Plus className="h-4 w-4" />Add Resource</Button>
      </div>

      {loading ? <TableSkeleton />
      : error ? <ErrorState description={error} onRetry={refetch} />
      : legislation && legislation.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {legislation.map((entry) => (
            <Card key={entry.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <Scale className="h-5 w-5 flex-shrink-0 text-primary mt-0.5" />
                    <div>
                      <CardTitle className="text-base leading-tight">{entry.title}</CardTitle>
                      <CardDescription className="mt-1">{entry.shortTitle} · {entry.year}</CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => handleEdit(entry)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-11 w-11 text-destructive hover:text-destructive" onClick={() => { setDeleteId(entry.id); setDeleteEntry(entry); }} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">{entry.category}</Badge>
                  <Badge variant="outline" className="text-xs">{entry.jurisdiction}</Badge>
                  <Badge variant="outline" className="text-xs">Updated {entry.lastUpdated}</Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{entry.summary}</p>
                {entry.url && <a href={entry.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><FileText className="h-3 w-3" />View PDF</a>}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card><CardContent className="py-12"><EmptyState icon={Scale} title="No resources" description="Click 'Add Resource' to add the first entry." /></CardContent></Card>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Resource" : "Add Resource"}</DialogTitle>
            <DialogDescription>{editingId ? "Update this entry." : "Add a new act or regulation."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2"><Label htmlFor="title">Title *</Label><Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="e.g. Industrial Relations Act 1962" /></div>
            <div className="grid gap-2"><Label htmlFor="shortTitle">Short Title</Label><Input id="shortTitle" value={formData.shortTitle} onChange={(e) => setFormData({ ...formData, shortTitle: e.target.value })} placeholder="e.g. Industrial Relations Act" /></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="grid gap-2"><Label htmlFor="year">Year *</Label><Input id="year" type="number" value={formData.year} onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })} /></div>
              <div className="grid gap-2"><Label>Jurisdiction</Label><Select value={formData.jurisdiction} onValueChange={(v) => setFormData({ ...formData, jurisdiction: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{JURISDICTIONS.map((j) => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2"><Label>Category</Label><Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid gap-2"><Label htmlFor="summary">Summary *</Label><textarea id="summary" className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={formData.summary} onChange={(e) => setFormData({ ...formData, summary: e.target.value })} placeholder="Brief description..." rows={3} /></div>
            <div className="grid gap-2"><Label htmlFor="url">PDF URL</Label><Input id="url" value={formData.url} onChange={(e) => setFormData({ ...formData, url: e.target.value })} placeholder="/legislation/example.pdf" /><p className="text-xs text-muted-foreground">Path to the PDF in public/legislation/.</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}><X className="mr-2 h-4 w-4" />Cancel</Button>
            <Button onClick={handleSave} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : editingId ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) { setDeleteId(null); setDeleteEntry(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete entry?</AlertDialogTitle><AlertDialogDescription>This will permanently delete <span className="font-medium">{deleteEntry?.title}</span>.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{saving ? "Deleting..." : "Delete"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
