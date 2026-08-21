"use client";

import { type LucideIcon, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// =============================================================================
// ErrorState — shown when a data fetch fails.
//
// Consistent error UI: an icon, a title, a description, and a retry
// button. The retry button calls the view's refetch function to try
// the request again (useful for transient network errors).
// =============================================================================

interface ErrorStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  icon: Icon = AlertCircle,
  title = "Something went wrong",
  description = "We couldn't load this data. Please try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 rounded-full bg-destructive/10 p-3">
          <Icon className="h-6 w-6 text-destructive" />
        </div>
        <h3 className="mb-1 text-base font-medium">{title}</h3>
        <p className="mb-4 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
        {onRetry && (
          <Button onClick={onRetry} size="sm" variant="outline">
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
