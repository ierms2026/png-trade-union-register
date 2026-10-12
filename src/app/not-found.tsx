import Link from "next/link";
import { FileQuestion, Home, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// =============================================================================
// not-found.tsx — friendly 404 page.
//
// Triggered by Next.js when:
//   - A user visits a URL that doesn't match any route
//   - A notFound() function is called from a server component / route handler
//
// Friendly wording + a clear way back. No jargon ("404", "Not Found",
// "route"). Just "we couldn't find that page" + three concrete next steps.
// =============================================================================

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <FileQuestion className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl">We couldn&apos;t find that page</CardTitle>
          <CardDescription>
            The page you were looking for may have moved, been removed, or never
            existed. Try one of these instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" aria-hidden="true" />
              Go to the home page
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/?view=search">
              <Search className="mr-2 h-4 w-4" aria-hidden="true" />
              Search the registry
            </Link>
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            If you reached this page from a link inside the system, please tell
            the Registrar so the link can be fixed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
