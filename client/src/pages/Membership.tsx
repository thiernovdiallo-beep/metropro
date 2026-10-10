import { CustomerLayout } from "@/layouts/CustomerLayout";
import { ActionLink, PageIntro, StatusBadge, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { moneyExact } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

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
    <CustomerLayout>
      <div className="metro-page metro-page--readable">
        <PageIntro
          eyebrow="Metro Pro Member"
          title="A better fare, not unlimited travel."
          description={`${monthlyPrice} per month. Your own regular passenger seat drops from $150 to $100 for each one-way trip. Companions pay regular fares, and the front passenger seat remains $200 for everyone. Priority booking and one free eligible reschedule are included.`}
          actions={active ? <StatusBadge status="active" label="Membership active" /> : null}
        />
        <div className="ticket-card p-5 sm:p-7">
          <h2 className="metro-section-title">What your membership includes</h2>
          {settings.isLoading ? <p role="status" className="mt-4 text-sm text-muted-foreground">Loading membership details…</p> : null}
          <ul className="mt-5 grid gap-3 text-sm leading-relaxed">
            {(settings.data?.membershipBenefits ?? []).map(benefit => <li key={benefit} className="rounded-xl bg-secondary px-4 py-3">{benefit}</li>)}
          </ul>
          <StatusNotice tone="pending" className="mt-6">
            <strong>Automatic monthly subscription.</strong> Once you enroll through Stripe,
            your payment method is charged {monthlyPrice} now and automatically every month
            until you cancel. Manage or cancel billing through your Metro Pro account and Stripe.
            Creating a member account alone does not start billing.
          </StatusNotice>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            To join, create an account with your full name, email, phone number and private ID photo.
            Guests can <a href="/#trip-search" className="font-semibold text-primary underline underline-offset-4">book a regular ticket without signing in</a>.
          </p>
          {isAuthenticated && !profile.data?.complete && !profile.isLoading ? (
            <StatusNotice className="mt-5">Your member profile still needs required information and an ID photo.</StatusNotice>
          ) : null}
          {isAuthenticated && profile.data?.complete && !active ? (
            <label className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-white p-4 text-sm leading-relaxed">
              <input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
              <span>I understand that joining authorizes an automatic {monthlyPrice} charge every month until I cancel.</span>
            </label>
          ) : null}
          {active ? (
            <ActionLink href="/account/membership" variant="primary" className="mt-7 min-h-12">Manage my membership</ActionLink>
          ) : (
            <Button className="mt-7 min-h-12" disabled={start.isPending || (isAuthenticated && profile.data?.complete && !agreed)} onClick={continueToMembership}>
              {!isAuthenticated ? "Create a member account" : profile.data?.complete ? `Subscribe for ${monthlyPrice}/month` : "Complete member profile"}
            </Button>
          )}
        </div>
      </div>
    </CustomerLayout>
  );
}
