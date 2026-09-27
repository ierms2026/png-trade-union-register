"use client";

import { useState, type FormEvent } from "react";
import { Shield, QrCode, KeyRound, Loader2, Smartphone, Monitor, MapPin, Trash2, X, Bell, MessageSquare, Mail, Globe, Save } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { validateRequired } from "@/lib/validation";
import { FieldError } from "@/components/app/field-error";

// =============================================================================
// Account Security view — 2FA setup/verify/disable + active sessions.
//
// This is the user's self-service security page (vs. the admin Security
// view which is Registrar-only and shows all users).
// =============================================================================

interface AuthUser {
  id: string;
  email: string;
  role: string;
  twoFactorEnabled: boolean;
}

interface Session {
  id: string;
  jti: string;
  createdAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  isCurrent: boolean;
}

interface SetupResponse {
  secret: string;
  qrCodeDataUrl: string;
  otpauthUri: string;
}

export function AccountSecurityView({ user }: { user: AuthUser }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Account Security</h1>
        <p className="text-sm text-muted-foreground">
          Manage your two-factor authentication and active sessions.
        </p>
      </div>

      <TwoFactorSection user={user} />
      <NotificationPreferencesSection />
      <SessionsSection />
    </div>
  );
}

// -----------------------------------------------------------------------------
// 2FA section
// -----------------------------------------------------------------------------

function TwoFactorSection({ user }: { user: AuthUser }) {
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-5 w-5" />
          Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          Add an extra layer of security to your account using an authenticator app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between rounded-md border p-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${user.twoFactorEnabled ? "bg-green-100" : "bg-muted"}`}>
              {user.twoFactorEnabled ? <Shield className="h-5 w-5 text-chart-3" /> : <Shield className="h-5 w-5 text-muted-foreground" />}
            </div>
            <div>
              <p className="font-medium">
                {user.twoFactorEnabled ? "2FA is enabled" : "2FA is not enabled"}
              </p>
              <p className="text-sm text-muted-foreground">
                {user.twoFactorEnabled
                  ? "Your account is protected with an authenticator app."
                  : "Enable 2FA to protect your account with an authenticator app."}
              </p>
            </div>
          </div>
          {user.twoFactorEnabled ? (
            <Button variant="outline" onClick={() => setDisableDialogOpen(true)}>
              Disable 2FA
            </Button>
          ) : (
            <Button onClick={() => setSetupDialogOpen(true)}>
              <QrCode className="mr-2 h-4 w-4" />
              Set up 2FA
            </Button>
          )}
        </div>

        {setupDialogOpen && (
          <SetupDialog
            open={setupDialogOpen}
            onClose={() => setSetupDialogOpen(false)}
            onSuccess={() => {
              setSetupDialogOpen(false);
              // Reload to update the user's twoFactorEnabled flag
              window.location.reload();
            }}
          />
        )}

        {disableDialogOpen && (
          <DisableDialog
            open={disableDialogOpen}
            onClose={() => setDisableDialogOpen(false)}
            onSuccess={() => {
              setDisableDialogOpen(false);
              window.location.reload();
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SetupDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);

  async function loadSetup() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to generate 2FA setup.");
        return;
      }
      setSetupData(data);
    } catch {
      toast.error("Network error.");
    } finally {
      setLoading(false);
    }
  }

  // Load setup data when the dialog opens
  if (open && !setupData && !loading) {
    loadSetup();
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Enter the 6-digit code.");
      return;
    }
    if (!setupData) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ secret: setupData.secret, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Verification failed.");
        setOtp("");
        return;
      }
      toast.success("2FA enabled successfully!");
      onSuccess();
    } catch {
      toast.error("Network error.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Up Two-Factor Authentication</DialogTitle>
          <DialogDescription>
            Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.),
            then enter the 6-digit code it generates.
          </DialogDescription>
        </DialogHeader>

        {loading || !setupData ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* QR code */}
            <div className="flex justify-center">
              <img
                src={setupData.qrCodeDataUrl}
                alt="2FA QR Code"
                className="rounded border"
                width={200}
                height={200}
              />
            </div>

            {/* Manual entry fallback */}
            <div className="rounded-md bg-muted/30 p-3">
              <p className="mb-1 text-xs font-medium">Can't scan? Enter this code manually:</p>
              <code className="block break-all text-xs">{setupData.secret}</code>
            </div>

            {/* Verification */}
            <form onSubmit={handleVerify} className="space-y-3">
              <div className="space-y-2">
                <Label>Enter the 6-digit code from your app</Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={setOtp}
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
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={verifying}>Cancel</Button>
                <Button type="submit" disabled={verifying || otp.length !== 6}>
                  {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shield className="mr-2 h-4 w-4" />}
                  Verify &amp; Enable
                </Button>
              </DialogFooter>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DisableDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);

  async function handleDisable(e: FormEvent) {
    e.preventDefault();
    const err = validateRequired(password, "Password");
    setError(err);
    if (err) return;

    setDisabling(true);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to disable 2FA.");
        return;
      }
      toast.success("2FA disabled.");
      onSuccess();
    } catch {
      toast.error("Network error.");
    } finally {
      setDisabling(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
          <DialogDescription>
            Enter your password to confirm. This will remove the 2FA requirement from your account.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleDisable} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <FieldError error={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={disabling}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={disabling}>
              {disabling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shield className="mr-2 h-4 w-4" />}
              Disable 2FA
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Sessions section
// -----------------------------------------------------------------------------

function SessionsSection() {
  const { data, loading, error, refetch } = useFetch<{ sessions: Session[] }>("/api/auth/sessions");
  const [revoking, setRevoking] = useState<string | null>(null);

  async function revokeSession(jti: string) {
    if (!confirm("Revoke this session? The device will be signed out immediately.")) return;
    setRevoking(jti);
    try {
      const res = await fetch(`/api/auth/sessions/${jti}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to revoke session.");
        return;
      }
      toast.success("Session revoked.");
      refetch();
    } catch {
      toast.error("Network error.");
    } finally {
      setRevoking(null);
    }
  }

  function parseUserAgent(ua: string | null): { icon: typeof Monitor; label: string } {
    if (!ua) return { icon: Monitor, label: "Unknown device" };
    if (/mobile|android|iphone/i.test(ua)) return { icon: Smartphone, label: "Mobile device" };
    if (/windows/i.test(ua)) return { icon: Monitor, label: "Windows PC" };
    if (/mac/i.test(ua)) return { icon: Monitor, label: "Mac" };
    if (/linux/i.test(ua)) return { icon: Monitor, label: "Linux" };
    return { icon: Monitor, label: "Computer" };
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Monitor className="h-5 w-5" />
          Active Sessions
        </CardTitle>
        <CardDescription>Devices currently signed in to your account.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <CardListSkeleton count={2} />
        ) : error ? (
          <ErrorState description={error} onRetry={refetch} />
        ) : data && data.sessions.length > 0 ? (
          <div className="space-y-2">
            {data.sessions.map((s) => {
              const { icon: Icon, label } = parseUserAgent(s.userAgent);
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{label}</p>
                        {s.isCurrent && <Badge variant="default" className="text-xs">This device</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Signed in: {new Date(s.createdAt).toLocaleString()}
                      </p>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                        {s.ip && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {s.ip}
                          </span>
                        )}
                        <span>Expires: {new Date(s.expiresAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  {!s.isCurrent && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => revokeSession(s.jti)}
                      disabled={revoking === s.jti}
                      className="text-destructive"
                    >
                      {revoking === s.jti ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Trash2 className="mr-1 h-3 w-3" />}
                      Revoke
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active sessions.</p>
        )}
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Notification Preferences section (email / SMS / WhatsApp)
// -----------------------------------------------------------------------------

interface NotificationPrefs {
  emailNotificationsEnabled: boolean;
  phone: string | null;
  phoneVerifiedAt: string | null;
  smsNotificationsEnabled: boolean;
  whatsappNotificationsEnabled: boolean;
}

function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");

  // Load current preferences on mount
  useState(() => {
    fetch("/api/auth/me/preferences", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          setPrefs(data);
          setPhoneInput(data.phone || "");
        }
      })
      .catch(() => toast.error("Failed to load notification preferences."))
      .finally(() => setLoading(false));
  });

  async function updatePrefs(updates: Partial<NotificationPrefs>) {
    setSaving(true);
    try {
      const res = await fetch("/api/auth/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update preferences.");
        return;
      }
      setPrefs(data);
      toast.success("Notification preferences updated.");
    } catch {
      toast.error("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function savePhone() {
    await updatePrefs({ phone: phoneInput.trim() || null });
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 animate-pulse rounded-md bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Notification Preferences</CardTitle>
        <CardDescription>
          Choose how you want to receive compliance alerts, task assignments, and review notifications.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2"><Mail className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-sm font-medium">Email Notifications</p>
              <p className="text-xs text-muted-foreground">Receive notifications via email.</p>
            </div>
          </div>
          <Switch
            checked={prefs?.emailNotificationsEnabled ?? true}
            disabled={saving}
            onCheckedChange={(checked) => {
              updatePrefs({ emailNotificationsEnabled: checked });
              setPrefs(prev => prev ? { ...prev, emailNotificationsEnabled: checked } : prev);
            }}
          />
        </div>

        {/* Phone number input */}
        <div className="space-y-2 border-t pt-4">
          <Label htmlFor="phone">Mobile Phone Number</Label>
          <div className="flex gap-2">
            <Input
              id="phone"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="+675 1234 5678"
              className="flex-1"
            />
            <Button onClick={savePhone} disabled={saving} variant="outline" size="sm">
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter your number in international format (e.g. +675 1234 5678). Required for SMS and WhatsApp notifications.
            {prefs?.phone && prefs.phoneVerifiedAt && (
              <Badge variant="outline" className="ml-2 text-xs text-green-600">Verified</Badge>
            )}
          </p>
        </div>

        {/* SMS toggle */}
        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2"><MessageSquare className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-sm font-medium">SMS Notifications</p>
              <p className="text-xs text-muted-foreground">Receive short text alerts on your phone.</p>
            </div>
          </div>
          <Switch
            checked={prefs?.smsNotificationsEnabled ?? false}
            disabled={saving || !prefs?.phone}
            onCheckedChange={(checked) => {
              updatePrefs({ smsNotificationsEnabled: checked });
              setPrefs(prev => prev ? { ...prev, smsNotificationsEnabled: checked } : prev);
            }}
          />
        </div>

        {/* WhatsApp toggle */}
        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2"><Globe className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-sm font-medium">WhatsApp Notifications</p>
              <p className="text-xs text-muted-foreground">Receive messages via WhatsApp (cheaper than SMS).</p>
            </div>
          </div>
          <Switch
            checked={prefs?.whatsappNotificationsEnabled ?? false}
            disabled={saving || !prefs?.phone}
            onCheckedChange={(checked) => {
              updatePrefs({ whatsappNotificationsEnabled: checked });
              setPrefs(prev => prev ? { ...prev, whatsappNotificationsEnabled: checked } : prev);
            }}
          />
        </div>

        {!prefs?.phone && (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Enter your phone number above to enable SMS and WhatsApp notifications.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
