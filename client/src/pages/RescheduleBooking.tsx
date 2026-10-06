import { PageShell } from "@/components/Brand";
import SeatMap from "@/components/SeatMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateLong, formatTime, isoDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation, useRoute } from "wouter";
import { AdminNav } from "./AdminPages";

type Route = { id: number; originCityId: number; destinationCityId: number };

export default function RescheduleBooking({ admin = false }: { admin?: boolean }) {
  const [, params] = useRoute(admin ? "/admin/bookings/:id/reschedule" : "/account/booking/:id/reschedule");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const validId = Number.isSafeInteger(id) && id > 0;
  const owner = trpc.account.booking.useQuery({ id }, { enabled: validId && !admin, retry: false });
  const staff = trpc.admin.booking.useQuery({ id }, { enabled: validId && admin, retry: false });
  const routes = trpc.admin.routes.useQuery(undefined, { enabled: admin });
  const booking = admin ? staff.data : owner.data?.booking;
  const originalOut = admin ? staff.data?.outbound : owner.data?.outbound;
  const originalRet = admin ? staff.data?.returnTrip : owner.data?.returnTrip;
  const routeOut: Route | undefined = admin ? routes.data?.find(route => route.id === originalOut?.routeId) : owner.data?.outbound?.route;
  const routeRet: Route | undefined = admin ? routes.data?.find(route => route.id === originalRet?.routeId) : owner.data?.returnTrip?.route;
  const passengerCount = booking?.passengerCount ?? 0;
  const [outDate, setOutDate] = useState(() => isoDate(new Date(Date.now() + 7 * 86_400_000)));
  const [retDate, setRetDate] = useState(() => isoDate(new Date(Date.now() + 10 * 86_400_000)));
  const [newOutId, setNewOutId] = useState<number | null>(null);
  const [newRetId, setNewRetId] = useState<number | null>(null);
  const [outSeats, setOutSeats] = useState<(string | null)[]>([]);
  const [retSeats, setRetSeats] = useState<(string | null)[]>([]);
  const outTrips = trpc.public.search.useQuery({ originCityId: routeOut?.originCityId ?? 0,
    destinationCityId: routeOut?.destinationCityId ?? 0, date: outDate, passengers: passengerCount },
    { enabled: Boolean(routeOut && passengerCount && outDate), retry: false });
  const retTrips = trpc.public.search.useQuery({ originCityId: routeRet?.originCityId ?? 0,
    destinationCityId: routeRet?.destinationCityId ?? 0, date: retDate, passengers: passengerCount },
    { enabled: Boolean(routeRet && passengerCount && retDate), retry: false });
  const outOptions = (outTrips.data ?? []).filter(trip => trip.routeId === routeOut?.id && trip.id !== originalOut?.id && !trip.soldOut);
  const selectedOut = outOptions.find(trip => trip.id === newOutId);
  const retOptions = (retTrips.data ?? []).filter(trip => trip.routeId === routeRet?.id && trip.id !== originalRet?.id && !trip.soldOut &&
    (!selectedOut || trip.departAt > selectedOut.arriveAt));
  const selectedRet = retOptions.find(trip => trip.id === newRetId);
  const canChange = Boolean(booking && booking.status === "confirmed" && !booking.usedFreeReschedule && booking.userId && originalOut);
  const ready = Boolean(canChange && selectedOut && (!originalRet || selectedRet) && outSeats.length === passengerCount && outSeats.every(Boolean) &&
    (!originalRet || retSeats.length === passengerCount && retSeats.every(Boolean)));
  const utils = trpc.useUtils();
  const ownerChange = trpc.account.reschedule.useMutation({ onSuccess: () => {
    void utils.account.booking.invalidate({ id }); toast.success("New seats and tickets are ready"); navigate(`/account/booking/${id}`);
  }, onError: error => toast.error(error.message) });
  const staffChange = trpc.admin.rescheduleBooking.useMutation({ onSuccess: () => {
    void utils.admin.booking.invalidate({ id }); toast.success("New seats and tickets are ready"); navigate(`/admin/bookings/${id}`);
  }, onError: error => toast.error(error.message) });
  const pending = ownerChange.isPending || staffChange.isPending;
  const detailUrl = admin ? `/admin/bookings/${id}` : `/account/booking/${id}`;
  const assign = (seats: (string | null)[], update: (value: (string | null)[]) => void, seat: string, index: number) => {
    const next = Array.from({ length: passengerCount }, (_, i) => seats[i] ?? null);
    next[index] = seat; update(next);
  };
  const unassign = (seats: (string | null)[], update: (value: (string | null)[]) => void, index: number) => {
    const next = Array.from({ length: passengerCount }, (_, i) => seats[i] ?? null);
    next[index] = null; update(next);
  };
  function submit() {
    if (!ready || !selectedOut) return;
    const input = { bookingId: id, newOutboundDepartureId: selectedOut.id, newReturnDepartureId: selectedRet?.id ?? null,
      outboundSeats: outSeats.filter((value): value is string => Boolean(value)),
      returnSeats: originalRet ? retSeats.filter((value): value is string => Boolean(value)) : null };
    if (admin) staffChange.mutate(input);
    else ownerChange.mutate(input);
  }
  return <PageShell><main className="container max-w-5xl py-8">
    {admin ? <AdminNav /> : null}
    <Link href={detailUrl} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">← Back to booking</Link>
    <h1 className="mt-4 font-serif text-3xl">Choose new departures and seats</h1>
    <p className="mt-2 text-sm text-muted-foreground">Eligible active members have one complimentary reschedule before the policy cutoff. Choose the same route and seat types, with a real available seat for every traveler. Your original tickets become invalid only after the replacement commits. All times are Eastern.</p>
    {(owner.isLoading || staff.isLoading || admin && routes.isLoading) ? <p role="status" className="mt-5">Loading your booking…</p> : null}
    {(owner.error || staff.error) ? <p role="alert" className="mt-5 text-destructive">Booking not found or access denied.</p> : null}
    {booking && !canChange ? <p role="alert" className="ticket-card mt-5 p-5 text-sm">This booking is not eligible for another complimentary self-serve reschedule. Please contact support to discuss other options.</p> : null}
    {canChange && routeOut ? <div className="mt-6 space-y-6">
      <section className="ticket-card p-5"><h2 className="font-serif text-xl">Outbound · {passengerCount} traveler{passengerCount === 1 ? "" : "s"}</h2>
        <label className="mt-4 grid max-w-xs gap-1 text-sm font-semibold">New departure date (Eastern)<Input type="date" min={isoDate()} value={outDate} onChange={event => { setOutDate(event.target.value); setNewOutId(null); setNewRetId(null); setOutSeats([]); setRetSeats([]); }} /></label>
        {outTrips.error ? <p role="alert" className="mt-3 text-sm text-destructive">Departures could not be loaded. Try another date.</p> : null}
        {outTrips.isLoading ? <p role="status" className="mt-3 text-sm">Checking departures…</p> : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{outOptions.map(trip => <button key={trip.id} type="button" aria-pressed={newOutId === trip.id} className={`min-h-16 rounded-xl border p-3 text-left text-sm ${newOutId === trip.id ? "border-blue-700 bg-blue-50 ring-2 ring-blue-500" : "border-border bg-white"}`} onClick={() => { setNewOutId(trip.id); setNewRetId(null); setOutSeats([]); setRetSeats([]); }}><strong>{formatDateLong(trip.departAt)} · {formatTime(trip.departAt)}</strong><span className="mt-1 block text-muted-foreground">{trip.seatsRemaining} available · {trip.vehicleCode ?? "Vehicle assignment pending"}</span></button>)}</div>
        {!outTrips.isLoading && !outTrips.error && !outOptions.length ? <p className="mt-3 text-sm text-muted-foreground">No eligible departures with enough seats on this date.</p> : null}
      </section>
      {selectedOut ? <SeatMap departureId={selectedOut.id} passengerCount={passengerCount} selectedSeats={outSeats}
        onSeatSelect={(seat, index) => assign(outSeats, setOutSeats, seat, index)} onSeatDeselect={(_seat, index) => unassign(outSeats, setOutSeats, index)} /> : null}
      {originalRet && routeRet ? <section className="ticket-card p-5"><h2 className="font-serif text-xl">Return trip</h2>
        <label className="mt-4 grid max-w-xs gap-1 text-sm font-semibold">New return date (Eastern)<Input type="date" min={outDate} value={retDate} onChange={event => { setRetDate(event.target.value); setNewRetId(null); setRetSeats([]); }} /></label>
        {retTrips.error ? <p role="alert" className="mt-3 text-sm text-destructive">Return departures could not be loaded.</p> : null}
        {retTrips.isLoading ? <p role="status" className="mt-3 text-sm">Checking return departures…</p> : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{retOptions.map(trip => <button key={trip.id} type="button" aria-pressed={newRetId === trip.id} className={`min-h-16 rounded-xl border p-3 text-left text-sm ${newRetId === trip.id ? "border-blue-700 bg-blue-50 ring-2 ring-blue-500" : "border-border bg-white"}`} onClick={() => { setNewRetId(trip.id); setRetSeats([]); }}><strong>{formatDateLong(trip.departAt)} · {formatTime(trip.departAt)}</strong><span className="mt-1 block text-muted-foreground">{trip.seatsRemaining} available</span></button>)}</div>
        {!retTrips.isLoading && !retTrips.error && !retOptions.length ? <p className="mt-3 text-sm text-muted-foreground">No eligible return departures after the selected outbound arrival.</p> : null}
      </section> : null}
      {originalRet && selectedRet ? <SeatMap departureId={selectedRet.id} passengerCount={passengerCount} selectedSeats={retSeats}
        onSeatSelect={(seat, index) => assign(retSeats, setRetSeats, seat, index)} onSeatDeselect={(_seat, index) => unassign(retSeats, setRetSeats, index)} /> : null}
      <Button type="button" className="min-h-12 w-full" disabled={!ready || pending} onClick={submit}>{pending ? "Moving seats and tickets…" : "Confirm complimentary reschedule"}</Button>
      <p className="text-xs text-muted-foreground">If a seat becomes unavailable, no inventory or ticket change is saved. No new card payment is taken for this eligible member benefit.</p>
    </div> : null}
  </main></PageShell>;
}
