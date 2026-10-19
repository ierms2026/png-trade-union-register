"use client";

import { getUnionStatusLabel, COMPLIANCE_STATUS_CONFIG, getComplianceStatusLabel, REVIEW_STATUS_CONFIG } from "@/lib/dashboard/vocabulary";
import { useState } from "react";
import {
  FileText, Building2, ChevronLeft, Download, Eye, Clock,
  CheckCircle2, XCircle, Calendar, User, HardDrive, Hash,
  AlertCircle, History, ShieldCheck, ScrollText, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { DocumentPreviewModal } from "@/components/app/document-preview-modal";
import type { ComplianceStatus } from "@/lib/dashboard/status-config";

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
  // Wave 2 / Item 1: compliance snapshot — computed server-side by the
  // /api/documents/[id] route using the same calculator as the matrix.
  compliance?: {
    status: ComplianceStatus;
    expiresAt: string | null;
    renewalYears: number | null;
  };
}

interface DocumentDetailResponse {
  document: DocumentDetail;
}

export function DocumentDetailView({
  documentId,
  user,
}: {
  documentId: string;
  user?: { role: string };
}) {
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

      {/* Wave 2 / Item 1: Compliance card — live status for THIS document.
          Sits above the version history so the user sees "is this doc
          compliant?" before drilling into version details. */}
      {doc.compliance && (
        <DocumentComplianceCard
          status={doc.compliance.status}
          expiresAt={doc.compliance.expiresAt}
          renewalYears={doc.compliance.renewalYears}
          reviewedAt={doc.reviewedAt}
          disposedAt={doc.disposedAt}
        />
      )}

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

      {/* Wave 2 / Item 2: Inline audit trail — last 5 entries for THIS
          document. REGISTRAR + INSPECTOR only (the audit API returns 403
          for Officers; we hide the section entirely rather than show an
          error card — Officers have no business seeing audit data per
          IA-2 + the existing Union Hub History tab pattern). */}
      {user && user.role !== "OFFICER" && (
        <InlineAuditTrail documentId={doc.id} />
      )}

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

// =============================================================================
// Wave 2 / Item 1: DocumentComplianceCard — live compliance status for the
// document being viewed. Reuses the same STATUS_VISUAL tokens + label
// function as the compliance matrix (single source of truth).
// =============================================================================

// Visual tokens for the compliance card. Same color pairs as the matrix cells
// (COMPLIANCE_STATUS_CONFIG.cell in vocabulary.ts). Duplicated here as a
// small lookup so we don't have to thread the type through vocabulary.ts's
// StatusConfig — but the LABELS still come from COMPLIANCE_STATUS_CONFIG
// (single source of truth for status names).
const CARD_STATUS_VISUAL: Record<ComplianceStatus, { bg: string; border: string; text: string }> = {
  COMPLIANT: { bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-900", text: "text-green-800 dark:text-green-300" },
  EXPIRING: { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-900", text: "text-amber-800 dark:text-amber-300" },
  OVERDUE: { bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-900", text: "text-red-800 dark:text-red-300" },
  AWAITING_REVIEW: { bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-900", text: "text-blue-800 dark:text-blue-300" },
  MISSING: { bg: "bg-muted", border: "border-border", text: "text-muted-foreground" },
  NOT_APPLICABLE: { bg: "bg-muted/50", border: "border-border", text: "text-muted-foreground" },
};

function DocumentComplianceCard({
  status,
  expiresAt,
  renewalYears,
  reviewedAt,
  disposedAt,
}: {
  status: ComplianceStatus;
  expiresAt: string | null;
  renewalYears: number | null;
  reviewedAt: string | null;
  disposedAt: string | null;
}) {
  const cfg = COMPLIANCE_STATUS_CONFIG[status];
  const Icon = cfg.icon;
  const visual = CARD_STATUS_VISUAL[status];
  const label = getComplianceStatusLabel(status);
  const definition = cfg.definition;

  // Days until expiry — only meaningful for COMPLIANT/EXPIRING/OVERDUE.
  // For other statuses we hide this row entirely.
  const daysUntilExpiry = expiresAt
    ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Card className={`${visual.border}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          Compliance Status
        </CardTitle>
        <CardDescription>
          Live status for this document, computed from the same rules as the compliance matrix.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status row — big colored badge + label */}
        <div className={`flex items-center gap-3 rounded-md border ${visual.border} ${visual.bg} p-3`}>
          <Icon className={`h-6 w-6 ${visual.text}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className={`text-base font-semibold ${visual.text}`}>{label}</p>
            <p className="text-xs text-muted-foreground">{definition}</p>
          </div>
        </div>

        {/* Details grid — expiry, approval date, renewal period */}
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          {expiresAt && daysUntilExpiry !== null && (
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Expires</p>
              <p className="font-medium">
                {new Date(expiresAt).toLocaleDateString()}
              </p>
              <p className={`text-xs ${daysUntilExpiry < 0 ? "text-red-600 dark:text-red-400" : daysUntilExpiry <= 90 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                {daysUntilExpiry < 0
                  ? `${Math.abs(daysUntilExpiry)} day${Math.abs(daysUntilExpiry) === 1 ? "" : "s"} overdue`
                  : daysUntilExpiry === 0
                    ? "Expires today"
                    : `${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"} remaining`}
              </p>
            </div>
          )}
          {reviewedAt && (
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Approved On</p>
              <p className="font-medium">{new Date(reviewedAt).toLocaleDateString()}</p>
              <p className="text-xs text-muted-foreground">Renewal clock start</p>
            </div>
          )}
          {renewalYears !== null && (
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Renewal Period</p>
              <p className="font-medium">{renewalYears} year{renewalYears === 1 ? "" : "s"}</p>
              <p className="text-xs text-muted-foreground">Per compliance rule</p>
            </div>
          )}
          {disposedAt && (
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Disposed On</p>
              <p className="font-medium">{new Date(disposedAt).toLocaleDateString()}</p>
              <p className="text-xs text-muted-foreground">No longer active</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Wave 2 / Item 2: InlineAuditTrail — last 5 audit entries for THIS document.
//
// Fetches /api/audit?entityType=Document&entityId=<docId>&limit=5. The audit
// API returns 403 for Officers, but the parent component guards this render
// with `user.role !== "OFFICER"` — so this component only mounts for
// REGISTRAR + INSPECTOR.
//
// Shows a "View full audit log →" link at the bottom that deep-links to the
// Audit view filtered to this document (the Audit view already supports
// entityType + entityId filters via URL params).
// =============================================================================

interface AuditEntry {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
  entityType: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
}

interface AuditResponse {
  entries: AuditEntry[];
  total: number;
  page: number;
  limit: number;
}

function InlineAuditTrail({ documentId }: { documentId: string }) {
  const { data, loading, error } = useFetch<AuditResponse>(
    `/api/audit?entityType=Document&entityId=${encodeURIComponent(documentId)}&limit=5`,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="h-4 w-4" />
          Audit Trail
        </CardTitle>
        <CardDescription>
          Last 5 audit entries for this document.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading audit entries…</p>
        ) : error ? (
          <p className="text-sm text-destructive">Error loading audit entries: {error}</p>
        ) : !data || data.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No audit entries for this document yet. Actions like review, retention approval, and download will appear here.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {data.entries.map((e) => (
                <li
                  key={e.id}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    e.severity === "CRITICAL"
                      ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                      : e.severity === "WARNING"
                        ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
                        : "border-border bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{formatAuditAction(e.action)}</span>
                    <time className="text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </time>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    by {e.actorName}
                    {e.severity !== "INFO" && (
                      <span className={`ml-2 inline-flex items-center gap-0.5 font-medium ${e.severity === "CRITICAL" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                        <AlertCircle className="h-3 w-3" />
                        {e.severity.toLowerCase()}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
            {data.total > data.entries.length && (
              <p className="mt-3 text-xs text-muted-foreground">
                Showing {data.entries.length} of {data.total} entries.{" "}
                <Link
                  href={`/?view=audit&entityType=Document&entityId=${encodeURIComponent(documentId)}`}
                  className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                >
                  View full audit log
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Convert snake_case audit action names to human-readable labels.
// e.g. "document_review_approve" → "Document review approved"
function formatAuditAction(action: string): string {
  // Common document actions — map to friendly past-tense labels.
  const ACTION_LABELS: Record<string, string> = {
    document_review_approve: "Document approved",
    document_review_reject: "Document rejected",
    document_retention_approve: "Retention approved",
    document_retention_reject: "Retention rejected",
    document_disposition_execute: "Disposition executed",
    document_disposition_cancel: "Disposition cancelled",
    document_legal_hold_place: "Legal hold placed",
    document_legal_hold_lift: "Legal hold lifted",
    document_upload: "Document uploaded",
    document_version_uploaded: "New version uploaded",
    document_view: "Document viewed",
    document_download: "Document downloaded",
    document_restore: "Version restored",
    document_visibility_update: "Visibility updated",
  };
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ContactRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b py-2 last:border-0 sm:grid-cols-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm sm:col-span-2">{value || <span className="text-muted-foreground italic">Not set</span>}</dd>
    </div>
  );
}
