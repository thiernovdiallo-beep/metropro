import { PageIntro, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerLayout } from "@/layouts/CustomerLayout";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { useState } from "react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const request = trpc.memberAuth.requestReset.useMutation({ onSuccess: () => setSent(true) });
  return <CustomerLayout><main className="metro-page metro-page--readable">
    <PageIntro eyebrow="Account access" title="Forgot your password?" description="Enter your email and we’ll send password reset instructions if a Metro Pro member account exists for it." />
    {sent ? <StatusNotice tone="success">If an account exists for that email, reset instructions have been sent. Check your inbox and use the link within 24 hours.</StatusNotice> : <form className="ticket-card grid max-w-xl gap-4 p-5 sm:p-7" onSubmit={event => { event.preventDefault(); request.mutate({ email }); }}>
      <div className="form-field"><Label className="metro-form-label" htmlFor="reset-email">Email</Label><Input id="reset-email" type="email" autoComplete="email" className="metro-control" value={email} onChange={event => setEmail(event.target.value)} required /></div>
      {request.error ? <StatusNotice tone="error">{request.error.message}</StatusNotice> : null}
      <Button type="submit" className="min-h-12" disabled={request.isPending}>{request.isPending ? "Sending…" : "Send reset instructions"}</Button>
    </form>}
    <Link href="/#member-sign-in" className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary underline">Return to member sign in</Link>
  </main></CustomerLayout>;
}
