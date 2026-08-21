"use client";

import { useState, type FormEvent } from "react";
import { Building2, Loader2, ShieldCheck, Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { FieldError } from "@/components/app/field-error";
import { validateEmail, validateRequired, isValid } from "@/lib/validation";

// =============================================================================
// LoginForm — two-step login (password → 2FA if enabled).
//
// FLOW:
//   1. User enters email + password.
//   2. POST /api/auth/login.
//   3. If the response says `requiresTwoFactor`, show the 2FA step.
//   4. User enters 6-digit code from their authenticator app.
//   5. POST /api/auth/login/2fa with the challenge token + code.
//   6. On success, the cookie is set → redirect to "/" (which re-checks
//      /api/auth/me and shows the app shell).
//
// AFTER LOGIN:
//   We use `window.location.href = "/"` (not router.refresh) so the
//   browser does a full navigation — this guarantees the cookie is
//   sent on the next request and the app shell renders correctly.
//
// DEMO CREDENTIALS:
//   Shown below the form for convenience. In production, this would be
//   removed (or shown only in a dev build).
// =============================================================================

interface LoginResponse {
  requiresTwoFactor?: boolean;
  challengeToken?: string;
  email?: string;
  user?: {
    id: string;
    email: string;
    role: string;
    assignedUnionId: string | null;
    twoFactorEnabled: boolean;
  };
  error?: string;
}

interface Props {
  onPublicPortal: () => void;
}

export function LoginForm({ onPublicPortal }: Props) {
  const [step, setStep] = useState<"password" | "2fa">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    const newErrors = {
      email: validateEmail(email),
      password: validateRequired(password, "Password"),
    };
    setErrors(newErrors);
    if (!isValid(newErrors)) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data: LoginResponse = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Login failed.");
        setLoading(false);
        return;
      }
      if (data.requiresTwoFactor && data.challengeToken) {
        setChallengeToken(data.challengeToken);
        setStep("2fa");
        setLoading(false);
        return;
      }
      // Success (no 2FA) — full navigation so the cookie is picked up.
      toast.success("Welcome back!");
      window.location.href = "/";
    } catch {
      toast.error("Network error. Please try again.");
      setLoading(false);
    }
  }

  async function handle2faSubmit(e: FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) {
      setErrors({ otp: "Code must be 6 digits." });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ challengeToken, otp }),
      });
      const data: LoginResponse = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Verification failed.");
        setOtp("");
        setLoading(false);
        return;
      }
      toast.success("Welcome back!");
      window.location.href = "/";
    } catch {
      toast.error("Network error. Please try again.");
      setLoading(false);
    }
  }

  function backToPassword() {
    setStep("password");
    setOtp("");
    setChallengeToken("");
    setErrors({});
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 rounded-xl bg-primary p-3">
            <Building2 className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Union Records Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Office of The Industrial Registrar
            <br />
            PNG Department of Labour &amp; Industrial Relations
          </p>
        </div>

        {step === "password" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Sign in</CardTitle>
              <CardDescription>
                Enter your credentials to access the registry.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
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
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <FieldError error={errors.password} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>

              {process.env.NODE_ENV !== "production" && (
                <div className="mt-6 rounded-md bg-muted/50 p-3 text-xs">
                  <p className="mb-2 flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Demo credentials
                  </p>
                  <div className="space-y-1 text-muted-foreground">
                    <p><code className="font-mono">registrar@example.com</code> — full admin</p>
                    <p><code className="font-mono">inspector@example.com</code> — read-only</p>
                    <p><code className="font-mono">officer@example.com</code> — scoped to one union</p>
                    <p className="pt-1 font-medium">Password: <code className="font-mono">Test!2345</code></p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Two-factor authentication</CardTitle>
              <CardDescription>
                Enter the 6-digit code from your authenticator app.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handle2faSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Verification code</Label>
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={otp}
                      onChange={(v) => {
                        setOtp(v);
                        setErrors({});
                      }}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <FieldError error={errors.otp} />
                </div>
                <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={backToPassword}
                  disabled={loading}
                >
                  Back to sign in
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <Button
            variant="link"
            className="text-muted-foreground"
            onClick={onPublicPortal}
          >
            <Globe className="mr-2 h-4 w-4" />
            View public union registry
          </Button>
        </div>
      </div>
    </div>
  );
}
