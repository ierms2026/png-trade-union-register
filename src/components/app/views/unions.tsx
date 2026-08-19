"use client";

import { useState, type FormEvent } from "react";
import {
  Building2,
  Upload,
  FileText,
  ChevronRight,
  Loader2,
  ArrowLeft,
  History,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton, TableSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";

// =============================================================================
// Unions view — registry list + detail with document tiles + upload dialog.
//
// LIST: shows all unions (Officers see only their assigned union).
// DETAIL: click a union → shows its documents with latest version info,
//         + an "Upload" button to add a new version.
// =============================================================================

interface DocumentVersion {
  id: string;
  versionNumber: number;
  fileName: string;
  uploadedAt: string;
  fileSize: number;
  fileExtension: string | null;
}

interface UnionDocument {
  id: string;
  documentType: string;
  currentVersionId: string | null;
  disposedAt: string | null;
  snoozedUntil: string | null;
  latestVersion: DocumentVersion | null;
}

interface Union {
  id: string;
  unionName: string;
  registrationNo: string;
  fileNumber: string | null;
  status: string;
  address: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  documents: UnionDocument[];
}

export function UnionsView() {
  const { data, loading, error, refetch } = useFetch<{ unions: Union[] }>("/api/unions");
  const [selectedUnionId, setSelectedUnionId] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<string>("");

  const selectedUnion = data?.unions.find((u) => u.id === selectedUnionId);

  if (loading) return <CardListSkeleton count={6} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data || data.unions.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No unions registered"
        description="Once unions are registered, they will appear here."
      />
    );
  }

  // --- Union detail view ---
  if (selectedUnion) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => setSelectedUnionId(null)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to unions
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-xl">{selectedUnion.unionName}</CardTitle>
                <CardDescription className="mt-1 flex items-center gap-2">
                  <span>Reg. No: {selectedUnion.registrationNo}</span>
                  <Badge variant={selectedUnion.status === "ACTIVE" ? "default" : "secondary"}>
                    {selectedUnion.status}
                  </Badge>
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setUploadDialogOpen(true);
                }}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Document
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Contact info */}
            <div className="grid gap-4 text-sm md:grid-cols-2">
              {selectedUnion.fileNumber && (
                <div>
                  <p className="text-xs text-muted-foreground">File Number</p>
                  <p className="font-medium">{selectedUnion.fileNumber}</p>
                </div>
              )}
              {selectedUnion.contactPerson && (
                <div>
                  <p className="text-xs text-muted-foreground">Contact Person</p>
                  <p className="font-medium">{selectedUnion.contactPerson}</p>
                </div>
              )}
              {selectedUnion.contactEmail && (
                <div>
                  <p className="text-xs text-muted-foreground">Contact Email</p>
                  <p className="font-medium">{selectedUnion.contactEmail}</p>
                </div>
              )}
              {selectedUnion.contactPhone && (
                <div>
                  <p className="text-xs text-muted-foreground">Contact Phone</p>
                  <p className="font-medium">{selectedUnion.contactPhone}</p>
                </div>
              )}
              {selectedUnion.address && (
                <div className="md:col-span-2">
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="font-medium">{selectedUnion.address}</p>
                </div>
              )}
              {selectedUnion.remarks && (
                <div className="md:col-span-2">
                  <p className="text-xs text-muted-foreground">Remarks</p>
                  <p className="font-medium">{selectedUnion.remarks}</p>
                </div>
              )}
            </div>

            {/* Documents */}
            <div>
              <h4 className="mb-3 text-sm font-medium">Documents ({selectedUnion.documents.length})</h4>
              {selectedUnion.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents filed yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {selectedUnion.documents.map((doc) => (
                    <DocumentTile
                      key={doc.id}
                      doc={doc}
                      unionId={selectedUnion.id}
                      onUploadVersion={() => {
                        setUploadDocType(doc.documentType);
                        setUploadDialogOpen(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {uploadDialogOpen && (
          <UploadDialog
            unionId={selectedUnion.id}
            defaultDocType={uploadDocType}
            open={uploadDialogOpen}
            onClose={() => {
              setUploadDialogOpen(false);
              setUploadDocType("");
            }}
            onUploaded={() => {
              refetch();
              setUploadDialogOpen(false);
              setUploadDocType("");
            }}
          />
        )}
      </div>
    );
  }

  // --- Union list view ---
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Union Registry</h1>
        <p className="text-sm text-muted-foreground">
          {data.unions.length} registered union{data.unions.length !== 1 ? "s" : ""}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.unions.map((u) => (
          <Card
            key={u.id}
            className="cursor-pointer transition-colors hover:bg-muted/30"
            onClick={() => setSelectedUnionId(u.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium">{u.unionName}</p>
                  <p className="text-sm text-muted-foreground">Reg. No: {u.registrationNo}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {u.documents.length} document{u.documents.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={u.status === "ACTIVE" ? "default" : "secondary"}>
                    {u.status}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Document tile
// -----------------------------------------------------------------------------

function DocumentTile({
  doc,
  unionId,
  onUploadVersion,
}: {
  doc: UnionDocument;
  unionId: string;
  onUploadVersion: () => void;
}) {
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<unknown[] | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);

  async function loadVersions() {
    setVersionsLoading(true);
    try {
      const res = await fetch(`/api/unions/${unionId}/documents/${doc.id}/versions`, {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setVersions(data.versions);
      } else {
        toast.error("Failed to load versions.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setVersionsLoading(false);
    }
  }

  async function restoreVersion(versionId: string) {
    try {
      const res = await fetch(`/api/unions/${unionId}/documents/${doc.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ versionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Restore failed.");
        return;
      }
      toast.success(`Restored from version ${data.restoredFromVersion}. New version: ${data.newVersion.versionNumber}.`);
      setVersionsOpen(false);
      // Reload the union list to reflect the new version
      window.location.reload();
    } catch {
      toast.error("Network error.");
    }
  }

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{doc.documentType}</p>
            {doc.disposedAt ? (
              <Badge variant="destructive" className="mt-1 text-xs">Disposed</Badge>
            ) : doc.latestVersion ? (
              <p className="mt-1 text-xs text-muted-foreground">
                v{doc.latestVersion.versionNumber} · {new Date(doc.latestVersion.uploadedAt).toLocaleDateString()}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No version uploaded</p>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-1">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onUploadVersion}>
          <Upload className="mr-1 h-3 w-3" />
          New version
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => {
            if (!versionsOpen && !versions) loadVersions();
            setVersionsOpen(!versionsOpen);
          }}
        >
          <History className="mr-1 h-3 w-3" />
          History
        </Button>
      </div>

      {versionsOpen && (
        <div className="mt-3 border-t pt-2">
          {versionsLoading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : versions && versions.length > 0 ? (
            <div className="space-y-1">
              {(versions as Array<{
                id: string;
                versionNumber: number;
                fileName: string;
                uploadedAt: string;
                isCurrent: boolean;
              }>).map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between rounded bg-muted/30 p-2 text-xs"
                >
                  <div>
                    <span className="font-medium">v{v.versionNumber}</span>
                    {v.isCurrent && <Badge className="ml-1 text-[10px]">Current</Badge>}
                    <p className="text-muted-foreground">{new Date(v.uploadedAt).toLocaleString()}</p>
                  </div>
                  {!v.isCurrent && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs"
                      onClick={() => restoreVersion(v.id)}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Restore
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No versions.</p>
          )}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Upload dialog
// -----------------------------------------------------------------------------

interface UploadDialogProps {
  unionId: string;
  defaultDocType: string;
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

function UploadDialog({ unionId, defaultDocType, open, onClose, onUploaded }: UploadDialogProps) {
  const [documentType, setDocumentType] = useState(defaultDocType);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Sync the doc type when the default changes (e.g., user clicks "New version" on a specific doc)
  useState(() => {
    if (defaultDocType) setDocumentType(defaultDocType);
  });

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Please select a file.");
      return;
    }
    if (!documentType.trim()) {
      toast.error("Document type is required.");
      return;
    }
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", documentType.trim());
      formData.append("title", title.trim());
      const res = await fetch(`/api/unions/${unionId}/documents`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Upload failed.");
        return;
      }
      toast.success(`Uploaded ${documentType} v${data.version.versionNumber}.`);
      onUploaded();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Upload a new version of a document. Duplicate detection is based on SHA-256 checksum.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="docType">Document Type</Label>
            <Input
              id="docType"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              placeholder="e.g. Constitution, Financial Return"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A descriptive title for this version"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="file">File</Label>
            <Input
              id="file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              accept=".pdf,.doc,.docx,.jpg,.png"
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={uploading}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploading || !file}>
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
