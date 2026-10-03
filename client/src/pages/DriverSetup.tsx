import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Link, useLocation } from "wouter";

function takeToken() {
  const fragment = window.location.hash;
  const token = fragment.startsWith("#token=") ? fragment.slice(7) : "";
  if (fragment) window.history.replaceState(window.history.state, "", window.location.pathname);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : "";
}

export default function DriverSetup() {
  const [token] = useState(takeToken);
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const setup = trpc.driverAuth.completeSetup.useMutation();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    try {
      await setup.mutateAsync({ token, password, confirmPassword });
      setPassword(""); setConfirmPassword("");
      setLocation("/driver/login?setup=complete");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to set password.");
    }
  }
  return <PageShell><section className="container flex min-h-[60vh] items-center justify-center py-14">
    <div className="ticket-card w-full max-w-md p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Private staff setup</p>
      <h1 className="mt-3 font-serif text-3xl">Set your driver password</h1>
      <p className="mt-4 text-sm text-muted-foreground">The administrator creates your account first and shares this single-use link privately. The link expires in 24 hours.</p>
      {!token ? <p role="alert" className="mt-5 rounded-lg border border-destructive/30 p-4 text-sm">Open the complete private setup link from your administrator, or request a new one.</p> : <form onSubmit={submit} className="mt-6 grid gap-4">
        <div className="form-field"><Label htmlFor="new-driver-password">New password</Label><Input id="new-driver-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} className="h-12 bg-white" /></div>
        <div className="form-field"><Label htmlFor="confirm-driver-password">Confirm password</Label><Input id="confirm-driver-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="h-12 bg-white" /></div>
        <p className="text-xs text-muted-foreground">Use a unique password of at least 12 characters; never share it with dispatch.</p>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button disabled={setup.isPending} className="min-h-12 w-full">{setup.isPending ? "Saving…" : "Set driver password"}</Button>
      </form>}
      <Link href="/driver/login" className="mt-5 block min-h-11 py-3 text-sm underline underline-offset-4">Return to driver sign in</Link>
    </div>
  </section></PageShell>;
}
