import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { ArrowLeft, FileText, Shield, ArrowRight, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/app/print-button";
import { DocumentList } from "@/components/app/document-list";
import { StatusBadge } from "@/components/app/status-badge";
import { RegistrarContactInfo } from "@/components/app/registrar-contact-info";
import type { Metadata } from "next";

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
        where: { isPublic: true, disposedAt: null },
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
              <Button asChild variant="default" size="sm"><Link href="/?login=1"><LogIn className="mr-2 h-4 w-4" />Sign In</Link></Button>
            </div>
          )}
        </div>
        <div className="h-1.5 bg-accent" />
      </header>

      <main className="mx-auto max-w-4xl space-y-8 p-4 py-10">
        {/* Print-only official header — hidden on screen, shown on paper */}
        <div className="print-only text-center border-b-2 border-black pb-4 mb-6">
          <Image src="/coat-of-arms.png" alt="National Emblem of Papua New Guinea" width={60} height={49} className="mx-auto mb-2 h-14 w-auto" />
          <p style={{ fontFamily: "Georgia, serif" }} className="text-sm font-bold">Independent State of Papua New Guinea</p>
          <p style={{ fontFamily: "Georgia, serif" }} className="text-xs">Office of The Industrial Registrar</p>
          <p style={{ fontFamily: "Georgia, serif" }} className="text-xs">Department of Labour &amp; Industrial Relations</p>
          <hr className="my-2 border-t border-black" />
          <p style={{ fontFamily: "Georgia, serif" }} className="text-xs font-semibold">OFFICIAL EXTRACT FROM THE REGISTER OF TRADE UNIONS</p>
          <p style={{ fontFamily: "Georgia, serif" }} className="text-xs">Printed: {new Date().toLocaleDateString("en-PG", { year: "numeric", month: "long", day: "numeric" })}</p>
        </div>

        <div className="space-y-3 text-center">
          <div className="flex items-center justify-center gap-2 no-print">
            <Badge variant="outline" className="text-xs">Reg. No: {union.registrationNo}</Badge>
            <StatusBadge status={union.status} />
            <PrintButton />
          </div>
          {/* Print-only: show reg number + status as plain text (badges don't print well) */}
          <div className="print-only">
            <p style={{ fontFamily: "Georgia, serif" }} className="text-sm">Registration No: {union.registrationNo} · Status: {union.status}</p>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">{union.unionName}</h1>
          {union.fileNumber && <p className="text-sm text-muted-foreground">File Number: {union.fileNumber}</p>}
        </div>

        {authUser && (
          <Card className="border-l-4 border-l-primary no-print">
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
            <p className="mt-1 text-sm text-muted-foreground no-print">Documents published by the Industrial Registrar for public verification.</p>
          </div>
          <DocumentList documents={union.documents} />
        </div>

        <Card className="bg-muted/30 print-card">
          <CardContent className="py-4">
            {/* Contact block — rendered only if at least one env var is set.
                When configured, this turns the previous "contact the Office"
                stub into a real, actionable enquiry card with phone / email /
                address + office hours. When unconfigured, falls back to the
                plain stub line so the page still reads cleanly. */}
            <div className="no-print">
              <RegistrarContactInfo variant="card" />
              <p className="mt-3 text-xs text-muted-foreground">
                For enquiries regarding this union, contact the Office of The Industrial Registrar, PNG Department of Labour &amp; Industrial Relations.
              </p>
            </div>
            {/* Print-only: plain text, no icons. Keeps the printed extract
                looking like an official document. */}
            <p className="print-only text-xs text-muted-foreground">
              For enquiries regarding this union, contact the Office of The Industrial Registrar, PNG Department of Labour &amp; Industrial Relations.
            </p>
          </CardContent>
        </Card>

        {/* Print-only footer — official certification line */}
        <div className="print-only text-center mt-8 pt-4 border-t border-black">
          <p style={{ fontFamily: "Georgia, serif" }} className="text-xs">This extract is a true copy of the public register as maintained by the Industrial Registrar.</p>
          <p style={{ fontFamily: "Georgia, serif" }} className="text-xs">Published in accordance with Section 5 of the Industrial Organizations Act.</p>
          <p style={{ fontFamily: "Georgia, serif" }} className="text-xs mt-4">© {new Date().getFullYear()} Independent State of Papua New Guinea</p>
        </div>
      </main>

      <footer className="border-t bg-card">
        <div className="mx-auto max-w-4xl space-y-3 px-4 py-6 text-center text-xs text-muted-foreground">
          <p className="font-medium">Office of The Industrial Registrar</p>
          <p>PNG Department of Labour &amp; Industrial Relations</p>
          <RegistrarContactInfo variant="compact" className="text-xs" />
          <p className="text-muted-foreground/70">© {new Date().getFullYear()} Independent State of Papua New Guinea · All rights reserved</p>
        </div>
      </footer>
    </div>
  );
}
