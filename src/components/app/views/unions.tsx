"use client";
import Link from "next/link";

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
  Download,
  Eye,
  Pencil,
  Search,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/app/status-badge";
import { Textarea } from "@/components/ui/textarea";
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
import { DocumentPreviewModal } from "@/components/app/document-preview-modal";

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
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  reviewedAt: string | null;
  rejectionReason: string | null;
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

export function UnionsView({ user, initialUnionId }: { user: { role: string; assignedUnionId: string | null }; initialUnionId?: string | null }) {
  const { data, loading, error, refetch } = useFetch<{ unions: Union[] }>("/api/unions");
  const [selectedUnionId, setSelectedUnionId] = useState<string | null>(initialUnionId ?? null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<string>("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedUnion = data?.unions.find((u) => u.id === selectedUnionId);

  // Client-side filter — same pattern as the public portal. Instant, no
  // network round-trip. Filters by union name or registration number.
  const filteredUnions = (() => {
    const all = data?.unions ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (u) =>
        u.unionName.toLowerCase().includes(q) ||
        u.registrationNo.toLowerCase().includes(q),
    );
  })();

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
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditDialogOpen(true)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
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
                      userRole={user.role}
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

        {editDialogOpen && (
          <EditUnionDialog
            union={selectedUnion}
            userRole={user.role}
            onClose={() => setEditDialogOpen(false)}
            onSaved={() => {
              setEditDialogOpen(false);
              refetch();
            }}
          />
        )}
      </div>
    );
  }

  // --- Union list view ---
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Registered Unions</h1>
          <p className="text-sm text-muted-foreground">
            {data.unions.length} registered union{data.unions.length !== 1 ? "s" : ""}.
          </p>
        </div>
        {user.role === "REGISTRAR" && (
          <Button onClick={() => setRegisterDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Register New Union
          </Button>
        )}
      </div>

      {/* Filter box — reactive, no submit button (same pattern as public portal) */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter by name or registration number..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredUnions.length === 0 && searchQuery.trim() ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm font-medium">No unions match your filter</p>
            <p className="mt-1 text-xs text-muted-foreground">Try a different search term.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            <div className="hidden grid-cols-[1fr_140px_100px_120px_24px] items-center gap-4 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>Union Name</span><span>Reg. No.</span><span className="text-center">Documents</span><span className="text-center">Status</span><span />
            </div>
            {filteredUnions.map((u) => (
              <Link key={u.id} href={`/unions/${u.registrationNo}`} className="grid w-full grid-cols-[1fr_140px_100px_120px_24px] items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/30 border-l-2 border-solid border-l-transparent hover:border-l-accent">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.unionName}</p>
                  <p className="truncate text-xs text-muted-foreground sm:hidden">{u.registrationNo} · {u.documents.length} doc{u.documents.length !== 1 ? "s" : ""}</p>
                </div>
                <span className="hidden truncate text-sm text-muted-foreground sm:inline">{u.registrationNo}</span>
                <span className="hidden text-center text-sm text-muted-foreground sm:inline">{u.documents.length}</span>
                <span className="hidden text-center sm:flex sm:justify-center"><StatusBadge status={u.status} /></span>
                <ChevronRight className="hidden h-4 w-4 justify-self-end text-muted-foreground sm:block" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {registerDialogOpen && (
        <RegisterUnionDialog
          onClose={() => setRegisterDialogOpen(false)}
          onSaved={() => {
            setRegisterDialogOpen(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Document tile
// -----------------------------------------------------------------------------

function DocumentTile({
  doc,
  unionId,
  userRole,
  onUploadVersion,
}: {
  doc: UnionDocument;
  unionId: string;
  userRole: string;
  onUploadVersion: () => void;
}) {
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<unknown[] | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{
    documentType: string;
    version: number;
    fileName: string;
    fileExtension: string | null;
    downloadUrl: string;
  } | null>(null);

  const canMutate = userRole !== "INSPECTOR";

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
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  v{doc.latestVersion.versionNumber} · {new Date(doc.latestVersion.uploadedAt).toLocaleDateString()}
                </p>
                {doc.reviewStatus === "PENDING" && (
                  <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 border-amber-200">Pending Review</Badge>
                )}
                {doc.reviewStatus === "APPROVED" && (
                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 border-green-200">Approved</Badge>
                )}
                {doc.reviewStatus === "REJECTED" && (
                  <Badge variant="secondary" className="text-xs bg-red-100 text-red-800 border-red-200 cursor-help" title={doc.rejectionReason ?? "Rejected by Registrar"}>
                    Rejected
                  </Badge>
                )}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No version uploaded</p>
            )}
            {doc.reviewStatus === "REJECTED" && doc.rejectionReason && (
              <p className="mt-1 text-xs text-red-600">Reason: {doc.rejectionReason}</p>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {canMutate && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onUploadVersion}>
            <Upload className="mr-1 h-3 w-3" />
            New version
          </Button>
        )}
        {doc.latestVersion && !doc.disposedAt && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() =>
                setPreviewDoc({
                  documentType: doc.documentType,
                  version: doc.latestVersion!.versionNumber,
                  fileName: doc.latestVersion!.fileName,
                  fileExtension: doc.latestVersion!.fileExtension,
                  downloadUrl: `/api/unions/${unionId}/documents/${doc.id}/download`,
                })
              }
            >
              <Eye className="mr-1 h-3 w-3" />
              View
            </Button>
            <a href={`/api/unions/${unionId}/documents/${doc.id}/download`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost" className="h-7 text-xs">
                <Download className="mr-1 h-3 w-3" />
                Download
              </Button>
            </a>
          </>
        )}
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
                  {!v.isCurrent && canMutate && (
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

      {previewDoc && (
        <DocumentPreviewModal
          open={!!previewDoc}
          onOpenChange={(open) => !open && setPreviewDoc(null)}
          documentType={previewDoc.documentType}
          version={previewDoc.version}
          fileName={previewDoc.fileName}
          fileExtension={previewDoc.fileExtension}
          downloadUrl={previewDoc.downloadUrl}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Edit Union Dialog — with Officer silent-pin awareness
// -----------------------------------------------------------------------------

function EditUnionDialog({
  union,
  userRole,
  onClose,
  onSaved,
}: {
  union: Union;
  userRole: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isRegistrar = userRole === "REGISTRAR";
  const isOfficer = userRole === "OFFICER";

  const [unionName, setUnionName] = useState(union.unionName);
  const [registrationNo, setRegistrationNo] = useState(union.registrationNo);
  const [fileNumber, setFileNumber] = useState(union.fileNumber || "");
  const [status, setStatus] = useState(union.status);
  const [address, setAddress] = useState(union.address || "");
  const [contactPerson, setContactPerson] = useState(union.contactPerson || "");
  const [contactEmail, setContactEmail] = useState(union.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(union.contactPhone || "");
  const [remarks, setRemarks] = useState(union.remarks || "");
  const [saving, setSaving] = useState(false);

  // Officer restricted fields (silently pinned server-side)
  const restrictedFields = isOfficer
    ? ["unionName", "registrationNo", "fileNumber", "status", "remarks"]
    : [];

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (isRegistrar) {
        body.unionName = unionName;
        body.registrationNo = registrationNo;
        body.fileNumber = fileNumber || null;
        body.status = status;
        body.remarks = remarks || null;
      }
      body.address = address || null;
      body.contactPerson = contactPerson || null;
      body.contactEmail = contactEmail || null;
      body.contactPhone = contactPhone || null;

      const res = await fetch(`/api/unions/${union.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update union.");
        return;
      }
      toast.success("Union updated successfully.");
      onSaved();
    } catch {
      toast.error("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Union</DialogTitle>
          <DialogDescription>
            {isOfficer
              ? "You can edit contact information only. Core identity fields are protected."
              : "Update union details. Changes are logged in the audit trail."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {/* Union Name — Registrar only */}
          <div className="space-y-2">
            <Label>Union Name</Label>
            <Input
              value={unionName}
              onChange={(e) => setUnionName(e.target.value)}
              disabled={isOfficer}
              className={isOfficer ? "bg-muted" : ""}
            />
            {isOfficer && (
              <p className="text-xs text-muted-foreground">Restricted — only Registrars can change this.</p>
            )}
          </div>

          {/* Registration No — Registrar only */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Registration No</Label>
              <Input
                value={registrationNo}
                onChange={(e) => setRegistrationNo(e.target.value)}
                disabled={isOfficer}
                className={isOfficer ? "bg-muted" : ""}
              />
            </div>
            <div className="space-y-2">
              <Label>File Number</Label>
              <Input
                value={fileNumber}
                onChange={(e) => setFileNumber(e.target.value)}
                disabled={isOfficer}
                className={isOfficer ? "bg-muted" : ""}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Status — Registrar only */}
          {isRegistrar && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="DEREGISTERED">Deregistered</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Contact fields — both roles can edit */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contact Person</Label>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <Input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Contact Email</Label>
            <Input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Optional"
              rows={2}
            />
          </div>

          {/* Remarks — Registrar only */}
          {isRegistrar && (
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Internal notes (Registrar only)"
                rows={2}
              />
            </div>
          )}

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
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


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

// =============================================================================
// RegisterUnionDialog — creates a new union via POST /api/unions.
// REGISTRAR only (enforced by the API + the button that opens this dialog
// is only rendered for REGISTRAR).
//
// Mirrors the EditUnionDialog pattern but POSTs instead of PUTs, with
// empty initial values + the registration number field is required.
// =============================================================================

function RegisterUnionDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [unionName, setUnionName] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [fileNumber, setFileNumber] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [address, setAddress] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();

    if (!unionName.trim() || !registrationNo.trim()) {
      toast.error("Union Name and Registration Number are required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/unions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          unionName: unionName.trim(),
          registrationNo: registrationNo.trim(),
          fileNumber: fileNumber.trim() || null,
          status,
          address: address.trim() || null,
          contactPerson: contactPerson.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactPhone: contactPhone.trim() || null,
          remarks: remarks.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to register union.");
        return;
      }

      toast.success(`Union "${unionName.trim()}" registered successfully.`);
      onSaved();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register New Union</DialogTitle>
          <DialogDescription>
            Register a new trade union. The union will appear on the public portal immediately after creation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {/* Union Name */}
          <div className="space-y-2">
            <Label>Union Name *</Label>
            <Input
              value={unionName}
              onChange={(e) => setUnionName(e.target.value)}
              placeholder="e.g. Papua New Guinea Maritime Workers Union"
              required
            />
          </div>

          {/* Registration No + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Registration No *</Label>
              <Input
                value={registrationNo}
                onChange={(e) => setRegistrationNo(e.target.value)}
                placeholder="e.g. IO-07"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="SUSPENDED">SUSPENDED</SelectItem>
                  <SelectItem value="DEREGISTERED">DEREGISTERED</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* File Number */}
          <div className="space-y-2">
            <Label>File Number</Label>
            <Input
              value={fileNumber}
              onChange={(e) => setFileNumber(e.target.value)}
              placeholder="e.g. FN-2026-001"
            />
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contact Person</Label>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="e.g. secretary@union.pg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <Input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="e.g. +675 123 4567"
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Port Moresby, PNG"
              />
            </div>
          </div>

          {/* Remarks */}
          <div className="space-y-2">
            <Label>Remarks</Label>
            <Input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Internal notes (optional)"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registering...
                </>
              ) : (
                "Register Union"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
