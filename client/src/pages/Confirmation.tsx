import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Link, useSearch } from "wouter";
import { useMemo } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Confirmation() {
  const search = useSearch();
  const bookingNumber = useMemo(() => new URLSearchParams(search).get("booking") ?? "", [search]);
  const accessToken = useMemo(() => {
    const token = new URLSearchParams(search).get("access");
    return token || sessionStorage.getItem(`metropro-guest:${bookingNumber}`) || undefined;
  }, [search, bookingNumber]);
  const { isAuthenticated } = useAuth();
  const query = trpc.booking.getByNumber.useQuery(
    { bookingNumber, accessToken },
    { enabled: Boolean(bookingNumber), refetchInterval: current => current.state.data?.booking?.status === "pending_payment" ? 2500 : false }
  );
  const booking = query.data?.booking;
  const tickets = query.data?.tickets ?? [];

  return (
    <PageShell>
      <div className="container max-w-xl py-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Payment</p>
        <h1 className="mt-2 font-serif text-3xl">
          {booking?.status === "confirmed" ? "You're booked" : booking?.status === "canceled" || booking?.status === "refunded" ? "Booking not confirmed" : "Confirming your payment"}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {booking?.status === "confirmed"
            ? `Booking ${booking.bookingNumber} is confirmed. Seats are now reserved.`
            : booking?.status === "canceled" || booking?.status === "refunded"
              ? "This booking did not complete. Any payment refund is handled through Stripe; please select another departure."
            : "Stripe is confirming your payment. This page updates automatically — returning here is not proof of payment until the ticket appears."}
        </p>
        {query.error ? <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-red-50 p-4 text-sm text-destructive">This private booking link is missing or invalid. Use the link from Stripe Checkout or contact support with your booking number.</p> : null}
        {tickets.length ? (
          <div className="mt-8 grid gap-2 text-left">
            <h2 className="font-serif text-xl">Your digital tickets</h2>
            {tickets.map(ticket => {
              const traveler = query.data?.passengers.find(p => p.id === ticket.passengerId);
              const leg = ticket.departureId === booking?.outboundDepartureId ? "Outbound" : "Return";
              return (
                <Link key={ticket.id} href={`/ticket/${ticket.qrToken}${accessToken ? `?access=${encodeURIComponent(accessToken)}` : ""}`}>
                  <Button className="h-auto min-h-12 w-full justify-start whitespace-normal text-left" variant="outline">
                    {leg} · {traveler?.firstName} {traveler?.lastName} · {ticket.seatType === "front" ? "Front seat" : "Regular seat"}
                  </Button>
                </Link>
              );
            })}
          </div>
        ) : isAuthenticated && !query.error ? (
          <Link href="/account">
            <Button className="mt-8 h-12" variant="outline">
              Go to my trips
            </Button>
          </Link>
        ) : null}
        {accessToken && booking ? (
          <div className="mt-6 rounded-xl border border-primary/20 bg-secondary p-4 text-sm text-left">
            <strong>Guest booking — save this private link.</strong> Anyone with it can see your trip details; do not post it publicly. Metro Pro does not yet email guest ticket links.
            <Button variant="outline" className="mt-3 w-full" onClick={async () => {
              try {
                const link = new URL(window.location.href);
                link.searchParams.delete("session_id");
                await navigator.clipboard.writeText(link.toString());
                toast.success("Private link copied");
              }
              catch { toast.error("Copy the page URL from your address bar"); }
            }}>Copy private booking link</Button>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
