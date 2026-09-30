import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { moneyExact } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

export default function Membership() {
  const settings = trpc.public.settings.useQuery();
  const { isAuthenticated } = useAuth();
  const start = trpc.account.startMembershipCheckout.useMutation();
  return (
    <PageShell>
      <div className="container max-w-2xl py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Metro Pro Member</p>
        <h1 className="mt-3 font-serif text-4xl">A better fare, not unlimited travel.</h1>
        <p className="mt-4 text-muted-foreground">
          {moneyExact(settings.data?.membershipPriceCents ?? 2999)} per month. Ride NYC ↔ Columbus at
          member prices, with priority booking and one free eligible reschedule.
        </p>
        <ul className="mt-6 space-y-2 text-sm">
          {(settings.data?.membershipBenefits ?? []).map(b => (
            <li key={b}>· {b}</li>
          ))}
        </ul>
        <Button
          className="mt-8 h-12"
          onClick={async () => {
            if (!isAuthenticated) {
              startLogin();
              return;
            }
            const r = await start.mutateAsync({ origin: window.location.origin });
            if (r.checkoutUrl) {
              toast.message("Opening Stripe Checkout in a new tab.");
              window.open(r.checkoutUrl, "_blank");
            }
          }}
        >
          Join Metro Pro Member
        </Button>
      </div>
    </PageShell>
  );
}
