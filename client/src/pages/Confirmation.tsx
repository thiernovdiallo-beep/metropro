import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Link, useSearch } from "wouter";
import { useMemo } from "react";

export default function Confirmation() {
  const search = useSearch();
  const bookingNumber = useMemo(() => new URLSearchParams(search).get("booking") ?? "", [search]);
  const query = trpc.booking.getByNumber.useQuery(
    { bookingNumber },
    { enabled: Boolean(bookingNumber), refetchInterval: 2500 }
  );
  const booking = query.data?.booking;
  const ticket = query.data?.tickets?.[0];

  return (
    <PageShell>
      <div className="container max-w-xl py-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Payment</p>
        <h1 className="mt-2 font-serif text-3xl">
          {booking?.status === "confirmed" ? "You're booked" : "Confirming your payment"}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {booking?.status === "confirmed"
            ? `Booking ${booking.bookingNumber} is confirmed. Seats are now reserved.`
            : "Stripe is confirming your payment. This page updates automatically — returning here is not proof of payment until the ticket appears."}
        </p>
        {ticket ? (
          <Link href={`/ticket/${ticket.qrToken}`}>
            <Button className="mt-8 h-12">Open digital ticket</Button>
          </Link>
        ) : (
          <Link href="/account">
            <Button className="mt-8 h-12" variant="outline">
              Go to my trips
            </Button>
          </Link>
        )}
      </div>
    </PageShell>
  );
}
