"use client";

import { Archive, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";

// =============================================================================
// Retention view — pending disposal list with Approve (REGISTRAR) + Snooze.
//
// Lists documents whose retention period has elapsed. Each row shows:
//   - Union name + registration no
//   - Document type + version
//   - Filed date + retention years + disposal due date
//
// ACTIONS:
//   - Approve (REGISTRAR only): marks the document as disposed.
//   - Snooze (REGISTRAR + INSPECTOR): defers disposal by 30 days.
// =============================================================================

interface RetentionItem {
  documentId: string;
  documentType: string;
  unionId: string;
  unionName: string;
  registrationNo: string;
  filedAt: string;
  retentionYrs: number;
  disposalDueDate: string;
  snoozedUntil: string | null;
  versionNumber: number;
  fileName: string;
}

interface User {
  role: "REGISTRAR" | "INSPECTOR" | "OFFICER";
}

export function RetentionView({ user }: { user: User }) {
  const { data, loading, error, refetch } = useFetch<{ pending: RetentionItem[] }>("/api/retention");

  if (loading) return <CardListSkeleton count={4} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data) return null;

  const isRegistrar = user.role === "REGISTRAR";

  async function approve(documentId: string) {
    if (!confirm("Approve this document for disposal? This action is IRREVERSIBLE.")) return;
    try {
      const res = await fetch(`/api/retention/${documentId}/approve`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to approve disposal.");
        return;
      }
      toast.success("Document disposed.");
      refetch();
    } catch {
      toast.error("Network error.");
    }
  }

  async function snooze(documentId: string) {
    try {
      const res = await fetch(`/api/retention/${documentId}/reject`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to snooze.");
        return;
      }
      toast.success("Disposal snoozed for 30 days.");
      refetch();
    } catch {
      toast.error("Network error.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Retention Queue</h1>
        <p className="text-sm text-muted-foreground">
          Documents whose retention period has elapsed. Review and approve for disposal, or snooze.
        </p>
      </div>

      {data.pending.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="No documents pending disposal"
          description="All documents are within their retention period. Check back later."
        />
      ) : (
        <div className="space-y-3">
          {data.pending.map((item) => {
            const isOverdue = new Date(item.disposalDueDate).getTime() < Date.now();
            return (
              <Card key={item.documentId}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{item.documentType}</h3>
                        <Badge variant="outline" className="text-xs">v{item.versionNumber}</Badge>
                        {isOverdue ? (
                          <Badge variant="destructive" className="text-xs">Overdue</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Due</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.unionName} ({item.registrationNo})
                      </p>
                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>Filed: {new Date(item.filedAt).toLocaleDateString()}</span>
                        <span>Retention: {item.retentionYrs === 99 ? "Permanent" : `${item.retentionYrs} years`}</span>
                        <span>Due: {new Date(item.disposalDueDate).toLocaleDateString()}</span>
                        {item.snoozedUntil && (
                          <span className="text-amber-600">
                            Snoozed until: {new Date(item.snoozedUntil).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {isRegistrar && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => approve(item.documentId)}
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Approve Disposal
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => snooze(item.documentId)}
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        Snooze 30d
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
