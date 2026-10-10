import { CustomerLayout } from "@/layouts/CustomerLayout";
import { BookingProgress, PageIntro, ResourceState, StatusBadge, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatTime, isoDate, money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import type { MapMarker } from "@/components/Map";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";

const LazyMapView = lazy(() => import("@/components/Map").then(module => ({ default: module.MapView })));

type Departure = {
  id: number; departAt: Date; arriveAt: Date; seatsRemaining: number;
  standardSeatsRemaining: number; frontSeatAvailable: boolean; soldOut: boolean;
  standardFareCents: number; memberFareCents: number; frontFareCents: number;
  pickup?: { label: string } | null; dropoff?: { label: string } | null;
  origin?: { name: string; state?: string } | null; destination?: { name: string; state?: string } | null;
  originCoordinates?: { lat: number; lng: number } | null;
  destinationCoordinates?: { lat: number; lng: number } | null;
  pickupCoordinates?: { lat: number; lng: number } | null;
  dropoffCoordinates?: { lat: number; lng: number } | null;
  stops?: Array<{
    id?: number;
    label?: string;
    address?: string;
    cityId?: number;
    sequence: number;
    pickupAllowed: boolean;
    dropoffAllowed: boolean;
    coordinates?: { lat: number; lng: number } | null;
  }>;
  vehicleCode?: string | null; memberEarlyAccess: boolean;
};

export function tripDuration(depart: Date | string, arrive: Date | string) {
  const minutes = Math.round((new Date(arrive).getTime() - new Date(depart).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h${remaining ? ` ${remaining}m` : ""}`;
}

export function searchUrl(input: { origin: number; dest: number; date: string; pax: number; type: string; returnDate?: string | null }) {
  const q = new URLSearchParams({ origin: String(input.origin), dest: String(input.dest), date: input.date, pax: String(input.pax), type: input.type });
  if (input.type === "round_trip" && input.returnDate) q.set("return", input.returnDate);
  return `/search?${q}`;
}

export default function SearchResults() {
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const [, setLocation] = useLocation();
  const origin = Number(params.get("origin"));
  const dest = Number(params.get("dest"));
  const date = params.get("date") ?? "";
  const returnDate = params.get("return");
  const pax = Number(params.get("pax") ?? 1);
  const type = params.get("type") === "round_trip" ? "round_trip" : "one_way";
  const valid = origin > 0 && dest > 0 && origin !== dest && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isInteger(pax) && pax >= 1 && pax <= 11 &&
    (type !== "round_trip" || Boolean(returnDate && /^\d{4}-\d{2}-\d{2}$/.test(returnDate) && returnDate >= date));
  const { user } = useAuth();
  const memberQ = trpc.account.overview.useQuery(undefined, { enabled: Boolean(user) });
  const isMember = memberQ.data?.memberFareEligible ?? false;
  const routes = trpc.public.routes.useQuery();
  const outbound = trpc.public.search.useQuery(
    { originCityId: origin, destinationCityId: dest, date, passengers: pax, isMember },
    { enabled: valid }
  );
  const inbound = trpc.public.search.useQuery(
    { originCityId: dest, destinationCityId: origin, date: returnDate ?? "", passengers: pax, isMember },
    { enabled: valid && type === "round_trip" }
  );
  const [outId, setOutId] = useState<number | null>(null);
  const [inId, setInId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [from, setFrom] = useState(origin);
  const [to, setTo] = useState(dest);
  const [travelDate, setTravelDate] = useState(date);
  const [backDate, setBackDate] = useState(returnDate ?? "");
  const [travelers, setTravelers] = useState(pax);
  const [tripType, setTripType] = useState(type);
  useEffect(() => { setOutId(null); setInId(null); }, [origin, dest, date, returnDate, pax, type]);
  useEffect(() => {
    setFrom(origin); setTo(dest); setTravelDate(date); setBackDate(returnDate ?? ""); setTravelers(pax); setTripType(type);
  }, [origin, dest, date, returnDate, pax, type]);
  const routeOptions = routes.data ?? [];
  const cityName = (id: number) => routeOptions.find(r => r.originCityId === id)?.origin?.name ?? routeOptions.find(r => r.destinationCityId === id)?.destination?.name ?? "—";
  const origins = [...new Map(routeOptions.map(r => [r.originCityId, r.origin])).entries()];
  const destinations = routeOptions.filter(r => r.originCityId === from);
  const selectedOutbound = outbound.data?.find(d => d.id === outId);
  const eligibleReturns = selectedOutbound ? inbound.data?.filter(d => d.departAt > selectedOutbound.arriveAt) : [];
  const selectedReturn = eligibleReturns?.find(d => d.id === inId);
  const mapMarkers = useMemo<MapMarker[]>(() => {
    const first = outbound.data?.[0];
    if (!first) return [];
    const stopMarkers = (first.stops ?? []).map(stop => stop.coordinates ? {
      ...stop.coordinates,
      label: stop.label ?? `Stop ${stop.sequence}`,
      pickupDropoff: stop.pickupAllowed && stop.dropoffAllowed ? "Pickup and drop-off available" : "Scheduled stop",
      type: "stop" as const,
    } : null);
    return ([
      first.originCoordinates && { ...first.originCoordinates, label: first.origin?.name ?? "Origin", city: first.origin?.name, region: first.origin?.state, type: "origin" as const },
      ...stopMarkers,
      first.destinationCoordinates && { ...first.destinationCoordinates, label: first.destination?.name ?? "Destination", city: first.destination?.name, region: first.destination?.state, type: "destination" as const },
    ] as (MapMarker | null)[]).filter((marker): marker is MapMarker => Boolean(marker));
  }, [outbound.data]);

  function chooseTrip(out: number, ret: number | null) {
    const q = new URLSearchParams({ out: String(out), pax: String(pax), type, search: params.toString() });
    if (ret) q.set("ret", String(ret));
    setLocation(`/trip?${q}`);
  }

  return <CustomerLayout><main className="metro-page metro-page--wide">
    <BookingProgress current="Search" />
    <PageIntro eyebrow="Find your departure" title={`${cityName(origin)} → ${cityName(dest)}`}
      description={<>{date ? formatDate(date) : "Choose a date"} · {pax} passenger{pax === 1 ? "" : "s"}{type === "round_trip" && returnDate ? ` · Return ${formatDate(returnDate)}` : ""}</>}
      actions={<Button variant="outline" className="min-h-11" onClick={() => setEditing(value => !value)} aria-expanded={editing} aria-controls="modify-search">Modify search</Button>} />
    {editing ? <form id="modify-search" className="ticket-card grid min-w-0 gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4" onSubmit={event => {
      event.preventDefault();
      if (!destinations.some(route => route.destinationCityId === to) || !travelDate || travelers < 1 || travelers > 11 || (tripType === "round_trip" && (!backDate || backDate < travelDate))) return;
      setLocation(searchUrl({ origin: from, dest: to, date: travelDate, pax: travelers, type: tripType, returnDate: backDate }));
      setEditing(false);
    }}>
      <label className="grid min-w-0 gap-2"><span className="metro-form-label">Departure</span><select className="metro-control" value={from} onChange={event => { const id = Number(event.target.value); setFrom(id); setTo(routeOptions.find(route => route.originCityId === id)?.destinationCityId ?? 0); }}>
        {origins.map(([id, city]) => <option key={id} value={id}>{city?.name}</option>)}
      </select></label>
      <label className="grid min-w-0 gap-2"><span className="metro-form-label">Destination</span><select className="metro-control" value={to} onChange={event => setTo(Number(event.target.value))}>
        {destinations.map(route => <option key={route.id} value={route.destinationCityId}>{route.destination?.name}</option>)}
      </select></label>
      <label className="grid min-w-0 gap-2"><span className="metro-form-label">Departure date</span><Input className="metro-control" type="date" min={isoDate()} value={travelDate} onChange={event => setTravelDate(event.target.value)} required /></label>
      <label className="grid min-w-0 gap-2"><span className="metro-form-label">Passengers</span><Input className="metro-control" type="number" min={1} max={11} value={travelers} onChange={event => setTravelers(Number(event.target.value))} required /></label>
      <label className="grid min-w-0 gap-2"><span className="metro-form-label">Trip type</span><select className="metro-control" value={tripType} onChange={event => setTripType(event.target.value as "one_way" | "round_trip")}><option value="one_way">One way</option><option value="round_trip">Round trip</option></select></label>
      {tripType === "round_trip" ? <label className="grid min-w-0 gap-2"><span className="metro-form-label">Return date</span><Input className="metro-control" type="date" min={travelDate || isoDate()} value={backDate} onChange={event => setBackDate(event.target.value)} required /></label> : null}
      <Button type="submit" className="min-h-12 self-end">Update results</Button>
    </form> : null}
    {!valid ? <StatusNotice tone="error" className="mt-7">This search is incomplete. <Link href="/" className="font-semibold underline underline-offset-4">Start a new search</Link>.</StatusNotice> : null}
    {valid ? <>
      {mapMarkers.length ? <section className="ticket-card mt-8 overflow-hidden p-3 sm:p-4" aria-label="Route map">
        <div className="mb-3 px-2 sm:px-3"><h2 className="font-serif text-xl">Route map</h2><p className="mt-1 text-sm text-muted-foreground">Pickup and drop-off locations for this service.</p></div>
        <Suspense fallback={<div className="flex h-[280px] items-center justify-center rounded-xl bg-secondary/60 text-sm text-muted-foreground sm:h-[360px]">Loading route map…</div>}>
          <LazyMapView markers={mapMarkers} initialZoom={7} className="rounded-xl" />
        </Suspense>
        <div className="mt-4 flex flex-wrap items-center gap-2 px-2 sm:px-3" aria-label="Route sequence">
          {mapMarkers.map((marker, index) => <span key={`${marker.type}-${marker.label}`} className="inline-flex items-center gap-2 rounded-full border border-[#DDE4E0] bg-white px-3 py-1.5 text-xs font-semibold text-[#2D3E40]">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#16A34A] text-[10px] font-bold text-white">{marker.type === "origin" ? "A" : marker.type === "destination" ? "D" : index}</span>
            {marker.label}
          </span>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-muted-foreground sm:px-3" aria-label="Route map legend">
          <span><strong className="text-[#2D3E40]">A</strong> Origin</span>
          <span><strong className="text-[#16A34A]">1, 2…</strong> Stops</span>
          <span><strong className="text-[#2D3E40]">D</strong> Destination</span>
          <span><strong className="text-[#111827]">━</strong> Route</span>
        </div>
      </section> : null}
      <ResultLeg label="Outbound" date={date} data={outbound.data} loading={outbound.isLoading} error={outbound.error?.message} retry={() => void outbound.refetch()} selectedId={outId} pax={pax} onSelect={id => { setOutId(id); setInId(null); if (type === "one_way") chooseTrip(id, null); }} direct={type === "one_way"} onModify={() => setEditing(true)} />
      {type === "round_trip" && !selectedOutbound ? <StatusNotice tone="info" className="mt-6">Choose an outbound departure first to see valid returns after its arrival.</StatusNotice> : null}
      {type === "round_trip" && selectedOutbound ? <ResultLeg label="Return" date={returnDate ?? ""} data={eligibleReturns} loading={inbound.isLoading} error={inbound.error?.message} retry={() => void inbound.refetch()} selectedId={inId} pax={pax} onSelect={setInId} onModify={() => setEditing(true)} /> : null}
      {type === "round_trip" ? <div className="ticket-card mt-8 flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <p className="min-w-0 text-sm">{selectedOutbound ? `Outbound ${formatTime(selectedOutbound.departAt)}` : "Choose an outbound trip"} · {selectedReturn ? `Return ${formatTime(selectedReturn.departAt)}` : "Choose a return trip"}</p>
        <Button className="min-h-12 shrink-0" disabled={!selectedOutbound || !selectedReturn} onClick={() => chooseTrip(outId!, inId!)}>Review selected trips</Button>
      </div> : null}
    </> : null}
  </main></CustomerLayout>;
}

function ResultLeg({ label, date, data, loading, error, retry, selectedId, pax, onSelect, direct, onModify }: {
  label: string; date: string; data?: Departure[]; loading: boolean; error?: string; retry: () => void;
  selectedId: number | null; pax: number; onSelect: (id: number) => void; direct?: boolean; onModify: () => void;
}) {
  return <section className="mt-9" aria-label={`${label} departures`}>
    <div className="flex flex-wrap items-end justify-between gap-3"><h2 className="metro-section-title">{label} · {formatDate(date)}</h2><p className="text-sm text-muted-foreground">Live seat availability</p></div>
    <div className="mt-4">
      <ResourceState loading={loading} error={error ? "Trips could not be loaded." : null} onRetry={retry}>
        {data?.length === 0 ? <div className="ticket-card p-6 sm:p-7"><p className="font-semibold">No trips available for this date.</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Choose a different date or change your route.</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={onModify}>Change date</Button><Button variant="outline" className="min-h-11" onClick={onModify}>Modify search</Button></div></div> : null}
        <div className="grid gap-4">{(data ?? []).map(trip => <article key={trip.id} className={`ticket-card grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${selectedId === trip.id ? "ring-2 ring-primary ring-offset-2" : ""}`}>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm"><span className="font-semibold text-primary">{trip.origin?.name} → {trip.destination?.name}</span><span className="text-muted-foreground">{trip.vehicleCode ? `Service ${trip.vehicleCode}` : "Vehicle assignment pending"}</span>{selectedId === trip.id ? <StatusBadge status="active" label="Selected" /> : null}</div>
            <div className="mt-3 flex flex-wrap items-center gap-3"><div><strong className="font-serif text-2xl">{formatTime(trip.departAt)}</strong><p className="text-xs text-muted-foreground">{trip.pickup?.label ?? trip.origin?.name}</p></div><span aria-hidden="true" className="text-lg text-primary">→</span><div><strong className="font-serif text-2xl">{formatTime(trip.arriveAt)}</strong><p className="text-xs text-muted-foreground">{trip.dropoff?.label ?? trip.destination?.name}</p></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">{tripDuration(trip.departAt, trip.arriveAt)}</span></div>
            <div className="mt-4 flex flex-wrap items-center gap-2"><StatusBadge status={trip.soldOut ? "canceled" : trip.seatsRemaining < pax ? "pending" : "available"} label={trip.soldOut ? (trip.memberEarlyAccess ? "Members first" : "Sold out") : trip.seatsRemaining < pax ? "Not enough seats for your group" : `${trip.seatsRemaining} seats available`} />{trip.memberEarlyAccess && !trip.soldOut ? <StatusBadge status="pending" label="Member early access" /> : null}</div>
            <p className="mt-2 text-xs text-muted-foreground">{trip.standardSeatsRemaining} regular · {trip.frontSeatAvailable ? "1 front seat available" : "front seat occupied"}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 md:flex-col md:items-end"><div className="md:text-right"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">From</p><p className="fare-price text-2xl font-semibold">{money(trip.standardSeatsRemaining ? trip.standardFareCents : trip.frontFareCents)}</p><p className="text-xs text-muted-foreground">Regular {money(trip.standardFareCents)} · Front {money(trip.frontFareCents)}</p></div><Button type="button" className="min-h-11 min-w-36" disabled={trip.soldOut || trip.seatsRemaining < pax} variant={selectedId === trip.id ? "secondary" : "default"} onClick={() => onSelect(trip.id)}>{trip.soldOut ? trip.memberEarlyAccess ? "Members first" : "Sold out" : selectedId === trip.id ? "Selected" : direct ? "Select seats" : `Select ${label.toLowerCase()}`}</Button></div>
        </article>)}</div>
      </ResourceState>
    </div>
  </section>;
}
