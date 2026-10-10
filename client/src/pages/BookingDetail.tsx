import { CustomerLayout } from "@/layouts/CustomerLayout";
import { ActionLink, PageIntro, ResourceState, StatusBadge, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { formatDateLong, formatTime, moneyExact } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useRoute } from "wouter";

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
  return <CustomerLayout><div className="metro-page metro-page--readable">
    <PageIntro eyebrow="My bookings" title="Booking details" description="Review your reservation, seats and available booking actions." actions={<ActionLink href="/account" back>Back to my bookings</ActionLink>} />
    <ResourceState loading={q.isLoading} error={q.error || !id ? "This booking is unavailable to your account. Sign in with the booking's owner account, or use your original private guest confirmation link." : null} empty={!q.isLoading && !q.error && Boolean(id) && !b} emptyTitle="Booking unavailable" emptyDescription="This booking no longer has details available to display.">
      {b ? <>
        <section className="ticket-card p-5 sm:p-7" aria-label="Reservation"><p className="metro-eyebrow">Booking reference</p><h2 className="mt-1 break-all font-serif text-2xl">{b.bookingNumber}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span>Status:</span><StatusBadge status={b.status} /> <span>· {b.passengerCount} passenger{b.passengerCount === 1 ? "" : "s"}</span></div>
          <p className="mt-2 text-sm">{b.status === "confirmed" ? "Booking total paid" : "Booking amount"}: <strong>{moneyExact(b.amountCents)}</strong></p>
          {item?.refund ? <StatusNotice tone={item.refund.status === "failed" ? "error" : item.refund.status === "pending" ? "pending" : "success"} className="mt-4">
            Refund: <strong className="capitalize">{item.refund.status}</strong>{item.refund.status === "pending" ? " — Stripe has not confirmed the money was returned yet." : item.refund.status === "failed" ? " — a staff member must review this unsuccessful refund. Contact support." : " — Stripe confirmed the refund."}
          </StatusNotice> : null}
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">Contact {b.contactFirstName} {b.contactLastName} · {b.contactPhone} · {b.contactEmail}</p>
        </section>
        {[{ label: "Outbound", trip: item?.outbound }, { label: "Return", trip: item?.returnTrip }].filter(({ trip }) => Boolean(trip)).map(({ label, trip }) => <section key={label} className="ticket-card mt-4 p-5 sm:p-7" aria-label={`${label} itinerary`}>
          <p className="metro-eyebrow">{label} · {trip ? formatDateLong(trip.departAt) : ""}</p>
          <h2 className="mt-2 font-serif text-xl">{trip?.origin?.name} → {trip?.destination?.name}</h2>
          <p className="mt-2 text-sm">{trip ? formatTime(trip.departAt) : ""} → {trip ? formatTime(trip.arriveAt) : ""}</p>
          <p className="text-sm text-muted-foreground">Pickup {trip?.pickup?.label} · Drop-off {trip?.dropoff?.label}</p>
          <div className="mt-4 border-t border-border pt-4"><p className="text-sm font-semibold">Passengers and seats</p>
            <ul className="mt-3 grid gap-2">{item?.passengers.map(passenger => {
              const ticket = item?.tickets.find(t => t.passengerId === passenger.id && t.departureId === trip?.id && t.status !== "voided");
              const seat = label === "Outbound" ? passenger.seatNumber : passenger.returnSeatNumber;
              return <li key={passenger.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary p-3 text-sm">
                <span>{passenger.firstName} {passenger.lastName} · <strong>{seat ? `Seat ${seat}` : label === "Outbound" && passenger.outboundSeatType === "front" || label === "Return" && passenger.returnSeatType === "front" ? "Front seat" : "Regular seat"}</strong>{ticket ? ` · ${ticket.status.replace("_", " ")}` : ""}</span>
                {ticket ? <ActionLink href={`/ticket/${ticket.qrToken}`}>View QR ticket</ActionLink> : null}
              </li>;
            })}</ul>
          </div>
        </section>)}
        <div className="mt-6 flex flex-wrap gap-3">
          {item?.canCancel && !b.usedFreeReschedule ? <ActionLink href={`/account/booking/${b.id}/reschedule`} variant="primary">Member: choose new trip & seats</ActionLink> : null}
          {item?.canCancel ? <Button variant="outline" className="min-h-11" disabled={cancel.isPending} onClick={() => {
            if (window.confirm(`Cancel booking ${b.bookingNumber}? All tickets on this booking will be voided and any eligible payment refunded through Stripe.`)) cancel.mutate({ bookingId: b.id });
          }}>{cancel.isPending ? "Canceling…" : "Cancel booking"}</Button> : null}
          {b.status === "confirmed" && !item?.canCancel ? <StatusNotice tone="pending" className="self-center">The self-service cancellation window has closed. Contact support for changes.</StatusNotice> : null}
          <ActionLink href="/support">Contact support</ActionLink>
        </div>
      </> : null}
    </ResourceState>
  </div></CustomerLayout>;
}
