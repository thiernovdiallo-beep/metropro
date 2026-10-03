import { useAuth } from "@/_core/hooks/useAuth";
import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

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
  return <PageShell><section className="container flex min-h-[60vh] items-center justify-center py-14">
    <div className="ticket-card w-full max-w-md p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Assigned crew</p>
      <h1 className="mt-3 font-serif text-3xl">Driver sign in</h1>
      <p className="mt-3 text-sm text-muted-foreground">Only drivers invited by Metro Pro operations can access trip manifests and scan passenger tickets.</p>
      {user && user.role !== "driver" && user.role !== "admin" ? <p className="mt-4 rounded-lg bg-secondary p-3 text-sm">This account has no driver access. Sign in with the driver account your administrator created.</p> : null}
      {window.location.search.includes("setup=complete") ? <p role="status" className="mt-4 rounded-lg bg-secondary p-3 text-sm">Password saved. Sign in to view your assignments.</p> : null}
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <div className="form-field"><Label htmlFor="driver-email">Driver email</Label><Input id="driver-email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} className="h-12 bg-white" /></div>
        <div className="form-field"><Label htmlFor="driver-password">Password</Label><Input id="driver-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="h-12 bg-white" /></div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button className="min-h-12 w-full" disabled={signIn.isPending || loading}>{signIn.isPending ? "Signing in…" : "Open driver portal"}</Button>
      </form>
      <p className="mt-5 text-xs text-muted-foreground">Need an account or a new setup link? Ask your administrator.</p>
      <Link href="/" className="mt-3 block min-h-11 py-3 text-sm underline underline-offset-4">Back to booking</Link>
    </div>
  </section></PageShell>;
}
