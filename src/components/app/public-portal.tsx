"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Building2, Search, FileText, ExternalLink, Scale, LogIn, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/app/status-badge";
import { RegistrarContactInfo } from "@/components/app/registrar-contact-info";
import { StatusGlossary, type GlossaryEntry } from "@/components/app/status-glossary";
import { UNION_STATUS_CONFIG, COMPLIANCE_STATUS_CONFIG } from "@/lib/dashboard/vocabulary";
import { useFetch } from "@/components/app/use-fetch";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";

interface PublicUnion { id: string; unionName: string; registrationNo: string; status: string; updatedAt: string; }
interface LegislationEntry { id: string; title: string; shortTitle: string; year: number; jurisdiction: string; category: string; summary: string; url: string; lastUpdated: string; }
interface Props { onStaffLogin: () => void; }

// =============================================================================
// Public tab values — the canonical URL values for each public-portal tab.
// These match the tab labels shown to the user (Register / Resources / Help).
// The URL param is ?tab=<value>. Refresh, Back/Forward, + sharing all work.
// =============================================================================
type PublicTab = "register" | "resources" | "help";

/** Read the ?tab= param from the URL. Falls back to "register" (the default). */
function readTabFromUrl(): PublicTab {
  if (typeof window === "undefined") return "register";
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab === "register" || tab === "resources" || tab === "help") return tab;
  // Legacy values: "search" → register, "legislation" → resources.
  // Kept for backward compat so old bookmarks don't break.
  if (tab === "search") return "register";
  if (tab === "legislation") return "resources";
  return "register";
}

export function PublicPortal({ onStaffLogin }: Props) {
  // --- URL-aware tab state ------------------------------------------------
  // The tab is driven by ?tab= in the URL. Lazy initializer reads on first
  // render (avoids setState-in-effect + avoids a flash of the wrong tab).
  // Tab clicks push to the URL; popstate/urlchange re-reads.
  const [tab, setTab] = useState<PublicTab>(readTabFromUrl);
  const [searchQuery, setSearchQuery] = useState("");
  const { data: allUnions, loading: unionsLoading, error: unionsError } = useFetch<{ unions: PublicUnion[] }>("/api/public/unions");
  const { data: legislation, loading: legLoading, error: legError } = useFetch<LegislationEntry[]>("/api/legislation");

  // --- Listen for Back/Forward + pushState --------------------------------
  // When the URL changes (browser Back/Forward, or page.tsx pushing a new
  // URL), re-read the ?tab= param + update state. This keeps the tab in
  // sync with the URL — the URL is the source of truth.
  useEffect(() => {
    function handleUrlChange() {
      setTab(readTabFromUrl());
    }
    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("urlchange", handleUrlChange);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("urlchange", handleUrlChange);
    };
  }, []);

  // --- Push tab changes to the URL ----------------------------------------
  // Called when the user clicks a tab button. Pushes ?tab=X so refresh +
  // Back/Forward + sharing work.
  function handleTabChange(newTab: PublicTab) {
    setTab(newTab);
    const url = new URL(window.location.origin + "/");
    url.searchParams.set("tab", newTab);
    window.history.pushState({}, "", url.toString());
  }

  const filteredUnions: PublicUnion[] = (() => {
    const all = allUnions?.unions ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter((u) => u.unionName.toLowerCase().includes(q) || u.registrationNo.toLowerCase().includes(q));
  })();

  function renderHero() {
    // Calculate the real "last updated" date from the most recent union
    // updatedAt timestamp — not today's date.
    const all = allUnions?.unions ?? [];
    const lastUpdated = all.length > 0
      ? new Date(Math.max(...all.map((u) => new Date(u.updatedAt).getTime()))).toLocaleDateString("en-PG", { year: "numeric", month: "long", day: "numeric" })
      : null;
    return (
      <div className="space-y-4 text-center">
        <div className="flex items-center justify-center gap-3">
          <Image src="/coat-of-arms.png" alt="National Emblem of Papua New Guinea" width={48} height={39} className="h-12 w-auto" />
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-accent bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent-foreground shadow-sm">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z" /><path d="M9 12l2 2 4-4" /></svg>
            Published by the Industrial Registrar
          </span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Register of Trade Unions</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          The official public list of trade unions registered under the{" "}
          <a href="/legislation/industrial-relations-act-1962.pdf" target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline decoration-accent decoration-2 underline-offset-4 hover:decoration-accent/60">Industrial Organizations Act</a>
          . Published by the Office of The Industrial Registrar for transparency and public verification.
        </p>
        {lastUpdated && <p className="text-xs text-muted-foreground">Last updated: {lastUpdated}</p>}
        <p className="mx-auto max-w-xl text-xs italic text-muted-foreground/80">
          This register is published in accordance with Section 5 of the Industrial Organizations Act, which requires the Registrar to maintain a public register of registered trade unions.
        </p>
      </div>
    );
  }

  function renderSearch() {
    return (
      <div className="space-y-4">
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold">Registered Unions</h2>
          <p className="text-sm text-muted-foreground">All trade unions currently on the public register. Click a union to view its published documents.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Filter by name or registration number..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        {unionsLoading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => (<Card key={i}><CardContent className="flex items-center justify-between p-4"><div className="space-y-2"><div className="h-5 w-48 animate-pulse rounded bg-muted" /><div className="h-4 w-32 animate-pulse rounded bg-muted" /></div><div className="h-6 w-16 animate-pulse rounded bg-muted" /></CardContent></Card>))}</div>
        ) : unionsError ? <ErrorState description={unionsError} />
        : filteredUnions.length === 0 ? <EmptyState icon={Building2} title="No unions found" description={searchQuery.trim() ? "No unions match your filter. Try a different search term." : "The register is currently empty."} />
        : (<>
          <p className="text-sm text-muted-foreground">{filteredUnions.length} union{filteredUnions.length !== 1 ? "s" : ""}{searchQuery.trim() && " matched"} · sorted alphabetically</p>
          <div className="space-y-2">
            {filteredUnions.map((u) => (
              <Link key={u.id} href={`/unions/${u.registrationNo}`}>
                <Card className="cursor-pointer transition-colors hover:bg-muted/50 border-l-2 border-solid border-l-transparent hover:border-l-accent">
                  <CardContent className="flex items-center justify-between p-4">
                    <div><p className="font-medium">{u.unionName}</p><p className="text-sm text-muted-foreground">Reg. No: {u.registrationNo}</p></div>
                    <StatusBadge status={u.status} />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>)}
      </div>
    );
  }

  function renderLegislation() {
    return (
      <div className="space-y-4">
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold">Resources</h2>
          <p className="text-sm text-muted-foreground">Acts and regulations governing trade unions in Papua New Guinea.</p>
        </div>
        {legLoading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (<Card key={i}><CardContent className="space-y-2 p-4"><div className="h-5 w-2/3 animate-pulse rounded bg-muted" /><div className="h-4 w-full animate-pulse rounded bg-muted" /></CardContent></Card>))}</div>
        : legError ? <ErrorState description={legError} />
        : legislation && legislation.length > 0 ? (<div className="space-y-3">{legislation.map((entry) => (
          <Card key={entry.id}><CardContent className="p-4"><div className="flex items-start justify-between gap-4"><div className="flex-1"><div className="mb-1 flex items-center gap-2"><h3 className="font-medium">{entry.title}</h3><Badge variant="outline" className="text-xs">{entry.category}</Badge></div><p className="mb-2 text-sm text-muted-foreground">{entry.summary}</p><p className="text-xs text-muted-foreground">{entry.jurisdiction} · {entry.year} · Last updated {new Date(entry.lastUpdated).toLocaleDateString()}</p></div><Button asChild size="sm" variant="outline"><a href={entry.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-3 w-3" />View PDF</a></Button></div></CardContent></Card>
        ))}</div>)
        : <EmptyState icon={Scale} title="No resources available" description="The resources library is empty. Please check back later." />}
      </div>
    );
  }

  function renderHelp() {
    // Build glossary entries from the canonical status configs (single source
    // of truth in vocabulary.ts). The public glossary uses plainLanguage
    // (everyday wording) as the primary text + the formal definition as a
    // secondary detail.
    const unionStatusEntries: GlossaryEntry[] = Object.values(UNION_STATUS_CONFIG).map((cfg) => ({
      label: cfg.label,
      icon: cfg.icon,
      tone: cfg.className,
      definition: cfg.definition,
      plainLanguage: cfg.plainLanguage,
    }));

    // Compliance statuses — shown without NOT_APPLICABLE (not relevant to the
    // public; it's an internal config concept). Use COMPLIANCE_STATUS_CONFIG
    // from vocabulary.ts (which mirrors status-config.ts but with the same
    // plain-language definitions).
    const complianceEntries: GlossaryEntry[] = Object.entries(COMPLIANCE_STATUS_CONFIG)
      .filter(([key]) => key !== "NOT_APPLICABLE")
      .map(([, cfg]) => ({
        label: cfg.label,
        icon: cfg.icon,
        tone: cfg.cell,
        definition: cfg.definition,
      }));

    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold">What These Terms Mean</h2>
          <p className="text-sm text-muted-foreground">
            A short guide to the words used on this register. If you see a term you don&apos;t recognise, check here.
          </p>
        </div>

        <StatusGlossary
          title="Union Statuses"
          description="The status shown next to each union on the register."
          entries={unionStatusEntries}
          showPlainLanguage
        />

        <StatusGlossary
          title="Compliance Statuses"
          description="How the Registrar tracks whether each union has filed the documents it needs to file."
          entries={complianceEntries}
        />

        <Card>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent-foreground" />
              <div className="text-sm text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">Still unsure?</p>
                <p>
                  If a term on this register doesn&apos;t make sense, or you have a question about a specific union, contact the Office of The Industrial Registrar — details are in the footer below.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Image src="/coat-of-arms.png" alt="National Emblem of Papua New Guinea" width={32} height={26} className="h-8 w-auto" />
            <div><p className="text-sm font-semibold leading-tight">Register of Trade Unions</p><p className="text-xs text-muted-foreground">Office of The Industrial Registrar · Papua New Guinea</p></div>
          </div>
          <Button variant="outline" size="sm" className="border-foreground/20 text-foreground/70 hover:text-foreground hover:border-foreground/40" onClick={onStaffLogin}><LogIn className="mr-2 h-4 w-4" />Sign In</Button>
        </div>
        <div className="h-1.5 bg-accent" />
      </header>
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl gap-1 px-4">
          <button onClick={() => handleTabChange("register")} className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${tab === "register" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Register</button>
          <button onClick={() => handleTabChange("resources")} className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${tab === "resources" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Resources</button>
          <button onClick={() => handleTabChange("help")} className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${tab === "help" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Help</button>
        </div>
      </div>
      <main className="mx-auto max-w-4xl space-y-10 p-4 py-10">
        {renderHero()}
        {tab === "register" ? renderSearch() : tab === "resources" ? renderLegislation() : renderHelp()}
      </main>
      <footer className="border-t bg-card">
        <div className="mx-auto max-w-4xl space-y-3 px-4 py-6 text-center text-xs text-muted-foreground">
          <p className="font-medium">Office of The Industrial Registrar</p>
          <p>PNG Department of Labour &amp; Industrial Relations</p>
          {/* Contact details — only rendered if at least one is configured
              via NEXT_PUBLIC_REGISTRAR_* env vars. The compact variant shows
              them as a single inline line, separated by middle dots. */}
          <RegistrarContactInfo variant="compact" className="text-xs" />
          <p className="text-muted-foreground/70">© {new Date().getFullYear()} Independent State of Papua New Guinea · All rights reserved</p>
          <p className="text-muted-foreground/70">This register is published in accordance with the Industrial Organizations Act. For enquiries, contact the Office of The Industrial Registrar.</p>
        </div>
      </footer>
    </div>
  );
}
