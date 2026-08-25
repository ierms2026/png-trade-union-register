"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Building2, Search, FileText, ArrowLeft, ExternalLink, Scale, LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useFetch } from "@/components/app/use-fetch";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";

interface PublicUnion { id: string; unionName: string; registrationNo: string; status: string; }
interface LegislationEntry { id: string; title: string; shortTitle: string; year: number; jurisdiction: string; category: string; summary: string; url: string; lastUpdated: string; }
interface Props { onStaffLogin: () => void; }

export function PublicPortal({ onStaffLogin }: Props) {
  const [tab, setTab] = useState<"search" | "legislation">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const { data: allUnions, loading: unionsLoading, error: unionsError } = useFetch<{ unions: PublicUnion[] }>("/api/public/unions");
  const { data: legislation, loading: legLoading, error: legError } = useFetch<LegislationEntry[]>("/api/legislation");

  const filteredUnions: PublicUnion[] = (() => {
    const all = allUnions?.unions ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter((u) => u.unionName.toLowerCase().includes(q) || u.registrationNo.toLowerCase().includes(q));
  })();

  function renderHero() {
    const lastUpdated = allUnions ? new Date().toLocaleDateString("en-PG", { year: "numeric", month: "long", day: "numeric" }) : null;
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
                <Card className="cursor-pointer transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center justify-between p-4">
                    <div><p className="font-medium">{u.unionName}</p><p className="text-sm text-muted-foreground">Reg. No: {u.registrationNo}</p></div>
                    <Badge variant={u.status === "ACTIVE" ? "default" : "secondary"}>{u.status}</Badge>
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
          <h2 className="text-lg font-semibold">Legislation Library</h2>
          <p className="text-sm text-muted-foreground">Acts and regulations governing trade unions in Papua New Guinea.</p>
        </div>
        {legLoading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (<Card key={i}><CardContent className="space-y-2 p-4"><div className="h-5 w-2/3 animate-pulse rounded bg-muted" /><div className="h-4 w-full animate-pulse rounded bg-muted" /></CardContent></Card>))}</div>
        : legError ? <ErrorState description={legError} />
        : legislation && legislation.length > 0 ? (<div className="space-y-3">{legislation.map((entry) => (
          <Card key={entry.id}><CardContent className="p-4"><div className="flex items-start justify-between gap-4"><div className="flex-1"><div className="mb-1 flex items-center gap-2"><h3 className="font-medium">{entry.title}</h3><Badge variant="outline" className="text-xs">{entry.category}</Badge></div><p className="mb-2 text-sm text-muted-foreground">{entry.summary}</p><p className="text-xs text-muted-foreground">{entry.jurisdiction} · {entry.year} · Last updated {new Date(entry.lastUpdated).toLocaleDateString()}</p></div><Button asChild size="sm" variant="outline"><a href={entry.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-3 w-3" />View PDF</a></Button></div></CardContent></Card>
        ))}</div>)
        : <EmptyState icon={Scale} title="No legislation available" description="The legislation library is empty. Please check back later." />}
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
          <Button variant="default" size="sm" onClick={onStaffLogin}><LogIn className="mr-2 h-4 w-4" />Staff Login</Button>
        </div>
        <div className="h-1.5 bg-accent" />
      </header>
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl gap-1 px-4">
          <button onClick={() => setTab("search")} className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${tab === "search" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Register</button>
          <button onClick={() => setTab("legislation")} className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${tab === "legislation" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Legislation Library</button>
        </div>
      </div>
      <main className="mx-auto max-w-4xl space-y-10 p-4 py-10">
        {renderHero()}
        {tab === "search" ? renderSearch() : renderLegislation()}
      </main>
      <footer className="border-t bg-card">
        <div className="mx-auto max-w-4xl space-y-2 px-4 py-6 text-center text-xs text-muted-foreground">
          <p className="font-medium">Office of The Industrial Registrar</p>
          <p>PNG Department of Labour &amp; Industrial Relations</p>
          <p className="text-muted-foreground/70">© {new Date().getFullYear()} Independent State of Papua New Guinea · All rights reserved</p>
          <p className="text-muted-foreground/70">This register is published in accordance with the Industrial Organizations Act. For enquiries, contact the Office of The Industrial Registrar.</p>
        </div>
      </footer>
    </div>
  );
}
