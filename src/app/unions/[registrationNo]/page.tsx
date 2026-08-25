import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { ArrowLeft, FileText, ExternalLink, Shield, ArrowRight, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Metadata } from "next";

const PUBLIC_DOC_TYPES = ["Registration Certificate", "Constitution"];

interface PageProps { params: Promise<{ registrationNo: string }>; }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { registrationNo } = await params;
  const union = await db.union.findUnique({ where: { registrationNo }, select: { unionName: true, registrationNo: true, status: true } });
  if (!union) return { title: "Union Not Found" };
  return {
    title: `${union.unionName} (${union.registrationNo})`,
    description: `${union.unionName} — registration number ${union.registrationNo}, status: ${union.status}. Official record from the Register of Trade Unions, Papua New Guinea.`,
    openGraph: { title: `${union.unionName} — Register of Trade Unions`, description: `Registration No: ${union.registrationNo} · Status: ${union.status}`, type: "article" },
  };
}

export default async function UnionDetailPage({ params }: PageProps) {
  const { registrationNo } = await params;
  const union = await db.union.findUnique({
    where: { registrationNo },
    select: {
      id: true, unionName: true, registrationNo: true, fileNumber: true, status: true,
      documents: {
        where: { documentType: { in: PUBLIC_DOC_TYPES }, disposedAt: null },
        select: { id: true, documentType: true, versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, versionNumber: true, fileName: true, uploadedAt: true, fileExtension: true } } },
      },
    },
  });
  if (!union) notFound();
  const authUser = await getAuthUser();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/coat-of-arms.png" alt="National Emblem of Papua New Guinea" width={32} height={26} className="h-8 w-auto" />
            <div><p className="text-sm font-semibold leading-tight">Register of Trade Unions</p><p className="text-xs text-muted-foreground">Office of The Industrial Registrar · Papua New Guinea</p></div>
          </Link>
          {authUser ? (
            <Button asChild variant="ghost" size="sm"><Link href="/"><ArrowLeft className="mr-2 h-4 w-4" />Back to Dashboard</Link></Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm"><Link href="/"><ArrowLeft className="mr-2 h-4 w-4" />Back to Register</Link></Button>
              <Button asChild variant="default" size="sm"><Link href="/?login=1"><LogIn className="mr-2 h-4 w-4" />Staff Login</Link></Button>
            </div>
          )}
        </div>
        <div className="h-1.5 bg-accent" />
      </header>

      <main className="mx-auto max-w-4xl space-y-8 p-4 py-10">
        <div className="space-y-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <Badge variant="outline" className="text-xs">Reg. No: {union.registrationNo}</Badge>
            <Badge variant={union.status === "ACTIVE" ? "default" : "secondary"}>{union.status}</Badge>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">{union.unionName}</h1>
          {union.fileNumber && <p className="text-sm text-muted-foreground">File Number: {union.fileNumber}</p>}
        </div>

        {authUser && (
          <Card className="border-l-4 border-l-primary">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary" />
                <div><p className="text-sm font-medium">Staff Access</p><p className="text-xs text-muted-foreground">You are signed in as {authUser.email}. Open this union in the dashboard to edit details, upload documents, and manage versions.</p></div>
              </div>
              <Button asChild size="sm"><Link href={`/?union=${union.id}`}>Open in Dashboard<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-xl font-semibold">Published Documents</h2>
            <p className="mt-1 text-sm text-muted-foreground">Documents published by the Industrial Registrar for public verification.</p>
          </div>
          {union.documents.length === 0 ? (
            <Card><CardContent className="py-8 text-center"><FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="text-sm font-medium">No public documents published</p><p className="mt-1 text-xs text-muted-foreground">The Registrar has not published any documents for this union yet.</p></CardContent></Card>
          ) : (
            <div className="space-y-3">
              {union.documents.map((doc) => {
                const lv = doc.versions[0];
                const dl = lv ? `/api/public/files/${lv.id}` : null;
                return (
                  <Card key={doc.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div><p className="text-sm font-medium">{doc.documentType}</p>{lv && <p className="text-xs text-muted-foreground">Version {lv.versionNumber} · uploaded {new Date(lv.uploadedAt).toLocaleDateString()}{lv.fileExtension && ` · ${lv.fileExtension.toUpperCase()}`}</p>}</div>
                      </div>
                      {dl && <Button asChild size="sm" variant="outline"><a href={dl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-3 w-3" />View</a></Button>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <Card className="bg-muted/30"><CardContent className="py-4"><p className="text-xs text-muted-foreground">For enquiries regarding this union, contact the Office of The Industrial Registrar, PNG Department of Labour &amp; Industrial Relations.</p></CardContent></Card>
      </main>

      <footer className="border-t bg-card">
        <div className="mx-auto max-w-4xl space-y-2 px-4 py-6 text-center text-xs text-muted-foreground">
          <p className="font-medium">Office of The Industrial Registrar</p>
          <p>PNG Department of Labour &amp; Industrial Relations</p>
          <p className="text-muted-foreground/70">© {new Date().getFullYear()} Independent State of Papua New Guinea · All rights reserved</p>
        </div>
      </footer>
    </div>
  );
}
