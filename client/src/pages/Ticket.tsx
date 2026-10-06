import { PageShell, Wordmark } from "@/components/Brand";
import { formatDateLong, formatTime, moneyExact } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { QRCodeSVG } from "qrcode.react";
import { useEffect } from "react";
import { useRoute, useSearch } from "wouter";

export default function Ticket() {
  const [, params] = useRoute("/ticket/:token");
  const token = params?.token ?? "";
  const search = useSearch();
  const accessToken = new URLSearchParams(search).get("access") ?? undefined;
  const printRequested = new URLSearchParams(search).get("print") === "1";
  const query = trpc.account.ticketByToken.useQuery({ token, accessToken }, { enabled: Boolean(token) });
  const data = query.data;
  const canPrint = data?.booking?.status === "confirmed" && data?.ticket?.status !== "voided";
  useEffect(() => {
    if (!printRequested || !canPrint) return;
    const timer = window.setTimeout(() => window.print(), 700);
    return () => window.clearTimeout(timer);
  }, [printRequested, canPrint]);
  if (!data?.ticket || !data.booking || !data.passenger || !data.trip) {
    return (
      <PageShell>
        <div className="container py-16">{query.error ? "A private booking link or member sign-in is needed to open this ticket." : "Loading ticket…"}</div>
      </PageShell>
    );
  }
  const { ticket, booking, passenger, trip } = data;
  const boardable = booking.status === "confirmed" && ticket.status !== "voided";
  return (
    <PageShell>
      <div className="container max-w-md py-10">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <div className="border-b border-border bg-gradient-to-r from-[#e6f6f9] to-white px-5 py-4 text-foreground">
            <Wordmark />
          </div>
          <div className="space-y-3 p-5">
            <div className="font-serif text-2xl">
              {passenger.firstName} {passenger.lastName}
            </div>
            <div className="text-xs tracking-[0.2em] text-muted-foreground">{booking.bookingNumber}</div>
            <div className="text-lg font-semibold">
              {trip.origin?.name} → {trip.destination?.name}
            </div>
            <div>
              {formatDateLong(trip.departAt)}
              <div className="text-2xl">{formatTime(trip.departAt)} → {formatTime(trip.arriveAt)}</div>
            </div>
            <div className="text-sm text-muted-foreground">
              Pickup {trip.pickup?.label}
              <br />
              Drop-off {trip.dropoff?.label}
            </div>
            <div className="text-sm">Passengers on booking: {booking.passengerCount}</div>
            <div className="text-sm">Booking total paid: {moneyExact(booking.amountCents)}</div>
            <div className="text-sm font-semibold text-primary">{data.seatNumber ? `Seat ${data.seatNumber}` : `Seat: ${ticket.seatType === "front" ? "Front passenger seat" : "Regular passenger seat"}`}</div>
            <div className="inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              {ticket.status.replace("_", " ")}
            </div>
            {boardable ? <>
              <div className="flex justify-center py-4">
                <QRCodeSVG value={ticket.qrToken} size={180} />
              </div>
              <p className="text-center text-xs text-muted-foreground">Show this QR ticket when boarding. If the scanner cannot read it, give your driver this code:</p>
              <p className="break-all rounded-lg bg-secondary p-3 text-center font-mono text-sm font-semibold tracking-wide" aria-label="Ticket code">{ticket.qrToken}</p>
            </> : <p className="rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">This ticket is not valid for boarding. Check your booking status or contact support.</p>}
          </div>
        </div>
        {boardable ? <button type="button" className="ticket-print-actions mt-5 min-h-11 w-full rounded-lg border border-input bg-white px-4 py-2 text-sm font-semibold text-primary hover:bg-secondary" onClick={() => window.print()}>Print ticket / save as PDF</button> : null}
      </div>
    </PageShell>
  );
}
