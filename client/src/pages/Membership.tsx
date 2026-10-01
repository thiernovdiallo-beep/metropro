import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { moneyExact } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function Membership() {
  const [, setLocation] = useLocation();
  const settings = trpc.public.settings.useQuery();
  const { isAuthenticated } = useAuth();
  const overview = trpc.account.overview.useQuery(undefined, { enabled: isAuthenticated });
  const profile = trpc.account.memberProfile.useQuery(undefined, { enabled: isAuthenticated });
  const start = trpc.account.startMembershipCheckout.useMutation();
  const [agreed, setAgreed] = useState(false);
  const monthlyPrice = moneyExact(settings.data?.membershipPriceCents ?? 2500);
  const active = overview.data?.membership?.status === "active";

  async function continueToMembership() {
    if (!isAuthenticated) { setLocation("/create-account"); return; }
    if (!profile.data?.complete) { setLocation("/account/settings"); return; }
    if (!agreed) { toast.error("Confirm that you understand this is an automatic monthly subscription."); return; }
    try {
      const result = await start.mutateAsync({ origin: window.location.origin });
      if (result.checkoutUrl) {
        toast.message("Opening Stripe subscription checkout in a new tab.");
        if (!window.open(result.checkoutUrl, "_blank")) window.location.assign(result.checkoutUrl);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start membership checkout");
    }
  }

  return (
    <PageShell>
      <div className="container max-w-2xl py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Metro Pro Member</p>
        <h1 className="mt-3 font-serif text-4xl">A better fare, not unlimited travel.</h1>
        <p className="mt-4 text-muted-foreground">
          {monthlyPrice} per month. Your own regular passenger seat drops from $150 to $100
          for each one-way trip. Companions pay regular fares, and the front passenger seat
          remains $200 for everyone. Priority booking and one free eligible reschedule are included.
        </p>
        <ul className="mt-6 space-y-2 text-sm">
          {(settings.data?.membershipBenefits ?? []).map(benefit => <li key={benefit}>· {benefit}</li>)}
        </ul>
        <div className="mt-6 rounded-xl border border-primary/25 bg-secondary p-4 text-sm leading-relaxed">
          <strong>Automatic monthly subscription.</strong> Once you enroll through Stripe,
          your payment method is charged {monthlyPrice} now and automatically every month
          until you cancel. Manage or cancel billing through your Metro Pro account and Stripe.
          Creating a member account alone does not start billing.
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          To join, create an account with your full name, email, phone number and private ID photo.
          Guests can <a href="/#trip-search" className="font-semibold text-primary underline">book a regular ticket without signing in</a>.
        </p>
        {isAuthenticated && !profile.data?.complete && !profile.isLoading ? (
          <p className="mt-4 text-sm font-medium text-primary">Your member profile still needs required information and an ID photo.</p>
        ) : null}
        {isAuthenticated && profile.data?.complete && !active ? (
          <label className="mt-7 flex items-start gap-3 rounded-xl border border-border bg-white p-4 text-sm leading-relaxed">
            <input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
            <span>I understand that joining authorizes an automatic {monthlyPrice} charge every month until I cancel.</span>
          </label>
        ) : null}
        {active ? (
          <Link href="/account/membership"><Button className="mt-8 h-12">Manage my membership</Button></Link>
        ) : (
          <Button className="mt-8 min-h-12" disabled={start.isPending || (isAuthenticated && profile.data?.complete && !agreed)} onClick={continueToMembership}>
            {!isAuthenticated ? "Create a member account" : profile.data?.complete ? `Subscribe for ${monthlyPrice}/month` : "Complete member profile"}
          </Button>
        )}
      </div>
    </PageShell>
  );
}
