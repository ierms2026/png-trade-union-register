"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { FieldError } from "@/components/app/field-error";
import { ForgotPasswordForm } from "@/components/app/forgot-password-form";
import { validateEmail, validateRequired, isValid } from "@/lib/validation";

interface LoginResponse {
  requiresTwoFactor?: boolean; challengeToken?: string; email?: string;
  user?: { id: string; email: string; role: string; assignedUnionId: string | null; twoFactorEnabled: boolean; };
  error?: string;
}
interface Props { onBackToPortal: () => void; }

export function LoginForm({ onBackToPortal }: Props) {
  // The login screen has three sub-states:
  //   - "password": email + password form (the default)
  //   - "2fa":      6-digit TOTP code form (after password verifies)
  //   - "forgot":   self-service "Forgot password?" form
  // All three share the same chrome (coat-of-arms header, "Back to Public
  // Portal" footer). Only the card body changes.
  const [step, setStep] = useState<"password" | "2fa" | "forgot">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    const newErrors = { email: validateEmail(email), password: validateRequired(password, "Password") };
    setErrors(newErrors);
    if (!isValid(newErrors)) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email: email.trim().toLowerCase(), password }) });
      const data: LoginResponse = await res.json();
      if (!res.ok) { toast.error(data.error || "Login failed."); setLoading(false); return; }
      if (data.requiresTwoFactor && data.challengeToken) { setChallengeToken(data.challengeToken); setStep("2fa"); setLoading(false); return; }
      toast.success("Welcome back!");
      window.location.href = "/";
    } catch { toast.error("Network error. Please try again."); setLoading(false); }
  }

  async function handle2faSubmit(e: FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) { setErrors({ otp: "Code must be 6 digits." }); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ challengeToken, otp }) });
      const data: LoginResponse = await res.json();
      if (!res.ok) { toast.error(data.error || "Verification failed."); setOtp(""); setLoading(false); return; }
      toast.success("Welcome back!");
      window.location.href = "/";
    } catch { toast.error("Network error. Please try again."); setLoading(false); }
  }

  function backToPassword() { setStep("password"); setOtp(""); setChallengeToken(""); setErrors({}); }

  // --- "Forgot password?" sub-screen delegates to its own component --------
  // The ForgotPasswordForm owns its own state (email, loading, submitted,
  // rate-limited). We just give it an onBackToLogin callback that returns
  // the user to the password step here.
  if (step === "forgot") {
    return <ForgotPasswordForm onBackToLogin={backToPassword} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <Image src="/coat-of-arms.png" alt="National Emblem of Papua New Guinea" width={60} height={49} className="mb-3 h-14 w-auto" />
          <h1 className="text-3xl font-bold tracking-tight">Register of Trade Unions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Office of The Industrial Registrar<br />PNG Department of Labour &amp; Industrial Relations</p>
        </div>
        {step === "password" ? (
          <Card><CardHeader><CardTitle className="text-xl">Sign in</CardTitle><CardDescription>Enter your credentials to access the registry.</CardDescription></CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus /><FieldError error={errors.email} /></div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => { setErrors({}); setStep("forgot"); }}
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                  <FieldError error={errors.password} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</> : "Sign in"}</Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card><CardHeader><CardTitle className="text-xl">Two-factor authentication</CardTitle><CardDescription>Enter the 6-digit code from your authenticator app.</CardDescription></CardHeader>
            <CardContent>
              <form onSubmit={handle2faSubmit} className="space-y-4">
                <div className="space-y-2"><Label>Verification code</Label><div className="flex justify-center"><InputOTP maxLength={6} value={otp} onChange={(v) => { setOtp(v); setErrors({}); }}><InputOTPGroup><InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} /><InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} /></InputOTPGroup></InputOTP></div><FieldError error={errors.otp} /></div>
                <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : "Verify"}</Button>
                <Button type="button" variant="ghost" className="w-full" onClick={backToPassword} disabled={loading}>Back to sign in</Button>
              </form>
            </CardContent>
          </Card>
        )}
        <div className="text-center"><Button variant="link" className="text-muted-foreground" onClick={onBackToPortal}><ArrowLeft className="mr-2 h-4 w-4" />Back to Public Portal</Button></div>
      </div>
    </div>
  );
}
