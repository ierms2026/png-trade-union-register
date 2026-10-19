"use client";

import { getUnionStatusLabel } from "@/lib/dashboard/vocabulary";
import { useState } from "react";
import {
  FileText, Building2, ChevronLeft, Download, Eye, Clock,
  CheckCircle2, XCircle, Calendar, User, HardDrive, Hash,
  AlertCircle, History,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { DocumentPreviewModal } from "@/components/app/document-preview-modal";

// =============================================================================
// DocumentDetailView — chunk 11
//
// Full document detail page: metadata, version history, union info, review
// status. Accessed via /?view=document-detail&id=<documentId>.
//
// Shows:
//   - Document header (type, review status, rejection reason)
//   - Union info card (name, reg no, status, contact)
//   - Version history (all versions with file size, checksum, uploader, date)
//   - Preview button (opens the DocumentPreviewModal for the latest version)
//   - Download button (per version)
//
// AUTH: handled by the API (/api/documents/[id]). Officers/Reps can only
// view their own union's documents.
// =============================================================================

interface DocumentVersion {
  id: string;
  versionNumber: number;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileExtension: string | null;
  checksum: string;
  uploadedAt: string;
  uploadedByEmail: string;
  effectiveDate: string | null;
}

interface DocumentDetail {
  id: string;
  documentType: string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  reviewedAt: string | null;
  rejectionReason: string | null;
  disposedAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersionId: string | null;
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
  versions: DocumentVersion[];
}

interface DocumentDetailResponse {
  document: DocumentDetail;
}

import { REVIEW_STATUS_CONFIG } from "@/lib/dashboard/vocabulary";

export function DocumentDetailView({ documentId }: { documentId: string }) {
  const { data, loading, error, refetch } = useFetch<DocumentDetailResponse>(
    `/api/documents/${documentId}`,
  );
  const [previewVersion, setPreviewVersion] = useState<DocumentVersion | null>(null);

  if (loading) return <CardListSkeleton count={3} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data?.document) {
    return (
      <ErrorState
        description="Document not found."
        onRetry={refetch}
      />
    );
  }

  const doc = data.document;
  const cfg = REVIEW_STATUS_CONFIG[doc.reviewStatus];
  const StatusIcon = cfg.icon;
  const latestVersion = doc.versions[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link href="/?view=documents">
          <Button variant="ghost" size="sm">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Documents
          </Button>
        </Link>
      </div>

      {/* Document header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <h1 className="text-2xl font-bold tracking-tight">{doc.documentType}</h1>
                <Badge variant="outline" className={cfg.tone}>
                  <StatusIcon className="mr-1 h-3 w-3" />
                  {cfg.label}
                </Badge>
                {doc.disposedAt && (
                  <Badge variant="outline" className="bg-muted text-muted-foreground">
                    Disposed
                  </Badge>
                )}
              </div>

              {/* Union info */}
              <div className="flex items-center gap-1.5 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <Link
                  href={`/?view=unions&union=${doc.union.id}`}
                  className="font-medium hover:underline"
                >
                  {doc.union.unionName}
                </Link>
                <span className="text-muted-foreground">· Reg. No. {doc.union.registrationNo}</span>
                <Badge variant="outline" className="ml-1 text-xs">{getUnionStatusLabel(doc.union.status as "ACTIVE" | "SUSPENDED" | "DEREGISTERED")}</Badge>
              </div>

              {/* Rejection reason */}
              {doc.reviewStatus === "REJECTED" && doc.rejectionReason && (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
                  <p className="text-sm font-medium text-red-900 dark:text-red-100">Rejection Reason</p>
                  <p className="mt-1 text-sm text-red-800 dark:text-red-200">{doc.rejectionReason}</p>
                </div>
              )}

              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-3 pt-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Created</p>
                  <p>{new Date(doc.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Last Updated</p>
                  <p>{new Date(doc.updatedAt).toLocaleDateString()}</p>
                </div>
                {doc.reviewedAt && (
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Reviewed</p>
                    <p>{new Date(doc.reviewedAt).toLocaleDateString()}</p>
                  </div>
                )}
                {latestVersion && (
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Current Version</p>
                    <p>v{latestVersion.versionNumber}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex shrink-0 flex-col gap-2">
              {latestVersion && (
                <>
                  <Button
                    onClick={() => setPreviewVersion(latestVersion)}
                    className="gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    Preview
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    asChild
                  >
                    <a
                      href={`/api/unions/${doc.union.id}/documents/${doc.id}/versions/${latestVersion.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Union contact info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Union Contact Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <ContactRow label="Address" value={doc.union.address} />
            <ContactRow label="Contact Person" value={doc.union.contactPerson} />
            <ContactRow label="Contact Email" value={doc.union.contactEmail} />
            <ContactRow label="Contact Phone" value={doc.union.contactPhone} />
          </div>
        </CardContent>
      </Card>

      {/* Version history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Version History
          </CardTitle>
          <CardDescription>
            {doc.versions.length} version{doc.versions.length === 1 ? "" : "s"} on file
          </CardDescription>
        </CardHeader>
        <CardContent>
          {doc.versions.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No versions uploaded.</p>
          ) : (
            <div className="space-y-3">
              {doc.versions.map((v) => {
                const isCurrent = v.id === doc.currentVersionId;
                return (
                  <div
                    key={v.id}
                    className={`rounded-md border p-3 ${
                      isCurrent ? "border-primary/30 bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">Version {v.versionNumber}</span>
                          {isCurrent && (
                            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                              Current
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {v.fileName}
                          </span>
                          <span className="flex items-center gap-1">
                            <HardDrive className="h-3 w-3" />
                            {(v.fileSize / 1024).toFixed(1)} KB
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(v.uploadedAt).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {v.uploadedByEmail}
                          </span>
                          {v.effectiveDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Effective: {new Date(v.effectiveDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Hash className="h-3 w-3" />
                          <span className="font-mono">{v.checksum.substring(0, 16)}...</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-11 w-11"
                          onClick={() => setPreviewVersion(v)}
                          title="Preview this version"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-11 w-11"
                          asChild
                          title="Download this version"
                        >
                          <a
                            href={`/api/unions/${doc.union.id}/documents/${doc.id}/versions/${v.id}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview modal */}
      {previewVersion && (
        <DocumentPreviewModal
          open={true}
          onOpenChange={(v) => { if (!v) setPreviewVersion(null); }}
          documentType={doc.documentType}
          version={previewVersion.versionNumber}
          fileName={previewVersion.fileName}
          fileExtension={previewVersion.fileExtension}
          downloadUrl={`/api/unions/${doc.union.id}/documents/${doc.id}/versions/${previewVersion.id}/download`}
        />
      )}
    </div>
  );
}

function ContactRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b py-2 last:border-0 sm:grid-cols-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm sm:col-span-2">{value || <span className="text-muted-foreground italic">Not set</span>}</dd>
    </div>
  );
}
