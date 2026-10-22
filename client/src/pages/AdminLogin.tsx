import { AdminAuthLayout } from "@/layouts/AdminLayout";
import { PageIntro, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_LOGIN_INTENT_KEY, startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

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
      sessionStorage.removeItem("metropro-driver-session");
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

  async function continueWithOrganizationSignIn() {
    setError("");
    setOauthWorking(true);
    try {
      if (user && user.role !== "admin") await logout();
      // An old password bearer takes priority over a fresh OAuth cookie. Clear
      // it even when auth.me is null after a customer's role was upgraded.
      sessionStorage.removeItem("metropro-admin-session");
      sessionStorage.removeItem("metropro-driver-session");
      sessionStorage.removeItem("metropro-member-session");
      sessionStorage.removeItem("manus-cookie");
      sessionStorage.removeItem("metropro-member-onboarding");
      sessionStorage.setItem(ADMIN_LOGIN_INTENT_KEY, "1");
      startLogin();
    } catch (cause) {
      sessionStorage.removeItem(ADMIN_LOGIN_INTENT_KEY);
      setError(cause instanceof Error ? cause.message : "Could not start organization sign-in.");
      setOauthWorking(false);
    }
  }

  return (
    <AdminAuthLayout>
      <section className="metro-page metro-page--readable flex min-h-[60vh] items-center">
        <div className="mx-auto w-full max-w-lg">
          <PageIntro eyebrow="Staff access" title="Admin sign in" description="Sign in to an authorized administrator account. This form cannot create or grant administrator access." />
          <div className="ticket-card p-5 sm:p-7">
          {user && user.role !== "admin" ? (
            <StatusNotice>
              Your current account does not have admin access. Enter the administrator account credentials to switch accounts.
            </StatusNotice>
          ) : null}
          {window.location.search.includes("setup=complete") ? (
            <StatusNotice tone="success" className={user && user.role !== "admin" ? "mt-4" : undefined}>
              Admin password saved. You can sign in now.
            </StatusNotice>
          ) : null}
          <form className="mt-5 grid gap-4" onSubmit={submitPassword}>
            <div className="form-field">
              <Label className="metro-form-label" htmlFor="admin-email">Admin email</Label>
              <Input id="admin-email" type="email" autoComplete="username" required value={email}
                onChange={event => setEmail(event.target.value)} className="metro-control" />
            </div>
            <div className="form-field">
              <Label className="metro-form-label" htmlFor="admin-password">Password</Label>
              <Input id="admin-password" type="password" autoComplete="current-password" required value={password}
                onChange={event => setPassword(event.target.value)} className="metro-control" />
            </div>
            {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
            <Button type="submit" className="min-h-12 w-full" disabled={loading || signIn.isPending}>
              {signIn.isPending ? "Signing in…" : "Sign in to operations"}
            </Button>
          </form>
          {!isPreview ? (
            <button type="button" disabled={oauthWorking} onClick={continueWithOrganizationSignIn}
              className="mt-5 inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4 hover:text-primary">
              {oauthWorking ? "Opening organization sign-in…" : "Use organization sign-in instead"}
            </button>
          ) : null}
                    </div>
        </div>
      </section>
    </AdminAuthLayout>
  );
}
