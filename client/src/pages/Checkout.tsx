import { CustomerLayout } from "@/layouts/CustomerLayout";
import { ActionLink, BookingProgress, PageIntro, ResourceState, StatusBadge, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime, money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";

type SeatType = "standard" | "front";
type Draft = {
  out: string | null;
  ret?: string | null;
  pax: string;
  type: string;
  search?: string;
  contactFirstName: string;
  contactLastName: string;
  phone: string;
  email: string;
  emergencyName?: string;
  emergencyPhone?: string;
  passengers: {
    firstName: string;
    lastName: string;
    seatNumber?: string;
    returnSeatNumber?: string;
    outboundSeatType: SeatType;
    returnSeatType: SeatType | null;
    isMemberTraveler: boolean;
  }[];
};

type ActiveCheckout = { draftKey: string; checkoutUrl: string; bookingNumber: string; guestAccessToken?: string | null;
  checkoutExpiresAt?: string; holdExpiresAt: string };

export function restoredCheckout(raw: string | null, draftKey: string, now = Date.now()): ActiveCheckout | null {
  try {
    const item = raw ? JSON.parse(raw) as ActiveCheckout : null;
    if (!item || item.draftKey !== draftKey || typeof item.checkoutUrl !== "string" || !item.bookingNumber) return null;
    const url = new URL(item.checkoutUrl);
    if (url.origin !== "https://checkout.stripe.com") return null;
    const expiresAt = item.checkoutExpiresAt ? new Date(item.checkoutExpiresAt).getTime() : new Date(item.holdExpiresAt).getTime() - 5 * 60_000;
    return Number.isFinite(expiresAt) && expiresAt > now ? { ...item, checkoutExpiresAt: new Date(expiresAt).toISOString() } : null;
  } catch { return null; }
}

export default function Checkout() {
  const search = useSearch();
  const canceled = new URLSearchParams(search).get("canceled") === "1";
  const draft = useMemo<Draft | null>(() => {
    try { return JSON.parse(sessionStorage.getItem("metropro-booking") || "null"); }
    catch { return null; }
  }, []);
  const draftKey = JSON.stringify(draft);
  const active = useMemo(() => restoredCheckout(sessionStorage.getItem("metropro-active-checkout"), draftKey), [draftKey]);
  const [activeCheckout, setActiveCheckout] = useState<ActiveCheckout | null>(active);
  const paymentUrl = activeCheckout?.checkoutUrl ?? null;
  const [privateLink, setPrivateLink] = useState<string | null>(active?.guestAccessToken ? `/confirmation?booking=${encodeURIComponent(active.bookingNumber)}&access=${encodeURIComponent(active.guestAccessToken)}` : active ? `/confirmation?booking=${encodeURIComponent(active.bookingNumber)}` : null);
  const outId = Number(draft?.out);
  const retId = draft?.ret ? Number(draft.ret) : null;
  const pax = Number(draft?.pax ?? 1);
  const quote = trpc.booking.quote.useQuery(
    { outboundDepartureId: outId, returnDepartureId: retId, passengerCount: pax, passengers: draft?.passengers ?? [] },
    { enabled: Boolean(outId && draft?.passengers?.length) }
  );
  const checkout = trpc.booking.createCheckout.useMutation();

  useEffect(() => {
    if (!activeCheckout) return;
    const expiresAt = new Date(activeCheckout.checkoutExpiresAt!).getTime();
    const checkExpiry = () => {
      if (Date.now() < expiresAt) return;
      setActiveCheckout(null);
      try {
        const stored = JSON.parse(sessionStorage.getItem("metropro-active-checkout") ?? "null") as ActiveCheckout | null;
        if (stored?.bookingNumber === activeCheckout.bookingNumber) sessionStorage.removeItem("metropro-active-checkout");
      } catch { /* An unreadable cached session will be ignored on the next visit. */ }
    };
    const timer = window.setInterval(checkExpiry, 5_000);
    checkExpiry();
    return () => window.clearInterval(timer);
  }, [activeCheckout]);

  async function pay() {
    if (!draft || !outId || !quote.data || paymentUrl) return;
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
        const fresh: ActiveCheckout = { draftKey, checkoutUrl: result.checkoutUrl, bookingNumber: result.bookingNumber,
          guestAccessToken: result.guestAccessToken, checkoutExpiresAt: result.checkoutExpiresAt.toISOString(),
          holdExpiresAt: result.holdExpiresAt.toISOString() };
        setActiveCheckout(fresh);
        if (result.guestAccessToken) {
          sessionStorage.setItem(`metropro-guest:${result.bookingNumber}`, result.guestAccessToken);
          setPrivateLink(`/confirmation?booking=${encodeURIComponent(result.bookingNumber)}&access=${encodeURIComponent(result.guestAccessToken)}`);
        } else setPrivateLink(`/confirmation?booking=${encodeURIComponent(result.bookingNumber)}`);
        sessionStorage.setItem("metropro-active-checkout", JSON.stringify(fresh));
        toast.message("Opening secure Stripe Checkout in a new tab.");
        if (!window.open(result.checkoutUrl, "_blank")) toast.message("Your browser blocked the new tab. Use the secure Checkout link below.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
    }
  }

  if (!draft) {
    return (
      <CustomerLayout>
        <main className="metro-page metro-page--readable">
          <PageIntro eyebrow="Your trip" title="Review your booking" description="Your booking details are kept only while you move through the secure checkout flow." />
          <ResourceState empty emptyTitle="No booking in progress" emptyDescription="Start a new search to choose a departure and traveler details."><></></ResourceState>
          <ActionLink href="/" variant="primary" className="mt-5">Start over</ActionLink>
        </main>
      </CustomerLayout>
    );
  }

  const q = quote.data;
  return (
    <CustomerLayout>
      <main className="metro-page metro-page--readable">
        <BookingProgress current="Review" />
        <PageIntro eyebrow="Your trip · Step 5" title="Review your booking" description="Confirm your itinerary, traveler details, and total before opening Stripe Checkout." />
        {canceled ? <StatusNotice tone="pending" className="mb-6">Stripe Checkout was closed without a confirmed payment. {paymentUrl ? "Resume the same Checkout session below before its temporary seat hold expires." : "The session may have expired. Choose available seats to start a new booking."} Returning here is not proof of payment.</StatusNotice> : null}
        {quote.isLoading ? <div className="mb-6"><ResourceState loading>Checking seats and fares…</ResourceState></div> : null}
        {quote.error ? (
          <StatusNotice tone="error" className="mb-6">
            {paymentUrl ? "Your seats are held by this existing Checkout session. Resume it below or use your private booking link to check payment status." : quote.error.message} {!paymentUrl ? <Link href={`/seats?out=${outId}&pax=${pax}${retId ? `&ret=${retId}` : ""}${draft.search ? `&search=${encodeURIComponent(draft.search)}` : ""}`} className="ml-2 font-semibold underline underline-offset-4">Choose different seats</Link> : null}
          </StatusNotice>
        ) : null}
        {q ? (
          <section className="ticket-card space-y-5 p-5 sm:p-7" aria-label="Booking review">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-xl">Itinerary and fare</h2><StatusBadge status={paymentUrl ? "pending_payment" : "open"} label={paymentUrl ? "Checkout session ready" : "Ready for payment"} /></div>
            <TripLine label="Outbound" trip={q.outbound} />
            <SeatRows rows={q.outboundBreakdown} />
            {q.returnTrip ? (
              <div className="border-t border-border pt-5">
                <TripLine label="Return" trip={q.returnTrip} />
                <SeatRows rows={q.returnBreakdown} />
              </div>
            ) : null}
            <div className="border-t border-border pt-5 text-sm"><p className="font-semibold">Booking contact</p><p>{draft.contactFirstName} {draft.contactLastName} · {draft.phone}</p><p className="break-all">{draft.email}</p></div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5 text-lg font-semibold">
              <span>Total for {pax} passenger{pax === 1 ? "" : "s"}</span>
              <span className="fare-price text-2xl">{money(q.amountCents)}</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Only the traveling member's own regular seat qualifies for $100. Front passenger seats are always $200.
              Promo codes are entered on Stripe. Metro Pro never stores card numbers.
            </p>
          </section>
        ) : null}
        <ActionLink href={`/book?out=${outId}&pax=${pax}${retId ? `&ret=${retId}` : ""}${draft.search ? `&search=${encodeURIComponent(draft.search)}` : ""}`} back className="mt-5">Back to passenger details</ActionLink>
        <Button className="mt-3 min-h-12 w-full text-base" onClick={pay} disabled={!q || checkout.isPending || Boolean(paymentUrl)}>
          {checkout.isPending ? "Holding your selected seats…" : paymentUrl ? "Secure checkout session ready" : "Proceed to secure Stripe payment"}
        </Button>
        {paymentUrl ? (
          <StatusNotice tone="pending" className="mt-4"><div className="flex flex-wrap items-center gap-2"><StatusBadge status="pending_payment" label="Payment pending" /><a href={paymentUrl} target="_blank" rel="noopener noreferrer" className="metro-action-link">Open or resume secure Stripe Checkout</a></div>
            {privateLink ? <p className="mt-3">After payment, <Link href={privateLink} className="font-semibold underline underline-offset-4">check your booking</Link>{active?.guestAccessToken || !active ? " and save its private guest link" : ""}. A return to the app is not proof of payment until the ticket appears.</p> : null}
          </StatusNotice>
        ) : null}
      </main>
    </CustomerLayout>
  );
}

function SeatRows({ rows }: { rows: { name: string; seatNumber: string | null; seatType: string | null; amountCents: number; memberFareApplied: boolean; pickupLabel?: string | null; dropoffLabel?: string | null }[] }) {
  return (
    <div className="mt-3 grid gap-3">
      {rows.map((row, index) => (
        <div key={`${row.name}-${index}`} className="flex min-w-0 flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
          <div className="min-w-0">
            <span className="font-medium">{row.name}</span>
            <span className="ml-2 text-muted-foreground">{row.seatNumber ? `Seat ${row.seatNumber}` : row.seatType === "front" ? "Front passenger seat" : "Regular seat"}{row.memberFareApplied ? " · member fare" : ""}</span>
            {(row.pickupLabel || row.dropoffLabel) ? <span className="block text-xs text-muted-foreground">Pickup {row.pickupLabel ?? "route origin"} · Drop-off {row.dropoffLabel ?? "route destination"}</span> : null}
          </div>
          <span className="font-semibold tabular-nums">{money(row.amountCents)}</span>
        </div>
      ))}
    </div>
  );
}

function TripLine({ label, trip }: {
  label: string;
  trip: { departAt: Date; arriveAt: Date; pickup?: { label: string } | null; dropoff?: { label: string } | null; origin?: { name: string } | null; destination?: { name: string } | null };
}) {
  return (
    <div>
      <div className="metro-eyebrow mb-1">{label}</div>
      <div className="font-medium">{trip.origin?.name} → {trip.destination?.name}</div>
      <div className="text-sm text-muted-foreground">{formatDate(trip.departAt)} · {formatTime(trip.departAt)} → {formatTime(trip.arriveAt)}</div>
      <div className="text-xs leading-relaxed text-muted-foreground">Pickup {trip.pickup?.label ?? trip.origin?.name} · Drop-off {trip.dropoff?.label ?? trip.destination?.name}</div>
    </div>
  );
}
