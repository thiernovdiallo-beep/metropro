import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_LOGIN_INTENT_KEY, startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

export default function AdminLogin() {
  const { user, loading, logout } = useAuth();
  const utils = trpc.useUtils();
  const signIn = trpc.adminAuth.signIn.useMutation();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [oauthWorking, setOauthWorking] = useState(false);
  const isPreview = typeof window !== "undefined" && window.location.hostname.endsWith(".manus.computer");

  useEffect(() => {
    if (!loading && user?.role === "admin") {
      sessionStorage.removeItem(ADMIN_LOGIN_INTENT_KEY);
      setLocation("/admin");
    }
  }, [loading, user?.role, setLocation]);

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await signIn.mutateAsync({ email, password });
      sessionStorage.setItem("metropro-admin-session", result.sessionToken);
      sessionStorage.removeItem("metropro-member-session");
      sessionStorage.removeItem("manus-cookie");
      sessionStorage.removeItem(ADMIN_LOGIN_INTENT_KEY);
      setPassword("");
      await utils.auth.me.invalidate();
      setLocation("/admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in. Please try again.");
    }
  }

  async function continueWithManus() {
    setError("");
    setOauthWorking(true);
    try {
      if (user && user.role !== "admin") await logout();
      sessionStorage.removeItem("metropro-member-onboarding");
      sessionStorage.setItem(ADMIN_LOGIN_INTENT_KEY, "1");
      startLogin();
    } catch (cause) {
      sessionStorage.removeItem(ADMIN_LOGIN_INTENT_KEY);
      setError(cause instanceof Error ? cause.message : "Could not start Manus sign-in.");
      setOauthWorking(false);
    }
  }

  return (
    <PageShell>
      <section className="container flex min-h-[60vh] items-center justify-center py-14">
        <div className="ticket-card w-full max-w-md p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Staff access</p>
          <h1 className="mt-3 font-serif text-3xl">Admin sign in</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Sign in to the existing authorized administrator account. This form cannot create or grant administrator access.
          </p>
          {user && user.role !== "admin" ? (
            <p className="mt-5 rounded-lg border border-border bg-secondary px-4 py-3 text-sm">
              Your current account does not have admin access. Enter the administrator account credentials to switch accounts.
            </p>
          ) : null}
          {window.location.search.includes("setup=complete") ? (
            <p role="status" className="mt-5 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
              Admin password saved. You can sign in now.
            </p>
          ) : null}
          <form className="mt-6 grid gap-4" onSubmit={submitPassword}>
            <div className="form-field">
              <Label htmlFor="admin-email">Admin email</Label>
              <Input id="admin-email" type="email" autoComplete="username" required value={email}
                onChange={event => setEmail(event.target.value)} className="h-12 bg-white" />
            </div>
            <div className="form-field">
              <Label htmlFor="admin-password">Password</Label>
              <Input id="admin-password" type="password" autoComplete="current-password" required value={password}
                onChange={event => setPassword(event.target.value)} className="h-12 bg-white" />
            </div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="min-h-12 w-full" disabled={loading || signIn.isPending}>
              {signIn.isPending ? "Signing in…" : "Sign in to operations"}
            </Button>
          </form>
          {!isPreview ? (
            <button type="button" disabled={oauthWorking} onClick={continueWithManus}
              className="mt-5 min-h-11 text-sm text-muted-foreground underline underline-offset-4 hover:text-primary">
              {oauthWorking ? "Opening Manus sign-in…" : "Use an existing Manus admin session instead"}
            </button>
          ) : null}
          <Link href="/" className="mt-5 block min-h-11 py-3 text-sm text-muted-foreground underline hover:text-primary">
            Back to booking
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
