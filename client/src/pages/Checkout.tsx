import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime, money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useMemo } from "react";
import { Link } from "wouter";

type Draft = {
  out: string | null;
  ret?: string | null;
  pax: string;
  type: string;
  contactFirstName: string;
  contactLastName: string;
  phone: string;
  email: string;
  emergencyName?: string;
  emergencyPhone?: string;
  passengers: { firstName: string; lastName: string }[];
};

export default function Checkout() {
  const draft = useMemo<Draft | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("metropro-booking") || "null");
    } catch {
      return null;
    }
  }, []);
  const outId = Number(draft?.out);
  const retId = draft?.ret ? Number(draft.ret) : null;
  const pax = Number(draft?.pax ?? 1);
  const quote = trpc.booking.quote.useQuery(
    { outboundDepartureId: outId, returnDepartureId: retId, passengerCount: pax },
    { enabled: Boolean(outId) }
  );
  const checkout = trpc.booking.createCheckout.useMutation();

  async function pay() {
    if (!draft || !outId) return;
    const origin = window.location.origin;
    try {
      const result = await checkout.mutateAsync({
        origin,
        outboundDepartureId: outId,
        returnDepartureId: retId,
        passengerCount: pax,
        contactFirstName: draft.contactFirstName,
        contactLastName: draft.contactLastName,
        contactPhone: draft.phone,
        contactEmail: draft.email,
        emergencyName: draft.emergencyName,
        emergencyPhone: draft.emergencyPhone,
        passengers: draft.passengers,
      });
      if (result.checkoutUrl) {
        toast.message("Opening Stripe Checkout in a new tab.");
        window.open(result.checkoutUrl, "_blank");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
    }
  }

  if (!draft) {
    return (
      <PageShell>
        <div className="container py-16">
          <p>No booking in progress.</p>
          <Link href="/">
            <Button className="mt-4">Start over</Button>
          </Link>
        </div>
      </PageShell>
    );
  }

  const q = quote.data;
  return (
    <PageShell>
      <div className="container max-w-xl py-10">
        <h1 className="font-serif text-3xl">Checkout</h1>
        {q ? (
          <div className="ticket-card mt-6 space-y-3 p-5">
            <TripLine label="Outbound" trip={q.outbound} />
            {q.returnTrip ? <TripLine label="Return" trip={q.returnTrip} /> : null}
            <div className="flex justify-between text-sm">
              <span>Fare type</span>
              <span className="capitalize">{q.fareType}</span>
            </div>
            <div className="flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span className="price-copper">{money(q.amountCents)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Promo codes are entered on the Stripe page. Card numbers are never stored by Metro Pro.
              Use test card 4242 4242 4242 4242.
            </p>
          </div>
        ) : null}
        <Button className="mt-6 h-12 w-full" onClick={pay} disabled={checkout.isPending}>
          {checkout.isPending ? "Holding seats…" : "Pay with Stripe"}
        </Button>
      </div>
    </PageShell>
  );
}

function TripLine({
  label,
  trip,
}: {
  label: string;
  trip: { departAt: Date; origin?: { name: string } | null; destination?: { name: string } | null };
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium">
        {trip.origin?.name} → {trip.destination?.name}
      </div>
      <div className="text-sm text-muted-foreground">
        {formatDate(trip.departAt)} · {formatTime(trip.departAt)}
      </div>
    </div>
  );
}
