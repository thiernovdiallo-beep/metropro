import { PageShell, Wordmark } from "@/components/Brand";
import { ActionLink, PageIntro, ResourceState, StatusBadge, StatusNotice } from "@/components/MetroUI";
import { formatDateLong, formatTime, moneyExact } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { QRCodeSVG } from "qrcode.react";
import React, { useEffect } from "react";
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
        <main className="metro-page metro-page--readable">
          <PageIntro eyebrow="Metro Pro" title="Digital ticket" description="Keep your private ticket link available for boarding." />
          <ResourceState loading={query.isLoading} error={token && !query.isLoading ? "This ticket is unavailable. Use the private booking link or sign in to the account that owns it." : null} empty={!token} emptyTitle="Ticket link missing" emptyDescription="Use the digital-ticket link from your confirmed booking."><></></ResourceState>
          {!token ? <ActionLink href="/" back className="mt-5">Back to home</ActionLink> : null}
        </main>
      </PageShell>
    );
  }
  const { ticket, booking, passenger, trip } = data;
  const boardable = booking.status === "confirmed" && ticket.status !== "voided";
  return (
    <PageShell>
      <main className="metro-page metro-page--readable">
        <PageIntro eyebrow="Metro Pro" title="Digital ticket" description="Present this ticket and QR code when boarding." />
        <div className="mx-auto max-w-md">
          <article className="ticket-card overflow-hidden" aria-label="Digital boarding ticket">
            <div className="border-b border-border bg-gradient-to-r from-[#e6f6f9] to-white px-5 py-4 text-foreground">
              <Wordmark />
            </div>
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-serif text-2xl">
                {passenger.firstName} {passenger.lastName}
              </div><div className="mt-1 text-xs tracking-[0.2em] text-muted-foreground">{booking.bookingNumber}</div></div><StatusBadge status={ticket.status} /></div>
              <div className="text-lg font-semibold">
                {trip.origin?.name} → {trip.destination?.name}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{formatDateLong(trip.departAt)}</p>
                <div className="font-serif text-2xl">{formatTime(trip.departAt)} → {formatTime(trip.arriveAt)}</div>
              </div>
              <div className="text-sm leading-relaxed text-muted-foreground">
                Pickup {trip.pickup?.label}
                <br />
                Drop-off {trip.dropoff?.label}
              </div>
              <div className="grid gap-1 border-y border-border py-3 text-sm"><span>Passengers on booking: {booking.passengerCount}</span><span>Booking total paid: {moneyExact(booking.amountCents)}</span><strong className="text-primary">{data.seatNumber ? `Seat ${data.seatNumber}` : `Seat: ${ticket.seatType === "front" ? "Front passenger seat" : "Regular passenger seat"}`}</strong></div>
              {boardable ? <>
                <div className="flex justify-center py-3">
                  <QRCodeSVG value={ticket.qrToken} size={180} />
                </div>
                <p className="text-center text-xs leading-relaxed text-muted-foreground">Show this QR ticket when boarding. If the scanner cannot read it, give your driver this code:</p>
                <p className="break-all rounded-xl bg-secondary p-3 text-center font-mono text-sm font-semibold tracking-wide" aria-label="Ticket code">{ticket.qrToken}</p>
              </> : <StatusNotice tone="error">This ticket is not valid for boarding. Check your booking status or contact support.</StatusNotice>}
            </div>
          </article>
          {boardable ? <button type="button" className="ticket-print-actions mt-5 min-h-11 w-full rounded-xl border border-input bg-white px-4 py-2 text-sm font-semibold text-primary hover:bg-secondary" onClick={() => window.print()}>Print ticket / save as PDF</button> : null}
        </div>
      </main>
    </PageShell>
  );
}
