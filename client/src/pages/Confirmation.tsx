import { CustomerLayout } from "@/layouts/CustomerLayout";
import { ActionLink, BookingProgress, PageIntro, ResourceState, StatusBadge, StatusNotice } from "@/components/MetroUI";
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
  const linkUnavailable = !bookingNumber || query.isError;
  const ticketHref = (token: string, print = false) => `/ticket/${token}${accessToken || print ? `?${new URLSearchParams({ ...(accessToken ? { access: accessToken } : {}), ...(print ? { print: "1" } : {}) })}` : ""}`;
  const title = linkUnavailable ? "Booking link unavailable" : confirmed ? "Booking confirmed" : unavailable ? "Booking not confirmed" : "Confirming your payment";
  const description = linkUnavailable ? "Use your private booking link or sign in to your member account to find your trip." : confirmed ? "Your Metro Pro booking has been confirmed. Your digital tickets are ready below." : unavailable ? query.data?.refund?.status === "pending" ? "This trip was canceled. Stripe has accepted a refund request, but your money has not yet been confirmed returned." : query.data?.refund?.status === "failed" ? "This trip was canceled and its Stripe refund failed. Please contact support for urgent manual review." : query.data?.refund?.status === "succeeded" ? "This trip was canceled and Stripe confirmed the refund." : "This booking was canceled or its temporary hold expired. If you paid, contact support for a payment review." : "Stripe is confirming your payment. This page updates automatically — returning from Checkout alone is not proof that payment succeeded.";

  return <CustomerLayout><main className="metro-page metro-page--readable">
    <BookingProgress current="Ticket" />
    <PageIntro eyebrow="Metro Pro · Booking status" title={title} description={description} />
    {query.isLoading ? <div className="mb-6"><ResourceState loading>Loading the latest booking status…</ResourceState></div> : null}
    {linkUnavailable ? <StatusNotice tone="error" className="mb-6">This private booking link is missing or invalid. Use your original booking link, or sign in if the reservation belongs to your account.</StatusNotice> : null}
    {booking ? <section className="ticket-card space-y-4 p-5 sm:p-7" aria-label="Booking details">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="metro-eyebrow mb-1">Booking reference</p><p className="break-all font-serif text-2xl">{booking.bookingNumber}</p></div><StatusBadge status={booking.status} /></div>
      <p className="text-sm">Status: <strong className="capitalize">{booking.status.replace("_", " ")}</strong> · {booking.passengerCount} passenger{booking.passengerCount === 1 ? "" : "s"}</p>
      {[{ label: "Outbound", trip: query.data?.outbound }, { label: "Return", trip: query.data?.returnTrip }].filter(item => item.trip).map(item => <div key={item.label} className="border-t border-border pt-4 text-sm">
        <p className="metro-eyebrow mb-1">{item.label}</p>
        <p className="font-semibold">{item.trip?.origin?.name} → {item.trip?.destination?.name}</p>
        <p>{item.trip ? formatDateLong(item.trip.departAt) : ""} · {item.trip ? formatTime(item.trip.departAt) : ""} → {item.trip ? formatTime(item.trip.arriveAt) : ""}</p>
        <p className="text-muted-foreground">Pickup {item.trip?.pickup?.label} · Drop-off {item.trip?.dropoff?.label}</p>
      </div>)}
      {confirmed ? <p className="border-t border-border pt-4 text-sm">Booking total paid: <strong>{moneyExact(booking.amountCents)}</strong></p> : query.data?.refund ? <p className="border-t border-border pt-4 text-sm">Charged amount: <strong>{moneyExact(booking.amountCents)}</strong> · Refund <span className="capitalize">{query.data.refund.status}</span></p> : <p className="border-t border-border pt-4 text-sm">Quoted amount: <strong>{moneyExact(booking.amountCents)}</strong> · Not a payment receipt</p>}
    </section> : null}
    {confirmed && tickets.length ? <section className="mt-8" aria-label="Digital tickets"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="metro-section-title">Your digital tickets</h2><StatusBadge status="confirmed" label={`${tickets.length} ticket${tickets.length === 1 ? "" : "s"} ready`} /></div>
      <div className="mt-4 grid gap-3">{tickets.map(ticket => {
        const traveler = query.data?.passengers.find(person => person.id === ticket.passengerId);
        const outbound = ticket.departureId === booking?.outboundDepartureId;
        const number = outbound ? traveler?.seatNumber : traveler?.returnSeatNumber;
        return <div key={ticket.id} className="ticket-card flex flex-wrap items-center justify-between gap-3 p-4 text-sm sm:p-5">
          <div className="min-w-0"><p className="font-semibold">{traveler?.firstName} {traveler?.lastName} · {outbound ? "Outbound" : "Return"}</p><p className="text-muted-foreground">{number ? `Seat ${number}` : ticket.seatType === "front" ? "Front passenger seat" : "Regular passenger seat"}</p></div>
          <div className="flex flex-wrap gap-2"><ActionLink href={ticketHref(ticket.qrToken)} variant="primary">View ticket</ActionLink><ActionLink href={ticketHref(ticket.qrToken, true)}>Print / save PDF</ActionLink></div>
        </div>;
      })}</div>
    </section> : null}
    {confirmed && !tickets.length ? <StatusNotice tone="pending" className="mt-6">Your payment is recorded, but tickets are not ready yet. Contact support with your booking reference if they do not appear.</StatusNotice> : null}
    {accessToken && booking ? <StatusNotice tone="info" className="mt-7"><strong>Guest booking — save this private link.</strong> Anyone with the link can see trip details; do not post it publicly. Metro Pro does not yet email guest ticket links.
      <Button variant="outline" className="mt-3 min-h-11 w-full" onClick={async () => { try { const link = new URL(window.location.href); link.searchParams.delete("session_id"); await navigator.clipboard.writeText(link.toString()); toast.success("Private link copied"); } catch { toast.error("Copy the page URL from your address bar"); } }}>Copy private booking link</Button>
    </StatusNotice> : null}
    <div className="mt-8 flex flex-wrap gap-3"><ActionLink href="/" back>Back to home</ActionLink>{unavailable ? <ActionLink href="/#trip-search" variant="primary">Find another trip</ActionLink> : null}</div>
  </main></CustomerLayout>;
}
