import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime, money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useMemo } from "react";
import { Link } from "wouter";

type SeatType = "standard" | "front";
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
  passengers: {
    firstName: string;
    lastName: string;
    outboundSeatType: SeatType;
    returnSeatType: SeatType | null;
    isMemberTraveler: boolean;
  }[];
};

export default function Checkout() {
  const draft = useMemo<Draft | null>(() => {
    try { return JSON.parse(sessionStorage.getItem("metropro-booking") || "null"); }
    catch { return null; }
  }, []);
  const outId = Number(draft?.out);
  const retId = draft?.ret ? Number(draft.ret) : null;
  const pax = Number(draft?.pax ?? 1);
  const quote = trpc.booking.quote.useQuery(
    { outboundDepartureId: outId, returnDepartureId: retId, passengerCount: pax, passengers: draft?.passengers ?? [] },
    { enabled: Boolean(outId && draft?.passengers?.length) }
  );
  const checkout = trpc.booking.createCheckout.useMutation();

  async function pay() {
    if (!draft || !outId || !quote.data) return;
    try {
      const result = await checkout.mutateAsync({
        origin: window.location.origin,
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
        toast.message("Opening secure Stripe Checkout in a new tab.");
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
          <Link href="/"><Button className="mt-4">Start over</Button></Link>
        </div>
      </PageShell>
    );
  }

  const q = quote.data;
  return (
    <PageShell>
      <div className="container max-w-2xl py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Step 3 of 3 · Review</p>
        <h1 className="mt-2 font-serif text-3xl">Your booking</h1>
        {quote.isLoading ? <p className="mt-6 text-sm text-muted-foreground">Checking seats and fares…</p> : null}
        {quote.error ? (
          <div role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-red-50 p-4 text-sm text-destructive">
            {quote.error.message} <Link href={`/book?out=${outId}&ret=${retId ?? ""}&pax=${pax}`} className="ml-2 underline">Change seat selection</Link>
          </div>
        ) : null}
        {q ? (
          <div className="ticket-card mt-6 space-y-5 p-5 sm:p-7">
            <TripLine label="Outbound" trip={q.outbound} />
            <SeatRows rows={q.outboundBreakdown} />
            {q.returnTrip ? (
              <div className="border-t border-border pt-5">
                <TripLine label="Return" trip={q.returnTrip} />
                <SeatRows rows={q.returnBreakdown} />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5 text-lg font-semibold">
              <span>Total for {pax} passenger{pax === 1 ? "" : "s"}</span>
              <span className="price-copper text-2xl">{money(q.amountCents)}</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Only the traveling member's own regular seat qualifies for $100. Front passenger seats are always $200.
              Promo codes are entered on Stripe. Metro Pro never stores card numbers.
            </p>
          </div>
        ) : null}
        <Button className="mt-6 h-12 w-full text-base" onClick={pay} disabled={!q || checkout.isPending}>
          {checkout.isPending ? "Holding your selected seats…" : "Continue to secure payment"}
        </Button>
      </div>
    </PageShell>
  );
}

function SeatRows({ rows }: { rows: { name: string; seatType: string | null; amountCents: number; memberFareApplied: boolean }[] }) {
  return (
    <div className="mt-3 grid gap-3">
      {rows.map((row, index) => (
        <div key={`${row.name}-${index}`} className="flex min-w-0 flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
          <div className="min-w-0">
            <span className="font-medium">{row.name}</span>
            <span className="ml-2 text-muted-foreground">{row.seatType === "front" ? "Front passenger seat" : row.memberFareApplied ? "Regular · member fare" : "Regular seat"}</span>
          </div>
          <span className="font-semibold tabular-nums">{money(row.amountCents)}</span>
        </div>
      ))}
    </div>
  );
}

function TripLine({ label, trip }: {
  label: string;
  trip: { departAt: Date; origin?: { name: string } | null; destination?: { name: string } | null };
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-accent">{label}</div>
      <div className="font-medium">{trip.origin?.name} → {trip.destination?.name}</div>
      <div className="text-sm text-muted-foreground">{formatDate(trip.departAt)} · {formatTime(trip.departAt)}</div>
    </div>
  );
}
