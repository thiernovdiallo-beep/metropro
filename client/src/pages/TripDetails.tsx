import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { formatDateLong, formatTime, money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { tripDuration } from "./SearchResults";
import { useMemo } from "react";
import { Link, useSearch } from "wouter";

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
  return <PageShell><main className="container max-w-3xl py-10">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Your itinerary · Step 2</p>
    <h1 className="mt-2 font-serif text-3xl sm:text-4xl">Trip details</h1>
    <p className="mt-2 text-sm text-muted-foreground">{count} passenger{count === 1 ? "" : "s"} · Review your actual departures before choosing seats.</p>
    {outbound.isLoading || (returnId && inbound.isLoading) ? <p role="status" className="mt-6">Loading departure details…</p> : null}
    {outbound.error || inbound.error || !outboundId ? <div role="alert" className="ticket-card mt-6 p-5">This departure is no longer available. <Link href={back} className="font-semibold text-primary underline">Return to search results</Link>.</div> : null}
    {outbound.data ? <TripCard label="Outbound" trip={outbound.data} /> : null}
    {inbound.data ? <TripCard label="Return" trip={inbound.data} /> : null}
    {outbound.data && !canContinue ? <p role="alert" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">This itinerary no longer has enough seats for your group. Choose another departure.</p> : null}
    <div className="mt-7 flex flex-wrap gap-3">
      <Link href={back} className="inline-flex min-h-12 items-center rounded-lg border border-input px-5 text-sm font-semibold hover:bg-secondary">Back to results</Link>
      {canContinue ? <Link href={`/seats?${params}`} className="inline-flex min-h-12 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90">Continue to seat selection</Link> : <Button className="min-h-12" disabled>Continue to seat selection</Button>}
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
    <p className="text-xs font-semibold uppercase tracking-wider text-accent">{label} · {formatDateLong(trip.departAt)}</p>
    <h2 className="mt-2 font-serif text-2xl">{trip.origin?.name} → {trip.destination?.name}</h2>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <div><p className="text-xs uppercase text-muted-foreground">Departure · {formatTime(trip.departAt)}</p><p className="font-semibold">{trip.pickup?.label ?? trip.origin?.name}</p><p className="text-sm text-muted-foreground">{trip.pickup?.address}</p></div>
      <div><p className="text-xs uppercase text-muted-foreground">Arrival · {formatTime(trip.arriveAt)}</p><p className="font-semibold">{trip.dropoff?.label ?? trip.destination?.name}</p><p className="text-sm text-muted-foreground">{trip.dropoff?.address}</p></div>
    </div>
    <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-border pt-4 text-sm"><span>Travel time {tripDuration(trip.departAt, trip.arriveAt)} · {trip.vehicleCode ? `Service ${trip.vehicleCode}` : "Vehicle assignment pending"}</span><span>{trip.seatsRemaining} of {trip.capacity} seats available</span></div>
    <p className="mt-2 text-sm">Regular seat <strong>{money(trip.standardFareCents)}</strong> · Front passenger seat <strong>{money(trip.frontFareCents)}</strong></p>
  </section>;
}
