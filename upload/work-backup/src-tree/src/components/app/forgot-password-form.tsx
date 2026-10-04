"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Loader2, ArrowLeft, MailCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/app/field-error";
import { validateEmail, isValid } from "@/lib/validation";

// =============================================================================
// ForgotPasswordForm — shown when a user clicks "Forgot password?" on the
// sign-in screen.
//
// Flow:
//   1. User enters their email.
//   2. We POST /api/auth/forgot-password.
//   3. The server ALWAYS returns the same success message whether or not the
//      email exists (to prevent email enumeration). We surface that message
//      verbatim + show a "Check your inbox" confirmation card.
//   4. The user clicks the link in the email → ?token=xxx is handled by the
//      existing SetPasswordForm (no new code needed for that step).
//   5. If they want to try a different email, they click "Try a different
//      email" and we go back to the form.
//
// RATE-LIMIT HANDLING:
//   The server enforces 3 requests / 10 minutes per IP. On 429 we show a
//   friendly "You've tried this several times recently. Please wait a few
//   minutes before trying again." message rather than a raw error toast.
// =============================================================================

interface Props {
  onBackToLogin: () => void;
}

export function ForgotPasswordForm({ onBackToLogin }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [submitted, setSubmitted] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const newErrors = { email: validateEmail(email) };
    setErrors(newErrors);
    if (!isValid(newErrors)) return;
    setLoading(true);
    setRateLimited(false);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      // 429 Too Many Requests — the server's rate limit kicked in. Show
      // a friendlier message than a generic toast error.
      if (res.status === 429) {
        setRateLimited(true);
        setLoading(false);
        return;
      }
      // Any other response — 200 (success) or 400 (validation). For 200
      // we show the confirmation card. For 400 we surface the validation
      // error. (The server deliberately returns 200 even for unknown
      // emails, so we don't branch on res.ok here — we always treat 2xx
      // as "request received, check your inbox".)
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (res.status >= 400 && data.error) {
        setErrors({ email: data.error });
        setLoading(false);
        return;
      }
      setSubmitted(true);
      toast.success("Reset link sent — check your inbox.");
    } catch {
      toast.error("Network error. Please try again.");
      setLoading(false);
    }
  }

  function reset() {
    setSubmitted(false);
    setRateLimited(false);
    setEmail("");
    setErrors({});
    onBackToLogin();
  }

  // --- Confirmation card: shown after a successful (or "successful") submit
  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center text-center">
            <Image src="/coat-of-arms.png" alt="National Emblem of Papua New Guinea" width={60} height={49} className="mb-3 h-14 w-auto" />
            <h1 className="text-3xl font-bold tracking-tight">Register of Trade Unions</h1>
            <p className="mt-1 text-sm text-muted-foreground">Office of The Industrial Registrar<br />PNG Department of Labour &amp; Industrial Relations</p>
          </div>
          <Card>
            <CardHeader>
              <div className="mb-2 flex items-center gap-2">
                <div className="rounded-lg bg-accent/20 p-2">
                  <MailCheck className="h-5 w-5 text-accent-foreground" />
                </div>
                <div>
                  <CardTitle className="text-xl">Check Your Inbox</CardTitle>
                  <CardDescription>If the email matches an account, a reset link is on its way.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md bg-muted/40 p-4 text-sm text-muted-foreground">
                <p className="mb-2 font-medium text-foreground">What happens next?</p>
                <ul className="ml-4 list-disc space-y-1.5">
                  <li>If an account exists for <span className="font-medium text-foreground">{email.trim().toLowerCase()}</span>, you&apos;ll receive an email with a password reset link within a few minutes.</li>
                  <li>The link expires in 1 hour.</li>
                  <li>If you don&apos;t see the email, check your spam folder.</li>
                  <li>If you still don&apos;t receive it, the email may not match an account on this register — contact the Industrial Registrar&apos;s office for help.</li>
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">
                For security reasons, we don&apos;t reveal whether an account exists for the email you entered. This stops strangers from using this form to discover who has an account.
              </p>
              <div className="flex flex-col gap-2">
                <Button type="button" variant="outline" className="w-full" onClick={() => { setSubmitted(false); setEmail(""); }}>
                  Try a different email
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={reset}>
                  <ArrowLeft className="mr-2 h-4 w-4" />Back to Sign in
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // --- Rate-limited card: shown when the server returns 429
  if (rateLimited) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center text-center">
            <Image src="/coat-of-arms.png" alt="National Emblem of Papua New Guinea" width={60} height={49} className="mb-3 h-14 w-auto" />
            <h1 className="text-3xl font-bold tracking-tight">Register of Trade Unions</h1>
            <p className="mt-1 text-sm text-muted-foreground">Office of The Industrial Registrar<br />PNG Department of Labour &amp; Industrial Relations</p>
          </div>
          <Card>
            <CardHeader>
              <div className="mb-2 flex items-center gap-2">
                <div className="rounded-lg bg-destructive/10 p-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <CardTitle className="text-xl">Too Many Requests</CardTitle>
                  <CardDescription>You&apos;ve tried this several times recently.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                To prevent abuse, we limit how often a password reset can be requested from the same network. Please wait a few minutes before trying again.
              </p>
              <p className="text-xs text-muted-foreground">
                If you keep seeing this message, contact the Industrial Registrar&apos;s office directly — contact details are in the public site footer.
              </p>
              <div className="flex flex-col gap-2">
                <Button type="button" variant="outline" className="w-full" onClick={() => { setRateLimited(false); setEmail(""); }}>
                  Try again later
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={reset}>
                  <ArrowLeft className="mr-2 h-4 w-4" />Back to Sign in
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // --- Form card: initial state
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <Image src="/coat-of-arms.png" alt="National Emblem of Papua New Guinea" width={60} height={49} className="mb-3 h-14 w-auto" />
          <h1 className="text-3xl font-bold tracking-tight">Register of Trade Unions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Office of The Industrial Registrar<br />PNG Department of Labour &amp; Industrial Relations</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Forgot Password</CardTitle>
            <CardDescription>Enter your email and we&apos;ll send you a link to set a new password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
                <FieldError error={errors.email} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending reset link...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
            </form>
            <div className="mt-4 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Good to know</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>The link expires in 1 hour.</li>
                <li>If the email doesn&apos;t match an account, no email is sent — but we show the same confirmation to prevent account discovery.</li>
                <li>If you remember your password, just go back to Sign in.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
        <div className="text-center">
          <Button variant="link" className="text-muted-foreground" onClick={onBackToLogin}>
            <ArrowLeft className="mr-2 h-4 w-4" />Back to Sign in
          </Button>
        </div>
      </div>
    </div>
  );
}
