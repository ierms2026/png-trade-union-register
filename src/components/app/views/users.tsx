"use client";

import { useState, type FormEvent } from "react";
import { Users, Plus, Shield, KeyRound, Loader2, UserCog, Copy, Check, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";
import { validateEmail, isValid } from "@/lib/validation";
import { FieldError } from "@/components/app/field-error";

// =============================================================================
// Users view — user list with create/disable/reset-2fa.
//
// REGISTRAR-only (enforced server-side; this component is only rendered
// for REGISTRAR users via the nav filter).
// =============================================================================

interface User {
  id: string;
  email: string;
  role: string;
  assignedUnionId: string | null;
  twoFactorEnabled: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  disabled: boolean;
}

export function UsersView() {
  const { data, loading, error, refetch } = useFetch<{ users: User[] }>("/api/users");
  const [createOpen, setCreateOpen] = useState(false);

  if (loading) return <CardListSkeleton count={4} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            {data.users.length} user{data.users.length !== 1 ? "s" : ""}.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New User
        </Button>
      </div>

      {data.users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users"
          description="Create users to grant access to the registry."
          action={{ label: "Create user", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {data.users.map((u) => (
                <UserRow key={u.id} user={u} onUpdated={refetch} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {createOpen && (
        <CreateUserDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            refetch();
            setCreateOpen(false);
          }}
        />
      )}
    </div>
  );
}

function UserRow({ user, onUpdated }: { user: User; onUpdated: () => void }) {
  const [updating, setUpdating] = useState(false);
  const [resetPwOpen, setResetPwOpen] = useState(false);

  async function toggleDisabled() {
    const action = user.disabled ? "enable" : "disable";
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ disabled: !user.disabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || `Failed to ${action} user.`);
        return;
      }
      toast.success(`User ${action}d.`);
      onUpdated();
    } catch {
      toast.error("Network error.");
    } finally {
      setUpdating(false);
    }
  }

  async function reset2fa() {
    if (!confirm("Reset this user's 2FA? They will need to re-enroll on next login.")) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/users/${user.id}/reset-2fa`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to reset 2FA.");
        return;
      }
      toast.success("2FA reset.");
      onUpdated();
    } catch {
      toast.error("Network error.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {user.email.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{user.email}</p>
            <Badge variant="outline" className="text-xs">{user.role}</Badge>
            {user.disabled && <Badge variant="destructive" className="text-xs">Disabled</Badge>}
            {user.twoFactorEnabled && (
              <Badge variant="secondary" className="text-xs">
                <KeyRound className="mr-1 h-3 w-3" />
                2FA
              </Badge>
            )}
            {user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now() && (
              <Badge variant="destructive" className="text-xs">Locked</Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {user.failedLoginAttempts > 0 && `${user.failedLoginAttempts} failed attempts`}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setResetPwOpen(true)}
          disabled={updating}
          title="Reset password"
        >
          <KeyRound className="mr-1 h-3 w-3" />
          Reset Password
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={reset2fa}
          disabled={updating || !user.twoFactorEnabled}
          title={!user.twoFactorEnabled ? "2FA not enabled" : "Reset 2FA"}
        >
          <Shield className="mr-1 h-3 w-3" />
          Reset 2FA
        </Button>
        <Button
          size="sm"
          variant={user.disabled ? "default" : "outline"}
          onClick={toggleDisabled}
          disabled={updating}
        >
          {updating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <UserCog className="mr-1 h-3 w-3" />}
          {user.disabled ? "Enable" : "Disable"}
        </Button>
      </div>

      {resetPwOpen && (
        <ResetPasswordDialog
          user={user}
          open={resetPwOpen}
          onClose={() => setResetPwOpen(false)}
          onReset={onUpdated}
        />
      )}
    </div>
  );
}

function CreateUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("OFFICER");
  const [unionId, setUnionId] = useState("none");
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [creating, setCreating] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const { data: unionsData } = useFetch<{ unions: Array<{ id: string; unionName: string }> }>("/api/unions");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const newErrors = { email: validateEmail(email) };
    setErrors(newErrors);
    if (!isValid(newErrors)) return;
    if (role === "OFFICER" && unionId === "none") {
      setErrors({ ...newErrors, unionId: "Officer must be assigned to a union." });
      return;
    }

    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        email: email.trim().toLowerCase(),
        role,
      };
      if (role === "OFFICER" && unionId !== "none") {
        body.assignedUnionId = unionId;
      }
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create user.");
        return;
      }
      toast.success("User created. Share the reset token with the user.");
      setResetToken(data.passwordResetToken);
      onCreated();
      // Reset form but keep the dialog open to show the token
      setEmail("");
      setRole("OFFICER");
      setUnionId("none");
      setErrors({});
    } catch {
      toast.error("Network error.");
    } finally {
      setCreating(false);
    }
  }

  function handleClose() {
    setResetToken(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{resetToken ? "User Created" : "Create User"}</DialogTitle>
          <DialogDescription>
            {resetToken
              ? "Share this one-time password reset token with the user. They'll use it to set their password."
              : "Create a new user. A password reset token will be generated."}
          </DialogDescription>
        </DialogHeader>

        {resetToken ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-1 text-xs font-medium">Password Reset Token (one-time):</p>
              <code className="block break-all text-xs">{resetToken}</code>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
              <FieldError error={errors.email} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="REGISTRAR">Registrar</SelectItem>
                  <SelectItem value="INSPECTOR">Inspector</SelectItem>
                  <SelectItem value="OFFICER">Officer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role === "OFFICER" && (
              <div className="space-y-2">
                <Label>Assigned Union</Label>
                <Select value={unionId} onValueChange={setUnionId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a union...</SelectItem>
                    {unionsData?.unions.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.unionName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError error={errors.unionId} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={creating}>Cancel</Button>
              <Button type="submit" disabled={creating}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// ResetPasswordDialog — admin-initiated password reset.
//
// Two-state dialog (same pattern as CreateUserDialog):
//   1. Confirm state: shows the user's email + a warning that the current
//      password is invalidated IMMEDIATELY. Admin clicks "Reset Password"
//      to proceed.
//   2. Token-display state: shows the one-time reset token + a ready-to-
//      share URL (`/?token=xxx`). Includes copy-to-clipboard buttons.
//
// The API call (POST /api/users/[id]/reset-password) happens when the
// admin clicks "Reset Password" in the confirm state. On success, the
// dialog switches to the token-display state.
//
// SECURITY NOTE:
//   The token is shown ONE TIME. If the admin closes the dialog before
//   sharing it, they'll need to reset the password again to get a new
//   token. There is no way to retrieve the token after closing — by
//   design (it's a one-time secret).
// =============================================================================

interface ResetPasswordDialogProps {
  user: User;
  open: boolean;
  onClose: () => void;
  onReset: () => void; // refetch the user list
}

function ResetPasswordDialog({ user, open, onClose, onReset }: ResetPasswordDialogProps) {
  const [resetting, setResetting] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [setPasswordUrl, setSetPasswordUrl] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  async function handleReset() {
    setResetting(true);
    try {
      const res = await fetch(`/api/users/${user.id}/reset-password`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to reset password.");
        return;
      }
      toast.success("Password reset. Share the token with the user.");
      setToken(data.passwordResetToken);
      setSetPasswordUrl(data.setPasswordUrl);
      // NOTE: we do NOT call onReset() here. The parent's refetch would
      // set loading=true, which causes UsersView to render <CardListSkeleton>
      // — unmounting this dialog mid-token-display. Instead, we call
      // onReset() in handleClose(), after the admin clicks "Done" and the
      // dialog is safely closed.
    } catch {
      toast.error("Network error.");
    } finally {
      setResetting(false);
    }
  }

  function handleClose() {
    // Reset all state when closing — if they reopen, they start fresh.
    const wasReset = token !== null;
    setToken(null);
    setSetPasswordUrl(null);
    setCopiedToken(false);
    setCopiedUrl(false);
    onClose();
    // If a password was actually reset, refetch the user list now —
    // after the dialog is closed, so the loading state doesn't unmount
    // anything the user is looking at.
    if (wasReset) onReset();
  }

  async function copyToClipboard(text: string, which: "token" | "url") {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "token") {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      } else {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      }
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Failed to copy. Select the text and copy manually.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {token ? "Password Reset" : "Reset Password?"}
          </DialogTitle>
          <DialogDescription>
            {token
              ? "Share this one-time token with the user. They'll use it to set a new password."
              : `This will invalidate ${user.email}'s current password immediately. They won't be able to log in until they set a new one.`}
          </DialogDescription>
        </DialogHeader>

        {token ? (
          // --- Token display state ---
          <div className="space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/50">
              <div className="flex items-start gap-2">
                <MailWarning className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="text-xs text-amber-800 dark:text-amber-200">
                  <p className="font-medium">This token is shown once.</p>
                  <p className="mt-0.5">
                    If you close this dialog, you won't be able to retrieve it.
                    Copy it now and share it with the user out-of-band (email,
                    in-person, etc.).
                  </p>
                </div>
              </div>
            </div>

            {/* Token */}
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-medium">Reset Token</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => copyToClipboard(token, "token")}
                >
                  {copiedToken ? (
                    <><Check className="mr-1 h-3 w-3" /> Copied</>
                  ) : (
                    <><Copy className="mr-1 h-3 w-3" /> Copy</>
                  )}
                </Button>
              </div>
              <code className="block break-all text-xs">{token}</code>
            </div>

            {/* Set-password URL */}
            {setPasswordUrl && (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-medium">Set-Password Link</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => copyToClipboard(setPasswordUrl, "url")}
                  >
                    {copiedUrl ? (
                      <><Check className="mr-1 h-3 w-3" /> Copied</>
                    ) : (
                      <><Copy className="mr-1 h-3 w-3" /> Copy</>
                    )}
                  </Button>
                </div>
                <code className="block break-all text-xs">{setPasswordUrl}</code>
              </div>
            )}

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          // --- Confirm state ---
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {user.email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.role}
                    {user.twoFactorEnabled && " · 2FA enabled"}
                    {user.disabled && " · disabled"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/50">
              <div className="flex items-start gap-2">
                <MailWarning className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="text-xs text-amber-800 dark:text-amber-200">
                  <p className="font-medium">This action takes effect immediately.</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    <li>The user's current password stops working right now.</li>
                    <li>Existing sessions are NOT automatically revoked.</li>
                    <li>The user sets a new password via the link you'll receive.</li>
                  </ul>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={resetting}>
                Cancel
              </Button>
              <Button onClick={handleReset} disabled={resetting}>
                {resetting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resetting...</>
                ) : (
                  <><KeyRound className="mr-2 h-4 w-4" /> Reset Password</>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
