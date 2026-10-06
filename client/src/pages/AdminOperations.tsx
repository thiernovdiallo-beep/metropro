import { PageShell } from "@/components/Brand";
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
  return <PageShell><main className="container py-8"><AdminNav /><p className="text-xs font-semibold uppercase tracking-wider text-accent">Reservations</p><h1 className="mt-1 font-serif text-3xl">Bookings</h1>
    <form className="ticket-card mt-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={event => { event.preventDefault(); setFilters({ query: term.trim() || undefined, status: status || undefined, date: date || undefined }); }}>
      <label className="grid gap-1 text-sm font-semibold">Reference, passenger, phone or route<Input className="h-11" value={term} onChange={event => setTerm(event.target.value)} placeholder="Search bookings" maxLength={80} /></label>
      <label className="grid gap-1 text-sm font-semibold">Status<select className="h-11 rounded-md border border-input bg-white px-3" value={status} onChange={event => setStatus(event.target.value as BookingStatus | "")}><option value="">All statuses</option><option value="pending_payment">Pending</option><option value="confirmed">Confirmed</option><option value="canceled">Canceled</option><option value="refunded">Refunded</option></select></label>
      <label className="grid gap-1 text-sm font-semibold">Travel date<Input className="h-11" type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <Button type="submit" className="min-h-11 self-end">Search</Button>
    </form>
    <p className="mt-4 text-xs text-muted-foreground">Showing up to 100 most recent matching reservations. Search narrows real booking and passenger records.</p>
    {q.isLoading ? <p role="status" className="mt-4">Loading bookings…</p> : null}{q.error ? <p role="alert" className="mt-4 text-destructive">Bookings could not be loaded. Try again.</p> : null}
    <div className="mt-4 grid gap-3">{(q.data ?? []).map(item => <Link href={`/admin/bookings/${item.id}`} key={item.id} className="ticket-card block min-h-16 p-4 text-sm hover:border-primary">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{item.bookingNumber}</strong> · {item.routeLabel}<p className="mt-1 text-muted-foreground">{item.outbound ? `${formatDate(item.outbound.departAt)} ${formatTime(item.outbound.departAt)}` : "Departure unavailable"} · {item.contactFirstName} {item.contactLastName} · {item.contactPhone}</p></div><div className="text-right"><p className="font-semibold capitalize">{item.status.replace("_", " ")}</p><p>{item.passengerCount} traveler{item.passengerCount === 1 ? "" : "s"} · {moneyExact(item.amountCents)}</p></div></div>
    </Link>)}{!q.isLoading && !q.error && q.data?.length === 0 ? <p className="ticket-card p-5 text-sm">No bookings match these filters.</p> : null}</div>
  </main></PageShell>;
}

export function AdminBookingDetail() {
  const [, params] = useRoute("/admin/bookings/:id");
  const id = Number(params?.id);
  const utils = trpc.useUtils();
  const q = trpc.admin.booking.useQuery({ id }, { enabled: Number.isSafeInteger(id) && id > 0, retry: false });
  const refund = trpc.admin.refundBooking.useMutation({ onSuccess: async () => { await Promise.all([utils.admin.booking.invalidate(), utils.admin.bookings.invalidate(), utils.admin.payments.invalidate(), utils.admin.kpis.invalidate()]); toast.success("Refund request recorded; check Stripe status in Payments."); }, onError: error => toast.error(error.message) });
  const item = q.data;
  const canRefund = item?.status === "confirmed" && item.payments.some(payment => payment.status === "succeeded");
  return <PageShell><main className="container max-w-4xl py-8"><AdminNav /><Link href="/admin/bookings" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">← All bookings</Link>
    {q.isLoading ? <p role="status" className="mt-5">Loading booking…</p> : null}{q.error ? <p role="alert" className="mt-5">Booking not found or access denied.</p> : null}
    {item ? <><div className="ticket-card mt-4 p-5 sm:p-7"><p className="text-xs font-semibold uppercase tracking-wider text-accent">Booking record</p><h1 className="mt-1 font-serif text-3xl">{item.bookingNumber}</h1>
      <p className="mt-2 text-sm capitalize">{item.status.replace("_", " ")} · {item.passengerCount} passenger{item.passengerCount === 1 ? "" : "s"} · {moneyExact(item.amountCents)}</p>
      {item.refund ? <p role="status" className={`mt-2 rounded-lg p-3 text-sm ${item.refund.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-secondary"}`}><strong className="capitalize">Stripe refund {item.refund.status}</strong>{item.refund.status === "failed" ? " — staff must investigate the unsuccessful refund and contact the customer." : item.refund.status === "pending" ? " — do not claim money was returned until Stripe confirms." : " — Stripe confirmed."}</p> : null}
      <p className="mt-2 text-sm">{item.contactFirstName} {item.contactLastName} · {item.contactPhone} · {item.contactEmail}</p>
      {item.payments.map(payment => <p key={payment.id} className="mt-2 text-sm">Payment {payment.id} · <span className="capitalize">{payment.status}</span> · {moneyExact(payment.amountCents)}</p>)}
    </div>
      {[{ label: "Outbound", trip: item.outbound, route: item.routeLabel }, { label: "Return", trip: item.returnTrip, route: item.returnRouteLabel }].filter(value => value.trip).map(value => <section key={value.label} className="ticket-card mt-4 p-5"><h2 className="font-serif text-xl">{value.label} · {value.route}</h2><p className="mt-1 text-sm">{value.trip ? formatDate(value.trip.departAt) : ""} · {value.trip ? formatTime(value.trip.departAt) : ""} → {value.trip ? formatTime(value.trip.arriveAt) : ""} · {value.trip?.status}</p>
        {value.trip ? <Link href={`/admin/trips/${value.trip.id}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Open trip manifest</Link> : null}
        <ul className="mt-3 grid gap-2">{item.passengers.map(person => {
          const seat = value.label === "Outbound" ? person.seatNumber : person.returnSeatNumber;
          const ticket = item.digitalTickets.find(t => t.passengerId === person.id && t.departureId === value.trip?.id);
          return <li key={person.id} className="rounded-lg bg-secondary p-3 text-sm">{person.firstName} {person.lastName} · {seat ? `Seat ${seat}` : "Unnumbered seat"} · {ticket?.status.replace("_", " ") ?? person.status.replace("_", " ")}{ticket && ticket.status !== "voided" ? <Link href={`/ticket/${ticket.qrToken}`} className="ml-3 inline-flex min-h-11 items-center font-semibold text-primary underline">View QR ticket</Link> : null}</li>;
        })}</ul>
      </section>)}
      {canRefund && item.userId && !item.usedFreeReschedule ? <Link href={`/admin/bookings/${item.id}/reschedule`} className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">Eligible member reschedule</Link> : null}
      {canRefund ? <Button variant="outline" className="mt-6 min-h-11" disabled={refund.isPending} onClick={() => {
        const reason = window.prompt(`Refund the full payment for ${item.bookingNumber}? This voids every ticket and frees its seats. Enter the reason:`)?.trim();
        if (reason && reason.length >= 3 && window.confirm(`Confirm FULL Stripe refund for booking ${item.bookingNumber} (${moneyExact(item.amountCents)})?`)) refund.mutate({ bookingId: item.id, reason });
      }}>{refund.isPending ? "Processing refund…" : "Issue full refund"}</Button> : null}
      {item.status === "pending_payment" ? <p className="mt-5 text-sm text-muted-foreground">Payment is not confirmed. No paid-ticket refund is available; this temporary seat hold expires automatically.</p> : null}
    </> : null}
  </main></PageShell>;
}

export function AdminPayments() {
  const q = trpc.admin.payments.useQuery();
  return <PageShell><main className="container py-8"><AdminNav /><h1 className="font-serif text-3xl">Payments</h1><p className="mt-2 text-sm text-muted-foreground">Recorded ticket and subscription transactions. Stripe handles card details; no card numbers are stored here.</p>
    {q.isLoading ? <p role="status" className="mt-5">Loading payments…</p> : null}{q.error ? <p role="alert" className="mt-5">Payments could not be loaded.</p> : null}
    <div className="mt-5 grid gap-3">{(q.data ?? []).map(payment => <div key={payment.id} className="ticket-card flex min-w-0 flex-wrap items-center justify-between gap-3 p-4 text-sm"><div><p className="font-semibold capitalize">{payment.kind} · {payment.status}</p>{payment.refundStatus ? <p className={`mt-1 font-semibold capitalize ${payment.refundStatus === "failed" ? "text-destructive" : "text-primary"}`}>Stripe refund: {payment.refundStatus}{payment.refundStatus === "failed" ? " — review immediately" : payment.refundStatus === "pending" ? " — money not yet returned" : ""}</p> : null}<p className="text-muted-foreground">{formatDate(payment.createdAt)} · {payment.bookingNumber ? <Link href={`/admin/bookings/${payment.bookingId}`} className="font-semibold text-primary underline">{payment.bookingNumber}</Link> : "Membership payment"}{payment.customerName ? ` · ${payment.customerName}` : ""}</p>{payment.stripePaymentIntentId ? <p className="mt-1 break-all text-xs text-muted-foreground">Stripe reference: {payment.stripePaymentIntentId}</p> : null}</div><strong>{moneyExact(payment.amountCents)} {payment.currency.toUpperCase()}</strong></div>)}{!q.isLoading && !q.data?.length ? <p className="ticket-card p-5 text-sm text-muted-foreground">No recorded payments yet.</p> : null}</div>
  </main></PageShell>;
}

export function AdminSupport() {
  const q = trpc.admin.supportTickets.useQuery();
  const utils = trpc.useUtils();
  const resolve = trpc.admin.resolveSupport.useMutation({ onSuccess: async () => { await utils.admin.supportTickets.invalidate(); toast.success("Support request closed"); }, onError: error => toast.error(error.message) });
  return <PageShell><main className="container max-w-4xl py-8"><AdminNav /><h1 className="font-serif text-3xl">Support requests</h1><p className="mt-2 text-sm text-muted-foreground">Only requests submitted in customer accounts appear here; responses must be handled through your existing support process.</p>
    {q.isLoading ? <p role="status" className="mt-5">Loading support requests…</p> : null}{q.error ? <p role="alert" className="mt-5">Requests could not be loaded.</p> : null}
    <div className="mt-5 grid gap-3">{(q.data ?? []).map(item => <article key={item.id} className="ticket-card p-5 text-sm"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{item.subject}</h2><span className="capitalize">{item.status} · {formatDate(item.createdAt)}</span></div><p className="mt-2 whitespace-pre-wrap">{item.message}</p>{item.status === "open" ? <Button variant="outline" className="mt-4 min-h-11" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: item.id })}>Mark closed</Button> : null}</article>)}{!q.isLoading && !q.data?.length ? <p className="ticket-card p-5 text-sm text-muted-foreground">No support requests yet.</p> : null}</div>
  </main></PageShell>;
}
