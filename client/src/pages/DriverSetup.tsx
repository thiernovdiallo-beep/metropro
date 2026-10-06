import { PageShell } from "@/components/Brand";
import { ActionLink, PageIntro, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";

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
  return <PageShell><section className="metro-page metro-page--readable flex min-h-[60vh] items-center">
    <div className="mx-auto w-full max-w-lg"><PageIntro eyebrow="Private staff setup" title="Set your driver password" description="The administrator creates your account first and shares this single-use link privately. The link expires in 24 hours." />
      <div className="ticket-card p-5 sm:p-7">
      {!token ? <StatusNotice tone="error">Open the complete private setup link from your administrator, or request a new one.</StatusNotice> : <form onSubmit={submit} className="grid gap-4">
        <div className="form-field"><Label className="metro-form-label" htmlFor="new-driver-password">New password</Label><Input id="new-driver-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} className="metro-control" /></div>
        <div className="form-field"><Label className="metro-form-label" htmlFor="confirm-driver-password">Confirm password</Label><Input id="confirm-driver-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="metro-control" /></div>
        <p className="text-xs leading-relaxed text-muted-foreground">Use a unique password of at least 12 characters; never share it with dispatch.</p>
        {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
        <Button disabled={setup.isPending} className="min-h-12 w-full">{setup.isPending ? "Saving…" : "Set driver password"}</Button>
      </form>}
      <ActionLink href="/driver/login" className="mt-5">Return to driver sign in</ActionLink>
      </div>
    </div>
  </section></PageShell>;
}
