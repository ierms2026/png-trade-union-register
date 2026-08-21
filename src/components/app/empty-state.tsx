"use client";

import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// =============================================================================
// EmptyState — shown when a list/grid has zero items.
//
// Consistent empty-state UI across all views: an icon, a title, a
// description, and an optional action button. Prevents the "blank box
// of confusion" that users see when a view has no data.
// =============================================================================

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 rounded-full bg-muted p-3">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mb-1 text-base font-medium">{title}</h3>
        <p className="mb-4 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
        {action && (
          <Button onClick={action.onClick} size="sm">
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
