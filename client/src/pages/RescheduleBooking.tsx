import { CustomerLayout } from "@/layouts/CustomerLayout";
import { AdminLayout } from "@/layouts/AdminLayout";
import { ActionLink, PageIntro, ResourceState, StatusNotice } from "@/components/MetroUI";
import SeatMap from "@/components/SeatMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateLong, formatTime, isoDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

type Route = { id: number; originCityId: number; destinationCityId: number };

export default function RescheduleBooking({ admin = false }: { admin?: boolean }) {
  const [, params] = useRoute(admin ? "/admin/bookings/:id/reschedule" : "/account/booking/:id/reschedule");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const validId = Number.isSafeInteger(id) && id > 0;
  const owner = trpc.account.booking.useQuery({ id }, { enabled: validId && !admin, retry: false });
  const staff = trpc.admin.booking.useQuery({ id }, { enabled: validId && admin, retry: false });
  const routes = trpc.admin.routes.useQuery(undefined, { enabled: admin });
  const settings = trpc.public.settings.useQuery();
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
  const cutoffHours = settings.data?.cancelCutoffHours ?? 24;
  const withinCutoff = Boolean(originalOut && originalOut.departAt.getTime() - Date.now() >= cutoffHours * 60 * 60 * 1000);
  const canChange = Boolean(booking && booking.status === "confirmed" && !booking.usedFreeReschedule && booking.userId && originalOut && withinCutoff);
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
  const Shell = admin ? AdminLayout : CustomerLayout;
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
  return <Shell><div className="metro-page metro-page--wide">
    <PageIntro eyebrow={admin ? "Operations booking" : "My booking"} title="Choose new departures and seats" description="Eligible active members have one complimentary MetroPro reschedule before the policy cutoff. Choose the same route and seat types, with a real available seat for every traveler. Your original tickets become invalid only after the replacement commits. All times are Eastern." actions={<ActionLink href={detailUrl} back>Back to booking</ActionLink>} />
    <ResourceState loading={owner.isLoading || staff.isLoading || admin && routes.isLoading || settings.isLoading} error={owner.error || staff.error ? "Booking not found or access denied." : null} empty={Boolean(booking && !canChange)} emptyTitle="Reschedule unavailable" emptyDescription={!withinCutoff && originalOut ? `Self-service rescheduling closes ${cutoffHours} hours before departure. Please contact support for assistance.` : "This booking is not eligible for another complimentary self-serve reschedule. Please contact support to discuss other options."}>
      {canChange && routeOut ? <div className="space-y-6">
        {!admin && originalOut ? <section className="ticket-card p-5 sm:p-6"><h2 className="font-serif text-xl">Current booking</h2><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Route:</span> {owner.data?.outbound?.origin?.name} → {owner.data?.outbound?.destination?.name}</p><p><span className="text-muted-foreground">Departure:</span> {formatDateLong(originalOut.departAt)} · {formatTime(originalOut.departAt)}</p><p className="sm:col-span-2"><span className="text-muted-foreground">Seats:</span> {owner.data?.passengers.map(passenger => `${passenger.firstName} ${passenger.lastName} · ${passenger.seatNumber ? `Seat ${passenger.seatNumber}` : "Assigned seat"}`).join(" · ")}</p></div><StatusNotice className="mt-4">Reschedule fee: $0 for this complimentary member benefit. Changes must be made at least {cutoffHours} hours before departure.</StatusNotice></section> : null}
        <section className="ticket-card p-5 sm:p-6"><h2 className="font-serif text-xl">Outbound · {passengerCount} traveler{passengerCount === 1 ? "" : "s"}</h2>
          <label className="metro-form-label mt-5 grid max-w-xs gap-2">New departure date (Eastern)<Input className="metro-control" type="date" min={isoDate()} value={outDate} onChange={event => { setOutDate(event.target.value); setNewOutId(null); setNewRetId(null); setOutSeats([]); setRetSeats([]); }} /></label>
          {outTrips.error ? <StatusNotice tone="error" className="mt-4">Departures could not be loaded. Try another date.</StatusNotice> : null}
          {outTrips.isLoading ? <ResourceState loading>{null}</ResourceState> : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{outOptions.map(trip => <button key={trip.id} type="button" aria-pressed={newOutId === trip.id} className={`ticket-card min-h-20 p-4 text-left text-sm transition-colors ${newOutId === trip.id ? "border-primary bg-secondary ring-2 ring-primary/35" : "hover:border-primary/60"}`} onClick={() => { setNewOutId(trip.id); setNewRetId(null); setOutSeats([]); setRetSeats([]); }}><strong>{formatDateLong(trip.departAt)} · {formatTime(trip.departAt)}</strong><span className="mt-1 block text-muted-foreground">{trip.seatsRemaining} available · {trip.vehicleCode ?? "Vehicle assignment pending"}</span></button>)}</div>
          {!outTrips.isLoading && !outTrips.error && !outOptions.length ? <StatusNotice className="mt-4">No eligible departures with enough seats on this date.</StatusNotice> : null}
        </section>
        {selectedOut ? <SeatMap departureId={selectedOut.id} passengerCount={passengerCount} selectedSeats={outSeats}
          onSeatSelect={(seat, index) => assign(outSeats, setOutSeats, seat, index)} onSeatDeselect={(_seat, index) => unassign(outSeats, setOutSeats, index)} /> : null}
        {originalRet && routeRet ? <section className="ticket-card p-5 sm:p-6"><h2 className="font-serif text-xl">Return trip</h2>
          <label className="metro-form-label mt-5 grid max-w-xs gap-2">New return date (Eastern)<Input className="metro-control" type="date" min={outDate} value={retDate} onChange={event => { setRetDate(event.target.value); setNewRetId(null); setRetSeats([]); }} /></label>
          {retTrips.error ? <StatusNotice tone="error" className="mt-4">Return departures could not be loaded.</StatusNotice> : null}
          {retTrips.isLoading ? <ResourceState loading>{null}</ResourceState> : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{retOptions.map(trip => <button key={trip.id} type="button" aria-pressed={newRetId === trip.id} className={`ticket-card min-h-20 p-4 text-left text-sm transition-colors ${newRetId === trip.id ? "border-primary bg-secondary ring-2 ring-primary/35" : "hover:border-primary/60"}`} onClick={() => { setNewRetId(trip.id); setRetSeats([]); }}><strong>{formatDateLong(trip.departAt)} · {formatTime(trip.departAt)}</strong><span className="mt-1 block text-muted-foreground">{trip.seatsRemaining} available</span></button>)}</div>
          {!retTrips.isLoading && !retTrips.error && !retOptions.length ? <StatusNotice className="mt-4">No eligible return departures after the selected outbound arrival.</StatusNotice> : null}
        </section> : null}
        {originalRet && selectedRet ? <SeatMap departureId={selectedRet.id} passengerCount={passengerCount} selectedSeats={retSeats}
          onSeatSelect={(seat, index) => assign(retSeats, setRetSeats, seat, index)} onSeatDeselect={(_seat, index) => unassign(retSeats, setRetSeats, index)} /> : null}
        <Button type="button" className="min-h-12 w-full" disabled={!ready || pending} onClick={submit}>{pending ? "Moving seats and tickets…" : "Confirm complimentary reschedule"}</Button>
        <p className="text-xs leading-relaxed text-muted-foreground">If a seat becomes unavailable, no inventory or ticket change is saved. No new card payment is taken for this eligible member benefit.</p>
      </div> : null}
    </ResourceState>
  </div></Shell>;
}
