import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { moneyExact } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Link } from "wouter";

export default function Membership() {
  const settings = trpc.public.settings.useQuery();
  const { isAuthenticated } = useAuth();
  const overview = trpc.account.overview.useQuery(undefined, { enabled: isAuthenticated });
  const start = trpc.account.startMembershipCheckout.useMutation();
  return (
    <PageShell>
      <div className="container max-w-2xl py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Metro Pro Member</p>
        <h1 className="mt-3 font-serif text-4xl">A better fare, not unlimited travel.</h1>
        <p className="mt-4 text-muted-foreground">
          {moneyExact(settings.data?.membershipPriceCents ?? 2500)} per month. Your own regular
          passenger seat drops from $150 to $100 for each one-way trip. Companions pay regular fares,
          and the front passenger seat remains $200 for everyone. Priority booking and one free
          eligible reschedule are also included.
        </p>
        <ul className="mt-6 space-y-2 text-sm">
          {(settings.data?.membershipBenefits ?? []).map(b => (
            <li key={b}>· {b}</li>
          ))}
        </ul>
        {overview.data?.membership?.status === "active" ? (
          <Link href="/account/membership"><Button className="mt-8 h-12">Manage my membership</Button></Link>
        ) : <Button
          className="mt-8 h-12"
          onClick={async () => {
            if (!isAuthenticated) {
              startLogin();
              return;
            }
            try {
              const r = await start.mutateAsync({ origin: window.location.origin });
              if (r.checkoutUrl) {
                toast.message("Opening Stripe Checkout in a new tab.");
                window.open(r.checkoutUrl, "_blank");
              }
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not start membership checkout");
            }
          }}
        >
          Join Metro Pro Member
        </Button>}
      </div>
    </PageShell>
  );
}
