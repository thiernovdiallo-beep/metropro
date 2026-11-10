import { AdminAuthLayout } from "@/layouts/AdminLayout";
import { ActionLink, PageIntro, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";

function takeSetupToken() {
  const fragment = window.location.hash;
  const token = fragment.startsWith("#token=") ? fragment.slice("#token=".length) : "";
  if (fragment) window.history.replaceState(window.history.state, "", window.location.pathname);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : "";
}

export default function AdminSetup() {
  const [token] = useState(takeSetupToken);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
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
      sessionStorage.removeItem("metropro-admin-session");
      await utils.auth.me.invalidate();
      setLocation("/admin/login?setup=complete");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this password.");
    }
  }

  return (
    <AdminAuthLayout>
      <section className="metro-page metro-page--readable flex min-h-[60vh] items-center">
        <div className="mx-auto w-full max-w-lg">
          <PageIntro eyebrow="Private staff access" title="Set a new admin password" description="This one-time private link sets or resets a password for the invited administrator. A reset ends that administrator's previous password sessions; other administrators and Google/Apple sign-in are unchanged." />
          <div className="ticket-card p-5 sm:p-7">
          {!token ? (
            <StatusNotice tone="error">
              Open the complete private link from the project-owner notification. It expires after 24 hours and works only once.
            </StatusNotice>
          ) : (
            <form onSubmit={submit} className="grid gap-4">
              <div className="form-field">
                <Label className="metro-form-label" htmlFor="new-admin-password">New password</Label>
                <Input id="new-admin-password" type="password" autoComplete="new-password" minLength={12} maxLength={128}
                  className="metro-control" required value={password} onChange={event => setPassword(event.target.value)} />
              </div>
              <div className="form-field">
                <Label className="metro-form-label" htmlFor="confirm-admin-password">Confirm password</Label>
                <Input id="confirm-admin-password" type="password" autoComplete="new-password" minLength={12} maxLength={128}
                  className="metro-control" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Use a unique passphrase of at least 12 characters. Do not share it in messages or reuse your member password.
              </p>
              {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
              <Button type="submit" className="min-h-12 w-full" disabled={setup.isPending}>
                {setup.isPending ? "Saving password…" : "Save new admin password"}
              </Button>
            </form>
          )}
          <ActionLink href="/admin/login" className="mt-5">Return to admin sign in</ActionLink>
          </div>
        </div>
      </section>
    </AdminAuthLayout>
  );
}
