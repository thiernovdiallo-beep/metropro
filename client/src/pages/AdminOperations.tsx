import { PageShell } from "@/components/Brand";
import { PageIntro, ResourceState, StatusBadge, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatTime, moneyExact } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useRoute } from "wouter";
import { AdminNav } from "./AdminPages";

type BookingStatus = "pending_payment" | "confirmed" | "canceled" | "refunded";

export function AdminBookings() {
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [date, setDate] = useState("");
  const [filters, setFilters] = useState<{ query?: string; status?: BookingStatus; date?: string }>({});
  const q = trpc.admin.bookings.useQuery(filters);
  return <PageShell><div className="metro-page metro-page--wide"><AdminNav />
    <PageIntro eyebrow="Reservations" title="Bookings" description="Search real booking and passenger records. Results are limited to the 100 most recent matches." />
    <form className="ticket-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={event => { event.preventDefault(); setFilters({ query: term.trim() || undefined, status: status || undefined, date: date || undefined }); }}>
      <label className="form-field">Reference, passenger, phone or route<Input className="metro-control" value={term} onChange={event => setTerm(event.target.value)} placeholder="Search bookings" maxLength={80} /></label>
      <label className="form-field">Status<select className="metro-control" value={status} onChange={event => setStatus(event.target.value as BookingStatus | "")}><option value="">All statuses</option><option value="pending_payment">Pending</option><option value="confirmed">Confirmed</option><option value="canceled">Canceled</option><option value="refunded">Refunded</option></select></label>
      <label className="form-field">Travel date<Input className="metro-control" type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <Button type="submit" className="min-h-11 self-end">Search</Button>
    </form>
    <div className="mt-5"><ResourceState loading={q.isLoading} error={q.error ? "Bookings could not be loaded. Try again." : null} empty={q.data?.length === 0} emptyTitle="No matching bookings" emptyDescription="Try a different reference, passenger, phone, route, status, or travel date." onRetry={() => void q.refetch()}>
      <div className="grid gap-3">{(q.data ?? []).map(item => <Link href={`/admin/bookings/${item.id}`} key={item.id} className="ticket-card block min-h-20 p-4 text-sm transition-colors hover:border-primary">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><strong>{item.bookingNumber}</strong><span className="text-muted-foreground"> · {item.routeLabel}</span><p className="mt-1 text-muted-foreground">{item.outbound ? `${formatDate(item.outbound.departAt)} ${formatTime(item.outbound.departAt)}` : "Departure unavailable"} · {item.contactFirstName} {item.contactLastName} · {item.contactPhone}</p></div><div className="flex flex-wrap items-center gap-2 sm:justify-end"><StatusBadge status={item.status} /><span className="tabular-nums">{item.passengerCount} traveler{item.passengerCount === 1 ? "" : "s"} · {moneyExact(item.amountCents)}</span></div></div>
      </Link>)}</div>
    </ResourceState></div>
  </div></PageShell>;
}

export function AdminBookingDetail() {
  const [, params] = useRoute("/admin/bookings/:id");
  const id = Number(params?.id);
  const utils = trpc.useUtils();
  const q = trpc.admin.booking.useQuery({ id }, { enabled: Number.isSafeInteger(id) && id > 0, retry: false });
  const refund = trpc.admin.refundBooking.useMutation({ onSuccess: async () => { await Promise.all([utils.admin.booking.invalidate(), utils.admin.bookings.invalidate(), utils.admin.payments.invalidate(), utils.admin.kpis.invalidate()]); toast.success("Refund request recorded; check Stripe status in Payments."); }, onError: error => toast.error(error.message) });
  const item = q.data;
  const canRefund = item?.status === "confirmed" && item.payments.some(payment => payment.status === "succeeded");
  return <PageShell><div className="metro-page metro-page--readable"><AdminNav />
    <Link href="/admin/bookings" className="metro-action-link mb-5">← All bookings</Link>
    <PageIntro eyebrow="Booking record" title={item?.bookingNumber ?? "Booking details"} description={item ? <>{item.passengerCount} passenger{item.passengerCount === 1 ? "" : "s"} · {moneyExact(item.amountCents)}</> : "Review the booking, traveler tickets, payment, and any eligible staff actions."} />
    <ResourceState loading={q.isLoading} error={q.error ? "Booking not found or access denied." : null} empty={!item} emptyTitle="Booking unavailable" onRetry={() => void q.refetch()}>
      {item ? <><section className="ticket-card p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="metro-section-title text-xl">Customer and payment</h2><p className="mt-2 text-sm">{item.contactFirstName} {item.contactLastName} · {item.contactPhone} · {item.contactEmail}</p></div><StatusBadge status={item.status} /></div>
        {item.refund ? <StatusNotice tone={item.refund.status === "failed" ? "error" : item.refund.status === "pending" ? "pending" : "success"} className="mt-4"><strong className="capitalize">Stripe refund {item.refund.status}</strong>{item.refund.status === "failed" ? " — staff must investigate the unsuccessful refund and contact the customer." : item.refund.status === "pending" ? " — do not claim money was returned until Stripe confirms." : " — Stripe confirmed."}</StatusNotice> : null}
        <div className="mt-4 grid gap-2">{item.payments.map(payment => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary p-3 text-sm"><span>Payment {payment.id} · <span className="capitalize">{payment.status}</span></span><span className="font-semibold tabular-nums">{moneyExact(payment.amountCents)}</span></div>)}</div>
      </section>
      {[{ label: "Outbound", trip: item.outbound, route: item.routeLabel }, { label: "Return", trip: item.returnTrip, route: item.returnRouteLabel }].filter(value => value.trip).map(value => <section key={value.label} className="ticket-card mt-4 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="metro-section-title text-xl">{value.label} · {value.route}</h2><p className="mt-1 text-sm text-muted-foreground">{value.trip ? formatDate(value.trip.departAt) : ""} · {value.trip ? formatTime(value.trip.departAt) : ""} → {value.trip ? formatTime(value.trip.arriveAt) : ""} · {value.trip?.status}</p></div>{value.trip ? <Link href={`/admin/trips/${value.trip.id}`} className="metro-action-link">Open trip manifest</Link> : null}</div>
        <ul className="mt-4 grid gap-2">{item.passengers.map(person => {
          const seat = value.label === "Outbound" ? person.seatNumber : person.returnSeatNumber;
          const ticket = item.digitalTickets.find(t => t.passengerId === person.id && t.departureId === value.trip?.id);
          return <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary p-3 text-sm"><span><strong>{person.firstName} {person.lastName}</strong> · {seat ? `Seat ${seat}` : "Unnumbered seat"} · {ticket?.status.replace("_", " ") ?? person.status.replace("_", " ")}</span>{ticket && ticket.status !== "voided" ? <Link href={`/ticket/${ticket.qrToken}`} className="metro-action-link">View QR ticket</Link> : null}</li>;
        })}</ul>
      </section>)}
      <div className="mt-6 flex flex-wrap gap-3">{canRefund && item.userId && !item.usedFreeReschedule ? <Link href={`/admin/bookings/${item.id}/reschedule`} className="metro-action-link metro-action-link--primary">Eligible member reschedule</Link> : null}
      {canRefund ? <Button variant="outline" className="min-h-11" disabled={refund.isPending} onClick={() => {
        const reason = window.prompt(`Refund the full payment for ${item.bookingNumber}? This voids every ticket and frees its seats. Enter the reason:`)?.trim();
        if (reason && reason.length >= 3 && window.confirm(`Confirm FULL Stripe refund for booking ${item.bookingNumber} (${moneyExact(item.amountCents)})?`)) refund.mutate({ bookingId: item.id, reason });
      }}>{refund.isPending ? "Processing refund…" : "Issue full refund"}</Button> : null}</div>
      {item.status === "pending_payment" ? <StatusNotice tone="pending" className="mt-5">Payment is not confirmed. No paid-ticket refund is available; this temporary seat hold expires automatically.</StatusNotice> : null}
      </> : null}
    </ResourceState>
  </div></PageShell>;
}

export function AdminPayments() {
  const q = trpc.admin.payments.useQuery();
  return <PageShell><div className="metro-page metro-page--wide"><AdminNav />
    <PageIntro eyebrow="Operations" title="Payments" description="Recorded ticket and subscription transactions. Stripe handles card details; no card numbers are stored here." />
    <ResourceState loading={q.isLoading} error={q.error ? "Payments could not be loaded." : null} empty={!q.data?.length} emptyTitle="No recorded payments yet" emptyDescription="Ticket and membership payments will be listed here when recorded." onRetry={() => void q.refetch()}>
      <div className="grid gap-3">{(q.data ?? []).map(payment => <article key={payment.id} className="ticket-card flex min-w-0 flex-wrap items-center justify-between gap-3 p-4 text-sm"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="capitalize">{payment.kind}</strong><StatusBadge status={payment.status} /></div>{payment.refundStatus ? <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-muted-foreground">Stripe refund</span><StatusBadge status={payment.refundStatus} />{payment.refundStatus === "failed" ? <span className="text-destructive">Review immediately</span> : payment.refundStatus === "pending" ? <span className="text-muted-foreground">Money not yet returned</span> : null}</div> : null}<p className="mt-2 text-muted-foreground">{formatDate(payment.createdAt)} · {payment.bookingNumber ? <Link href={`/admin/bookings/${payment.bookingId}`} className="font-semibold text-primary underline">{payment.bookingNumber}</Link> : "Membership payment"}{payment.customerName ? ` · ${payment.customerName}` : ""}</p>{payment.stripePaymentIntentId ? <p className="mt-1 break-all text-xs text-muted-foreground">Stripe reference: {payment.stripePaymentIntentId}</p> : null}</div><strong className="tabular-nums">{moneyExact(payment.amountCents)} {payment.currency.toUpperCase()}</strong></article>)}</div>
    </ResourceState>
  </div></PageShell>;
}

export function AdminSupport() {
  const q = trpc.admin.supportTickets.useQuery();
  const utils = trpc.useUtils();
  const resolve = trpc.admin.resolveSupport.useMutation({ onSuccess: async () => { await utils.admin.supportTickets.invalidate(); toast.success("Support request closed"); }, onError: error => toast.error(error.message) });
  return <PageShell><div className="metro-page metro-page--readable"><AdminNav />
    <PageIntro eyebrow="Operations" title="Support requests" description="Only requests submitted in customer accounts appear here; respond through the existing support process." />
    <ResourceState loading={q.isLoading} error={q.error ? "Requests could not be loaded." : null} empty={!q.data?.length} emptyTitle="No support requests yet" emptyDescription="New customer support requests will appear here." onRetry={() => void q.refetch()}>
      <div className="grid gap-3">{(q.data ?? []).map(item => <article key={item.id} className="ticket-card p-5 text-sm"><div className="flex flex-wrap items-start justify-between gap-3"><h2 className="font-semibold">{item.subject}</h2><div className="flex items-center gap-2"><StatusBadge status={item.status} /><span className="text-muted-foreground">{formatDate(item.createdAt)}</span></div></div><p className="mt-3 whitespace-pre-wrap leading-relaxed">{item.message}</p>{item.status === "open" ? <Button variant="outline" className="mt-4 min-h-11" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: item.id })}>Mark closed</Button> : null}</article>)}</div>
    </ResourceState>
  </div></PageShell>;
}
