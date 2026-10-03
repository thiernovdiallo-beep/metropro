import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { ADMIN_LOGIN_INTENT_KEY, startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

export default function AdminLogin() {
  const { user, loading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user?.role === "admin") {
      sessionStorage.removeItem(ADMIN_LOGIN_INTENT_KEY);
      setLocation("/admin");
    }
  }, [loading, user?.role, setLocation]);

  async function continueToAdmin() {
    setError("");
    setWorking(true);
    try {
      // A member session must not override the authorized staff identity when
      // Preview forwards both an older OAuth cookie and a local member token.
      if (user && user.role !== "admin") await logout();
      sessionStorage.removeItem("metropro-member-onboarding");
      sessionStorage.setItem(ADMIN_LOGIN_INTENT_KEY, "1");
      startLogin();
    } catch (cause) {
      sessionStorage.removeItem(ADMIN_LOGIN_INTENT_KEY);
      setError(cause instanceof Error ? cause.message : "Could not start staff sign-in. Please try again.");
      setWorking(false);
    }
  }

  return (
    <PageShell>
      <section className="container flex min-h-[60vh] items-center justify-center py-14">
        <div className="ticket-card w-full max-w-md p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Staff access</p>
          <h1 className="mt-3 font-serif text-3xl">Admin sign in</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Use the account already authorized to manage Metro Pro operations. This sign-in does not create an admin account.
          </p>
          {user && user.role !== "admin" ? (
            <p className="mt-5 rounded-lg border border-border bg-secondary px-4 py-3 text-sm">
              This account does not have admin access. Continue to sign out here and choose your authorized staff account.
            </p>
          ) : null}
          {error ? <p role="alert" className="mt-5 text-sm text-destructive">{error}</p> : null}
          <Button
            type="button"
            className="mt-7 min-h-12 w-full"
            disabled={loading || working || user?.role === "admin"}
            onClick={continueToAdmin}
          >
            {working || user?.role === "admin" ? "Opening admin sign in…" : "Continue with authorized admin account"}
          </Button>
          <Link href="/" className="mt-5 inline-flex min-h-11 items-center text-sm text-muted-foreground underline hover:text-primary">
            Back to booking
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
