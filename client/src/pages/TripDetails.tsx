import { PageShell } from "@/components/Brand";
import { ActionLink, BookingProgress, PageIntro, ResourceState, StatusBadge, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { formatDateLong, formatTime, money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { tripDuration } from "./SearchResults";
import { useMemo } from "react";
import { useSearch } from "wouter";

export default function TripDetails() {
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const outboundId = Number(params.get("out"));
  const returnId = Number(params.get("ret"));
  const count = Number(params.get("pax") ?? 1);
  const outbound = trpc.public.departure.useQuery({ id: outboundId }, { enabled: outboundId > 0 });
  const inbound = trpc.public.departure.useQuery({ id: returnId }, { enabled: returnId > 0 });
  const back = params.get("search") ? `/search?${params.get("search")}` : "/";
  const canContinue = outbound.data && (!returnId || inbound.data) && count >= 1 && count <= 12 &&
    outbound.data.seatsRemaining >= count && [outbound.data, ...(returnId ? [inbound.data] : [])].every(trip => trip && trip.seatsRemaining >= count && ["scheduled", "boarding", "delayed"].includes(trip.status));
  const loading = outbound.isLoading || (returnId && inbound.isLoading);
  return <PageShell><main className="metro-page metro-page--readable">
    <BookingProgress current="Trip" />
    <PageIntro eyebrow="Your itinerary · Step 2" title="Trip details" description={`${count} passenger${count === 1 ? "" : "s"} · Review your actual departures before choosing seats.`} />
    {loading ? <ResourceState loading>Loading departure details…</ResourceState> : null}
    {outbound.error || inbound.error || !outboundId ? <StatusNotice tone="error" className="mt-6">This departure is no longer available. <ActionLink href={back} back className="ml-2 align-middle">Return to search results</ActionLink></StatusNotice> : null}
    {outbound.data ? <TripCard label="Outbound" trip={outbound.data} /> : null}
    {inbound.data ? <TripCard label="Return" trip={inbound.data} /> : null}
    {outbound.data && !canContinue ? <StatusNotice tone="pending" className="mt-5">This itinerary no longer has enough seats for your group. Choose another departure.</StatusNotice> : null}
    <div className="mt-7 flex flex-wrap gap-3">
      <ActionLink href={back} back>Back to results</ActionLink>
      {canContinue ? <ActionLink href={`/seats?${params}`} variant="primary">Continue to seat selection</ActionLink> : <Button className="min-h-11" disabled>Continue to seat selection</Button>}
    </div>
  </main></PageShell>;
}

function TripCard({ label, trip }: { label: string; trip: {
  id: number; departAt: Date; arriveAt: Date; vehicleCode: string | null;
  origin: { name: string } | null; destination: { name: string } | null;
  pickup: { label: string; address: string } | null; dropoff: { label: string; address: string } | null;
  standardFareCents: number; frontFareCents: number; seatsRemaining: number; capacity: number;
} }) {
  return <section className="ticket-card mt-6 p-5 sm:p-7" aria-label={`${label} trip`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="metro-eyebrow mb-0">{label} · {formatDateLong(trip.departAt)}</p><StatusBadge status={trip.seatsRemaining ? "available" : "canceled"} label={trip.seatsRemaining ? `${trip.seatsRemaining} of ${trip.capacity} seats available` : "No seats available"} /></div>
    <h2 className="mt-3 font-serif text-2xl">{trip.origin?.name} → {trip.destination?.name}</h2>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Departure · {formatTime(trip.departAt)}</p><p className="mt-1 font-semibold">{trip.pickup?.label ?? trip.origin?.name}</p><p className="text-sm text-muted-foreground">{trip.pickup?.address}</p></div>
      <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Arrival · {formatTime(trip.arriveAt)}</p><p className="mt-1 font-semibold">{trip.dropoff?.label ?? trip.destination?.name}</p><p className="text-sm text-muted-foreground">{trip.dropoff?.address}</p></div>
    </div>
    <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-border pt-4 text-sm"><span>Travel time {tripDuration(trip.departAt, trip.arriveAt)} · {trip.vehicleCode ? `Service ${trip.vehicleCode}` : "Vehicle assignment pending"}</span><span>{trip.seatsRemaining} of {trip.capacity} seats available</span></div>
    <p className="mt-3 text-sm">Regular seat <strong>{money(trip.standardFareCents)}</strong> · Front passenger seat <strong>{money(trip.frontFareCents)}</strong></p>
  </section>;
}
