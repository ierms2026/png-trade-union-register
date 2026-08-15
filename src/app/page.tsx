import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// Session 1 placeholder.
//
// This page is the only route the user can preview right now. Once the auth
// engine is wired up (Steps 3 + 4 of Session 1), this route will be replaced
// by a redirect: unauthenticated → /login, authenticated → /dashboard.
//
// For now it just confirms the stack is alive: Next.js + Tailwind + shadcn/ui
// rendering, Prisma schema pushed to SQLite, dev server responding.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center">
            <Badge variant="outline" className="text-xs font-medium">
              Session 1 · Phase A
            </Badge>
          </div>
          <CardTitle className="text-2xl">Union Records Management System</CardTitle>
          <CardDescription>
            Office of The Industrial Registrar
            <br />
            PNG Department of Labour &amp; Industrial Relations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p className="text-center font-medium text-foreground">
            Session 1 in progress
          </p>
          <ul className="space-y-1.5 text-xs">
            <li>• Next.js 16 + TypeScript + TailwindCSS + shadcn/ui — scaffolded</li>
            <li>• Prisma + SQLite — initialized</li>
            <li>• Dependencies installed — bcryptjs, otplib, qrcode</li>
            <li>• Schema pushed — User, Session, LoginAttempt, AuditLog</li>
          </ul>
          <p className="text-center text-xs">
            Auth API routes + Login UI arrive in Steps 3 &amp; 4.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
