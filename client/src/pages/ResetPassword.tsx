import { PageIntro, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerLayout } from "@/layouts/CustomerLayout";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

function readToken() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") ?? "";
}

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [completed, setCompleted] = useState(false);
  const [localError, setLocalError] = useState("");
  useEffect(() => setToken(readToken()), []);
  const verify = trpc.memberAuth.verifyToken.useQuery({ token }, { enabled: token.length > 0, retry: false });
  const reset = trpc.memberAuth.resetPassword.useMutation({ onSuccess: () => { setCompleted(true); window.history.replaceState(null, "", "/reset-password"); setTimeout(() => setLocation("/#member-sign-in"), 1200); } });
  const valid = Boolean(token) && verify.data?.valid === true;
  const requirements = [password.length >= 12, password.length <= 128, confirm === password && password.length > 0];
  function submit(event: React.FormEvent) {
    event.preventDefault();
    setLocalError("");
    if (!valid) return setLocalError("This reset link is invalid or expired.");
    if (password.length < 12 || password.length > 128) return setLocalError("Use a password of 12 to 128 characters.");
    if (password !== confirm) return setLocalError("Passwords do not match.");
    reset.mutate({ token, newPassword: password });
  }
  return <CustomerLayout><main className="metro-page metro-page--readable">
    <PageIntro eyebrow="Account access" title="Set a new password" description="Choose a unique password of at least 12 characters. Your previous password sessions will be signed out." />
    {completed ? <StatusNotice tone="success">Your password has been reset. Redirecting you to member sign in…</StatusNotice> : !token ? <StatusNotice tone="error">This reset link is missing its token. Request a new one.</StatusNotice> : verify.isLoading ? <StatusNotice>Checking reset link…</StatusNotice> : !valid ? <StatusNotice tone="error">This password reset link is invalid, expired, or has already been used.</StatusNotice> : <form className="ticket-card grid max-w-xl gap-4 p-5 sm:p-7" onSubmit={submit}>
      <div className="form-field"><Label className="metro-form-label" htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} className="metro-control" value={password} onChange={event => setPassword(event.target.value)} required /></div>
      <div className="form-field"><Label className="metro-form-label" htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} className="metro-control" value={confirm} onChange={event => setConfirm(event.target.value)} required /></div>
      <ul className="grid gap-1 text-xs text-muted-foreground" aria-label="Password requirements"><li className={requirements[0] ? "text-emerald-700" : ""}>{requirements[0] ? "✓" : "○"} At least 12 characters</li><li className={requirements[1] ? "text-emerald-700" : ""}>{requirements[1] ? "✓" : "○"} No more than 128 characters</li><li className={requirements[2] ? "text-emerald-700" : ""}>{requirements[2] ? "✓" : "○"} Passwords match</li></ul>
      {localError || reset.error ? <StatusNotice tone="error">{localError || reset.error?.message}</StatusNotice> : null}
      <Button type="submit" className="min-h-12" disabled={reset.isPending}>{reset.isPending ? "Saving…" : "Save new password"}</Button>
    </form>}
    <Link href="/#member-sign-in" className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary underline">Return to member sign in</Link>
  </main></CustomerLayout>;
}
