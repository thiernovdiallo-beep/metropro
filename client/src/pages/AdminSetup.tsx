import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Link, useLocation } from "wouter";

function takeSetupToken() {
  const fragment = window.location.hash;
  const token = fragment.startsWith("#token=") ? fragment.slice("#token=".length) : "";
  if (fragment) window.history.replaceState(window.history.state, "", window.location.pathname);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : "";
}

export default function AdminSetup() {
  const [token] = useState(takeSetupToken);
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const setup = trpc.adminAuth.completeSetup.useMutation();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      await setup.mutateAsync({ token, password, confirmPassword });
      setPassword("");
      setConfirmPassword("");
      setLocation("/admin/login?setup=complete");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this password.");
    }
  }

  return (
    <PageShell>
      <section className="container flex min-h-[60vh] items-center justify-center py-14">
        <div className="ticket-card w-full max-w-md p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Private staff setup</p>
          <h1 className="mt-3 font-serif text-3xl">Set your admin password</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            This one-time invitation adds password access to the existing administrator account. It does not create another administrator.
          </p>
          {!token ? (
            <p role="alert" className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              Open the complete private link from the Manus project-owner notification. It expires after 24 hours and works only once.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-6 grid gap-4">
              <div className="form-field">
                <Label htmlFor="new-admin-password">New password</Label>
                <Input id="new-admin-password" type="password" autoComplete="new-password" minLength={12} maxLength={128}
                  className="h-12 bg-white" required value={password} onChange={event => setPassword(event.target.value)} />
              </div>
              <div className="form-field">
                <Label htmlFor="confirm-admin-password">Confirm password</Label>
                <Input id="confirm-admin-password" type="password" autoComplete="new-password" minLength={12} maxLength={128}
                  className="h-12 bg-white" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Use a unique passphrase of at least 12 characters. Do not share it in messages or reuse your member password.
              </p>
              {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="min-h-12 w-full" disabled={setup.isPending}>
                {setup.isPending ? "Saving password…" : "Set admin password"}
              </Button>
            </form>
          )}
          <Link href="/admin/login" className="mt-5 block min-h-11 py-3 text-sm text-muted-foreground underline hover:text-primary">
            Return to admin sign in
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
