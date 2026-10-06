import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { formatDateLong, formatTime, moneyExact } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Link, useSearch } from "wouter";
import { useMemo } from "react";
import { toast } from "sonner";

export default function Confirmation() {
  const search = useSearch();
  const bookingNumber = useMemo(() => new URLSearchParams(search).get("booking") ?? "", [search]);
  const accessToken = useMemo(() => {
    const token = new URLSearchParams(search).get("access");
    return token || sessionStorage.getItem(`metropro-guest:${bookingNumber}`) || undefined;
  }, [search, bookingNumber]);
  const query = trpc.booking.getByNumber.useQuery(
    { bookingNumber, accessToken },
    { enabled: Boolean(bookingNumber), refetchInterval: current => current.state.data?.booking?.status === "pending_payment" ? 2500 : false }
  );
  const booking = query.data?.booking;
  const tickets = query.data?.tickets ?? [];
  const confirmed = booking?.status === "confirmed";
  const unavailable = booking?.status === "canceled" || booking?.status === "refunded";
  const ticketHref = (token: string, print = false) => `/ticket/${token}${accessToken || print ? `?${new URLSearchParams({ ...(accessToken ? { access: accessToken } : {}), ...(print ? { print: "1" } : {}) })}` : ""}`;

  return <PageShell><main className="container max-w-2xl py-12 sm:py-16">
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Metro Pro · Booking status</p>
    <h1 className="mt-2 font-serif text-3xl sm:text-4xl">{confirmed ? "Booking confirmed" : unavailable ? "Booking not confirmed" : "Confirming your payment"}</h1>
    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
      {confirmed ? "Your Metro Pro booking has been confirmed. Your digital tickets are ready below." : unavailable ? query.data?.refund?.status === "pending" ? "This trip was canceled. Stripe has accepted a refund request, but your money has not yet been confirmed returned." : query.data?.refund?.status === "failed" ? "This trip was canceled and its Stripe refund failed. Please contact support for urgent manual review." : query.data?.refund?.status === "succeeded" ? "This trip was canceled and Stripe confirmed the refund." : "This booking was canceled or its temporary hold expired. If you paid, contact support for a payment review." : "Stripe is confirming your payment. This page updates automatically — returning from Checkout alone is not proof that payment succeeded."}
    </p>
    {query.isLoading ? <p role="status" className="mt-5 text-sm">Loading the latest booking status…</p> : null}
    {!bookingNumber || query.error ? <div role="alert" className="ticket-card mt-6 p-5 text-sm">This private booking link is missing or invalid. Use your original booking link, or sign in if the reservation belongs to your account.</div> : null}
    {booking ? <section className="ticket-card mt-7 space-y-4 p-5 sm:p-7" aria-label="Booking details">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Booking reference</p><p className="mt-1 break-all font-serif text-2xl">{booking.bookingNumber}</p></div>
      <p className="text-sm">Status: <strong className="capitalize">{booking.status.replace("_", " ")}</strong> · {booking.passengerCount} passenger{booking.passengerCount === 1 ? "" : "s"}</p>
      {[{ label: "Outbound", trip: query.data?.outbound }, { label: "Return", trip: query.data?.returnTrip }].filter(item => item.trip).map(item => <div key={item.label} className="border-t border-border pt-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">{item.label}</p>
        <p className="mt-1 font-semibold">{item.trip?.origin?.name} → {item.trip?.destination?.name}</p>
        <p>{item.trip ? formatDateLong(item.trip.departAt) : ""} · {item.trip ? formatTime(item.trip.departAt) : ""} → {item.trip ? formatTime(item.trip.arriveAt) : ""}</p>
        <p className="text-muted-foreground">Pickup {item.trip?.pickup?.label} · Drop-off {item.trip?.dropoff?.label}</p>
      </div>)}
      {confirmed ? <p className="border-t border-border pt-4 text-sm">Booking total paid: <strong>{moneyExact(booking.amountCents)}</strong></p> : query.data?.refund ? <p className="border-t border-border pt-4 text-sm">Charged amount: <strong>{moneyExact(booking.amountCents)}</strong> · Refund <span className="capitalize">{query.data.refund.status}</span></p> : <p className="border-t border-border pt-4 text-sm">Quoted amount: <strong>{moneyExact(booking.amountCents)}</strong> · Not a payment receipt</p>}
    </section> : null}
    {confirmed && tickets.length ? <section className="mt-8" aria-label="Digital tickets"><h2 className="font-serif text-2xl">Your digital tickets</h2>
      <div className="mt-4 grid gap-3">{tickets.map(ticket => {
        const traveler = query.data?.passengers.find(person => person.id === ticket.passengerId);
        const outbound = ticket.departureId === booking?.outboundDepartureId;
        const number = outbound ? traveler?.seatNumber : traveler?.returnSeatNumber;
        return <div key={ticket.id} className="ticket-card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <div><p className="font-semibold">{traveler?.firstName} {traveler?.lastName} · {outbound ? "Outbound" : "Return"}</p><p className="text-muted-foreground">{number ? `Seat ${number}` : ticket.seatType === "front" ? "Front passenger seat" : "Regular passenger seat"}</p></div>
          <div className="flex flex-wrap gap-2"><Link href={ticketHref(ticket.qrToken)} className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-semibold text-primary-foreground">View ticket</Link><Link href={ticketHref(ticket.qrToken, true)} className="inline-flex min-h-11 items-center rounded-md border border-input px-4 font-semibold text-primary">Print / save PDF</Link></div>
        </div>;
      })}</div>
    </section> : null}
    {confirmed && !tickets.length ? <p role="status" className="mt-6 rounded-xl bg-secondary p-4 text-sm">Your payment is recorded, but tickets are not ready yet. Contact support with your booking reference if they do not appear.</p> : null}
    {accessToken && booking ? <div className="mt-7 rounded-xl border border-primary/20 bg-secondary p-4 text-sm"><strong>Guest booking — save this private link.</strong> Anyone with the link can see trip details; do not post it publicly. Metro Pro does not yet email guest ticket links.
      <Button variant="outline" className="mt-3 min-h-11 w-full" onClick={async () => { try { const link = new URL(window.location.href); link.searchParams.delete("session_id"); await navigator.clipboard.writeText(link.toString()); toast.success("Private link copied"); } catch { toast.error("Copy the page URL from your address bar"); } }}>Copy private booking link</Button>
    </div> : null}
    <div className="mt-8 flex flex-wrap gap-3"><Link href="/" className="inline-flex min-h-11 items-center rounded-lg border border-input px-5 text-sm font-semibold text-primary">Back to home</Link>{unavailable ? <Link href="/#trip-search" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">Find another trip</Link> : null}</div>
  </main></PageShell>;
}
