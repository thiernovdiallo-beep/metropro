import { useAuth } from "@/_core/hooks/useAuth";
import { DriverAuthLayout } from "@/layouts/DriverLayout";
import { PageIntro, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function DriverLogin() {
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const signIn = trpc.driverAuth.signIn.useMutation();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!loading && (user?.role === "driver" || user?.role === "admin")) setLocation("/driver");
  }, [loading, user?.role, setLocation]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await signIn.mutateAsync({ email, password });
      sessionStorage.setItem("metropro-driver-session", result.sessionToken);
      sessionStorage.removeItem("metropro-admin-session");
      sessionStorage.removeItem("metropro-member-session");
      sessionStorage.removeItem("manus-cookie");
      setPassword("");
      await utils.auth.me.invalidate();
      setLocation("/driver");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    }
  }
  return <DriverAuthLayout><section className="metro-page metro-page--readable flex min-h-[60vh] items-center">
    <div className="mx-auto w-full max-w-lg"><PageIntro eyebrow="Assigned crew" title="Driver sign in" description="Only drivers invited by Metro Pro operations can access trip manifests and scan passenger tickets." />
      <div className="ticket-card p-5 sm:p-7">
      {user && user.role !== "driver" && user.role !== "admin" ? <StatusNotice>This account has no driver access. Sign in with the driver account your administrator created.</StatusNotice> : null}
      {window.location.search.includes("setup=complete") ? <StatusNotice tone="success" className={user && user.role !== "driver" && user.role !== "admin" ? "mt-4" : undefined}>Password saved. Sign in to view your assignments.</StatusNotice> : null}
      <form onSubmit={submit} className="mt-5 grid gap-4">
        <div className="form-field"><Label className="metro-form-label" htmlFor="driver-email">Driver email</Label><Input id="driver-email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} className="metro-control" /></div>
        <div className="form-field"><Label className="metro-form-label" htmlFor="driver-password">Password</Label><Input id="driver-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="metro-control" /></div>
        {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
        <Button className="min-h-12 w-full" disabled={signIn.isPending || loading}>{signIn.isPending ? "Signing in…" : "Open driver portal"}</Button>
      </form>
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">Need an account or a new setup link? Ask your administrator.</p>
            </div>
    </div>
  </section></DriverAuthLayout>;
}
