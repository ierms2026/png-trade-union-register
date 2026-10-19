"use client";

import { useState, useMemo } from "react";
import {
  FileText, Building2, Search, Filter, ChevronRight, Loader2,
  CheckCircle2, Clock, XCircle, Download, Eye,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";
import { DocumentPreviewModal } from "@/components/app/document-preview-modal";

// =============================================================================
// DocumentsView — chunk 11
//
// Cross-union document list with filters. Replaces the union-drill-down flow
// for staff who need to find a document by type, review status, or filename
// without knowing which union it belongs to.
//
// Filters:
//   - Union (dropdown — all unions or a specific one)
//   - Document type (dropdown — all types or a specific one)
//   - Review status (dropdown — all / pending / approved / rejected)
//   - Search (filename search — NOT full-text; use /search for text content)
//
// Each row shows: document type, union name + reg no, review status, version,
// file name, file size, upload date, uploaded by. Click a row to view the
// document detail page. Click the preview button to view inline.
// =============================================================================

interface DocumentItem {
  id: string;
  documentType: string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  reviewedAt: string | null;
  rejectionReason: string | null;
  disposedAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  union: {
    id: string;
    unionName: string;
    registrationNo: string;
    status: string;
  };
  latestVersion: {
    id: string;
    versionNumber: number;
    fileName: string;
    fileSize: number;
    fileExtension: string | null;
    uploadedAt: string;
    uploadedByEmail: string;
  } | null;
}

interface DocumentsResponse {
  documents: DocumentItem[];
  count: number;
  filters: {
    unionId: string | null;
    documentType: string | null;
    reviewStatus: string | null;
    includeDisposed: boolean;
    q: string | null;
  };
}

interface UnionsResponse {
  unions: Array<{ id: string; unionName: string; registrationNo: string }>;
}

import { REVIEW_STATUS_CONFIG as REVIEW_STATUS } from "@/lib/dashboard/vocabulary";

import { PageHeader } from "@/components/app/page-header";
export function DocumentsView() {
  const [unionFilter, setUnionFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);

  // Fetch unions for the filter dropdown
  const { data: unionsData } = useFetch<UnionsResponse>("/api/unions");

  // Build the query string for the documents API
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (unionFilter !== "all") params.set("unionId", unionFilter);
    if (typeFilter !== "all") params.set("documentType", typeFilter);
    if (statusFilter !== "all") params.set("reviewStatus", statusFilter);
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    return params.toString();
  }, [unionFilter, typeFilter, statusFilter, searchQuery]);

  const { data, loading, error, refetch } = useFetch<DocumentsResponse>(
    `/api/documents${queryParams ? `?${queryParams}` : ""}`,
  );

  const documents = data?.documents ?? [];

  // Fetch compliance rules for the document-type filter dropdown (from the
  // rule list, NOT from the current results — so all valid types are shown
  // even when no documents match the current filters)
  const { data: complianceData } = useFetch<{ documentTypes: string[] }>("/api/compliance");
  const documentTypes = complianceData?.documentTypes ?? [];

  function handleClearFilters() {
    setUnionFilter("all");
    setTypeFilter("all");
    setStatusFilter("all");
    setSearchQuery("");
  }

  const hasFilters = unionFilter !== "all" || typeFilter !== "all" || statusFilter !== "all" || searchQuery.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <PageHeader title="Documents" description="All documents across all unions. Use filters to narrow down, or click a document to view its details + version history." />      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {/* Search */}
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Search (filename)</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by filename..."
                  className="pl-9"
                />
              </div>
            </div>

            {/* Union filter */}
            <div className="space-y-1">
              <label htmlFor="docs-union-filter" className="text-xs font-medium text-muted-foreground">Union</label>
              <Select value={unionFilter} onValueChange={setUnionFilter}>
                <SelectTrigger id="docs-union-filter" className="w-[200px]">
                  <SelectValue placeholder="All unions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All unions</SelectItem>
                  {unionsData?.unions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.unionName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Document type filter — from ComplianceRule, not from results */}
            <div className="space-y-1">
              <label htmlFor="docs-type-filter" className="text-xs font-medium text-muted-foreground">Document Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger id="docs-type-filter" className="w-[200px]">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {documentTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status filter */}
            <div className="space-y-1">
              <label htmlFor="docs-status-filter" className="text-xs font-medium text-muted-foreground">Review Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="docs-status-filter" className="w-[160px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <CardListSkeleton count={5} />
      ) : error ? (
        <ErrorState description={error} onRetry={refetch} />
      ) : documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={hasFilters ? "No documents match your filters" : "No documents found"}
          description={
            hasFilters
              ? "Try adjusting your filters or clearing them to see all documents."
              : "Documents will appear here once unions upload them."
          }
          action={hasFilters ? { label: "Clear filters", onClick: handleClearFilters } : undefined}
        />
      ) : (
        <>
          {/* Count */}
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{data?.count ?? 0}</span> document{(data?.count ?? 0) === 1 ? "" : "s"}
            {hasFilters && " (filtered)"}
          </p>

          {/* Document list */}
          <div className="space-y-2">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onPreview={() => setPreviewDoc(doc)}
              />
            ))}
          </div>
        </>
      )}

      {/* Preview modal */}
      {previewDoc && previewDoc.latestVersion && (
        <DocumentPreviewModal
          open={true}
          onOpenChange={(v) => { if (!v) setPreviewDoc(null); }}
          documentType={previewDoc.documentType}
          version={previewDoc.latestVersion.versionNumber}
          fileName={previewDoc.latestVersion.fileName}
          fileExtension={previewDoc.latestVersion.fileExtension}
          downloadUrl={`/api/unions/${previewDoc.union.id}/documents/${previewDoc.id}/versions/${previewDoc.latestVersion.id}/download`}
        />
      )}
    </div>
  );
}

function DocumentRow({
  doc,
  onPreview,
}: {
  doc: DocumentItem;
  onPreview: () => void;
}) {
  const cfg = REVIEW_STATUS[doc.reviewStatus];
  const StatusIcon = cfg.icon;

  return (
    <Card className="hover:border-foreground/20 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            {/* Top row: document type + status */}
            <div className="flex flex-wrap items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Link
                href={`/?view=document-detail&id=${doc.id}`}
                className="text-base font-semibold hover:underline"
              >
                {doc.documentType}
              </Link>
              {doc.latestVersion && (
                <Badge variant="outline" className="text-xs">
                  v{doc.latestVersion.versionNumber}
                </Badge>
              )}
              <Badge variant="outline" className={`text-xs ${cfg.tone}`}>
                <StatusIcon className="mr-1 h-3 w-3" />
                {cfg.label}
              </Badge>
            </div>

            {/* Union info */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3" />
              <span className="font-medium">{doc.union.unionName}</span>
              <span>· Reg. No. {doc.union.registrationNo}</span>
            </div>

            {/* File info */}
            {doc.latestVersion ? (
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="truncate">{doc.latestVersion.fileName}</span>
                <span>· {(doc.latestVersion.fileSize / 1024).toFixed(1)} KB</span>
                <span>· Uploaded {new Date(doc.latestVersion.uploadedAt).toLocaleDateString()}</span>
                <span>· by {doc.latestVersion.uploadedByEmail}</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No version uploaded</p>
            )}

            {/* Rejection reason */}
            {doc.reviewStatus === "REJECTED" && doc.rejectionReason && (
              <p className="mt-1 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                <strong>Rejected:</strong> {doc.rejectionReason}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1">
            {doc.latestVersion && (
              <Button
                size="icon"
                variant="ghost"
                className="h-11 w-11"
                onClick={onPreview}
                title="Preview document"
              >
                <Eye className="h-4 w-4" />
              </Button>
            )}
            <Link href={`/?view=document-detail&id=${doc.id}`}>
              <Button size="icon" variant="ghost" className="h-11 w-11" title="View details">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
