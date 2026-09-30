import { PageShell, Wordmark } from "@/components/Brand";
import { formatDateLong, formatTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { QRCodeSVG } from "qrcode.react";
import { useRoute } from "wouter";

export default function Ticket() {
  const [, params] = useRoute("/ticket/:token");
  const token = params?.token ?? "";
  const query = trpc.account.ticketByToken.useQuery({ token }, { enabled: Boolean(token) });
  const data = query.data;
  if (!data?.ticket || !data.booking || !data.passenger || !data.trip) {
    return (
      <PageShell>
        <div className="container py-16">Loading ticket…</div>
      </PageShell>
    );
  }
  const { ticket, booking, passenger, trip } = data;
  return (
    <PageShell>
      <div className="container max-w-md py-10">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <div className="bg-primary px-5 py-4 text-primary-foreground">
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
              <div className="text-2xl">{formatTime(trip.departAt)}</div>
            </div>
            <div className="text-sm text-muted-foreground">
              Pickup {trip.pickup?.label}
              <br />
              Drop-off {trip.dropoff?.label}
            </div>
            <div className="text-sm">Passengers on booking: {booking.passengerCount}</div>
            <div className="inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              {ticket.status.replace("_", " ")}
            </div>
            <div className="flex justify-center py-4">
              <QRCodeSVG value={ticket.qrToken} size={180} />
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
