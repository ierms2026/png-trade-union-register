"use client";

import { useState, type FormEvent } from "react";
import {
  Building2,
  Search,
  FileText,
  Globe,
  ArrowLeft,
  Loader2,
  ExternalLink,
  Scale,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useFetch } from "@/components/app/use-fetch";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";

// =============================================================================
// PublicPortal — chrome-less public-facing view.
//
// Three tabs:
//   1. Union search: public search of the union registry (4-key whitelist).
//   2. Union detail: click a search result → shows only Certificate +
//      Constitution documents (the public whitelist).
//   3. Legislation library: static JSON of acts/regulations, with
//      client-side filtering.
//
// No auth required, no sidebar/topbar — just a clean public interface.
// =============================================================================

interface PublicUnion {
  id: string;
  unionName: string;
  registrationNo: string;
  status: string;
}

interface PublicUnionDetail {
  id: string;
  unionName: string;
  registrationNo: string;
  status: string;
  documents: Array<{
    id: string;
    documentType: string;
    latestVersion: {
      id: string;
      versionNumber: number;
      fileName: string;
      uploadedAt: string;
      fileExtension: string | null;
    } | null;
    fileUrl: string | null;
  }>;
}

interface LegislationEntry {
  id: string;
  title: string;
  shortTitle: string;
  year: number;
  jurisdiction: string;
  category: string;
  summary: string;
  url: string;
  lastUpdated: string;
}

interface Props {
  onBack: () => void;
}

export function PublicPortal({ onBack }: Props) {
  const [tab, setTab] = useState<"search" | "legislation">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PublicUnion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedUnionId, setSelectedUnionId] = useState<string | null>(null);

  const { data: legislation, loading: legLoading, error: legError } = useFetch<LegislationEntry[]>(
    "/api/legislation",
  );

  // Fetch the selected union's detail
  const { data: unionDetail, loading: unionLoading, error: unionError } = useFetch<{ union: PublicUnionDetail }>(
    selectedUnionId ? `/api/public/unions/${selectedUnionId}` : null,
  );

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setSearching(true);
    setSelectedUnionId(null);
    try {
      const url = searchQuery.trim()
        ? `/api/public/unions?q=${encodeURIComponent(searchQuery.trim())}`
        : `/api/public/unions`;
      const res = await fetch(url);
      if (!res.ok) {
        toast.error("Search failed. Please try again.");
        return;
      }
      const data = await res.json();
      setSearchResults(data.unions);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  // --- Search tab -------------------------------------------------------
  function renderSearch() {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search the Union Registry
            </CardTitle>
            <CardDescription>
              Verify a union's registration status. Search by name or registration number.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                placeholder="e.g. Maritime Workers or PNG-TU-0001"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={searching}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Search results OR union detail */}
        {selectedUnionId ? (
          // Union detail view
          <Card>
            <CardHeader>
              <Button
                variant="ghost"
                size="sm"
                className="mb-2 w-fit"
                onClick={() => setSelectedUnionId(null)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to results
              </Button>
              {unionLoading ? (
                <div className="space-y-2">
                  <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                </div>
              ) : unionError ? (
                <ErrorState description={unionError} />
              ) : unionDetail ? (
                <>
                  <CardTitle className="text-xl">{unionDetail.union.unionName}</CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <span>Reg. No: {unionDetail.union.registrationNo}</span>
                    <Badge
                      variant={unionDetail.union.status === "ACTIVE" ? "default" : "secondary"}
                    >
                      {unionDetail.union.status}
                    </Badge>
                  </CardDescription>
                </>
              ) : null}
            </CardHeader>
            <CardContent>
              {unionDetail && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Public Documents</h4>
                  {unionDetail.union.documents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No public documents available for this union.
                    </p>
                  ) : (
                    unionDetail.union.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{doc.documentType}</p>
                            {doc.latestVersion && (
                              <p className="text-xs text-muted-foreground">
                                v{doc.latestVersion.versionNumber} · uploaded{" "}
                                {new Date(doc.latestVersion.uploadedAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                        {doc.fileUrl && (
                          <Button asChild size="sm" variant="outline">
                            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="mr-1 h-3 w-3" />
                              View
                            </a>
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ) : searchResults ? (
          // Search results list
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found.
            </p>
            {searchResults.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No unions found"
                description="Try a different search term, or leave the search box empty to browse all registered unions."
              />
            ) : (
              searchResults.map((u) => (
                <Card
                  key={u.id}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => setSelectedUnionId(u.id)}
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">{u.unionName}</p>
                      <p className="text-sm text-muted-foreground">
                        Reg. No: {u.registrationNo}
                      </p>
                    </div>
                    <Badge
                      variant={u.status === "ACTIVE" ? "default" : "secondary"}
                    >
                      {u.status}
                    </Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : null}
      </div>
    );
  }

  // --- Legislation tab --------------------------------------------------
  function renderLegislation() {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Legislation Library
            </CardTitle>
            <CardDescription>
              Acts and regulations governing trade unions in Papua New Guinea.
            </CardDescription>
          </CardHeader>
        </Card>

        {legLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="space-y-2 p-4">
                  <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : legError ? (
          <ErrorState description={legError} />
        ) : legislation && legislation.length > 0 ? (
          <div className="space-y-3">
            {legislation.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <h3 className="font-medium">{entry.title}</h3>
                        <Badge variant="outline" className="text-xs">
                          {entry.category}
                        </Badge>
                      </div>
                      <p className="mb-2 text-sm text-muted-foreground">
                        {entry.summary}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.jurisdiction} · {entry.year} · Last updated{" "}
                        {new Date(entry.lastUpdated).toLocaleDateString()}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <a href={entry.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-1 h-3 w-3" />
                        View PDF
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Scale}
            title="No legislation available"
            description="The legislation library is empty. Please check back later."
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Public portal header */}
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary p-2">
              <Globe className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">Public Registry Portal</p>
              <p className="text-xs text-muted-foreground">Union Records Management System</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Staff Login
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl gap-1 px-4">
          <button
            onClick={() => setTab("search")}
            className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              tab === "search"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Union Search
          </button>
          <button
            onClick={() => setTab("legislation")}
            className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              tab === "legislation"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Legislation Library
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-4xl p-4 py-8">
        {tab === "search" ? renderSearch() : renderLegislation()}
      </main>

      <footer className="border-t bg-background py-4">
        <div className="mx-auto max-w-4xl px-4 text-center text-xs text-muted-foreground">
          Office of The Industrial Registrar · PNG Department of Labour &amp; Industrial Relations
        </div>
      </footer>
    </div>
  );
}
