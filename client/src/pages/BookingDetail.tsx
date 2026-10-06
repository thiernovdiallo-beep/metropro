import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { formatDateLong, formatTime, moneyExact } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link, useRoute } from "wouter";

export default function BookingDetail() {
  const [, params] = useRoute("/account/booking/:id");
  const id = Number(params?.id);
  const q = trpc.account.booking.useQuery({ id }, { enabled: Number.isSafeInteger(id) && id > 0, retry: false });
  const utils = trpc.useUtils();
  const cancel = trpc.account.cancelBooking.useMutation({ onSuccess: async () => {
    await Promise.all([utils.account.booking.invalidate(), utils.account.overview.invalidate(), utils.account.tickets.invalidate()]);
    toast.success("Booking canceled. Check your payment method for any applicable Stripe refund.");
  }, onError: error => toast.error(error.message) });
  const item = q.data;
  const b = item?.booking;
  return <PageShell><main className="container max-w-3xl py-10">
    <Link href="/account" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">← Back to my bookings</Link>
    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-accent">My bookings</p>
    <h1 className="mt-2 font-serif text-3xl">Booking details</h1>
    {q.isLoading ? <p role="status" className="mt-5">Loading your booking…</p> : null}
    {q.error || !id ? <p role="alert" className="ticket-card mt-5 p-5">This booking is unavailable to your account. Sign in with the booking's owner account, or use your original private guest confirmation link.</p> : null}
    {b ? <>
      <section className="ticket-card mt-6 p-5 sm:p-7" aria-label="Reservation"><p className="text-xs uppercase tracking-wide text-accent">Booking reference</p><h2 className="mt-1 break-all font-serif text-2xl">{b.bookingNumber}</h2>
        <p className="mt-3 text-sm">Status: <strong className="capitalize">{b.status.replace("_", " ")}</strong> · {b.passengerCount} passenger{b.passengerCount === 1 ? "" : "s"}</p>
        <p className="mt-1 text-sm">{b.status === "confirmed" ? "Booking total paid" : "Booking amount"}: <strong>{moneyExact(b.amountCents)}</strong></p>
        {item?.refund ? <p className={`mt-2 rounded-lg p-3 text-sm ${item.refund.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-secondary"}`} role="status">
          Refund: <strong className="capitalize">{item.refund.status}</strong>{item.refund.status === "pending" ? " — Stripe has not confirmed the money was returned yet." : item.refund.status === "failed" ? " — a staff member must review this unsuccessful refund. Contact support." : " — Stripe confirmed the refund."}
        </p> : null}
        <p className="mt-3 text-sm text-muted-foreground">Contact {b.contactFirstName} {b.contactLastName} · {b.contactPhone} · {b.contactEmail}</p>
      </section>
      {[{ label: "Outbound", trip: item?.outbound }, { label: "Return", trip: item?.returnTrip }].filter(({ trip }) => Boolean(trip)).map(({ label, trip }) => <section key={label} className="ticket-card mt-4 p-5 sm:p-7" aria-label={`${label} itinerary`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">{label} · {trip ? formatDateLong(trip.departAt) : ""}</p>
        <h2 className="mt-2 font-serif text-xl">{trip?.origin?.name} → {trip?.destination?.name}</h2>
        <p className="mt-2 text-sm">{trip ? formatTime(trip.departAt) : ""} → {trip ? formatTime(trip.arriveAt) : ""}</p>
        <p className="text-sm text-muted-foreground">Pickup {trip?.pickup?.label} · Drop-off {trip?.dropoff?.label}</p>
        <div className="mt-4 border-t border-border pt-3"><p className="text-sm font-semibold">Passengers and seats</p>
          <ul className="mt-2 grid gap-2">{item?.passengers.map(passenger => {
            const ticket = item?.tickets.find(t => t.passengerId === passenger.id && t.departureId === trip?.id && t.status !== "voided");
            const seat = label === "Outbound" ? passenger.seatNumber : passenger.returnSeatNumber;
            return <li key={passenger.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary p-3 text-sm">
              <span>{passenger.firstName} {passenger.lastName} · <strong>{seat ? `Seat ${seat}` : label === "Outbound" && passenger.outboundSeatType === "front" || label === "Return" && passenger.returnSeatType === "front" ? "Front seat" : "Regular seat"}</strong>{ticket ? ` · ${ticket.status.replace("_", " ")}` : ""}</span>
              {ticket ? <Link href={`/ticket/${ticket.qrToken}`} className="inline-flex min-h-11 items-center font-semibold text-primary underline">View QR ticket</Link> : null}
            </li>;
          })}</ul>
        </div>
      </section>)}
      <div className="mt-6 flex flex-wrap gap-3">
        {item?.canCancel && !b.usedFreeReschedule ? <Link href={`/account/booking/${b.id}/reschedule`} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">Member: choose new trip & seats</Link> : null}
        {item?.canCancel ? <Button variant="outline" className="min-h-11" disabled={cancel.isPending} onClick={() => {
          if (window.confirm(`Cancel booking ${b.bookingNumber}? All tickets on this booking will be voided and any eligible payment refunded through Stripe.`)) cancel.mutate({ bookingId: b.id });
        }}>{cancel.isPending ? "Canceling…" : "Cancel booking"}</Button> : null}
        {b.status === "confirmed" && !item?.canCancel ? <p className="self-center text-sm text-muted-foreground">The self-service cancellation window has closed. Contact support for changes.</p> : null}
        <Link href="/account/support" className="inline-flex min-h-11 items-center rounded-lg border border-input px-5 text-sm font-semibold">Contact support</Link>
      </div>
    </> : null}
  </main></PageShell>;
}
