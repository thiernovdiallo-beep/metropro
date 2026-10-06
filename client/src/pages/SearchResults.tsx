import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatTime, isoDate, money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";

type Departure = {
  id: number; departAt: Date; arriveAt: Date; seatsRemaining: number;
  standardSeatsRemaining: number; frontSeatAvailable: boolean; soldOut: boolean;
  standardFareCents: number; memberFareCents: number; frontFareCents: number;
  pickup?: { label: string } | null; dropoff?: { label: string } | null;
  origin?: { name: string } | null; destination?: { name: string } | null;
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
  const valid = origin > 0 && dest > 0 && origin !== dest && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isInteger(pax) && pax >= 1 && pax <= 12 &&
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

  function chooseTrip(out: number, ret: number | null) {
    const q = new URLSearchParams({ out: String(out), pax: String(pax), type, search: params.toString() });
    if (ret) q.set("ret", String(ret));
    setLocation(`/trip?${q}`);
  }

  return <PageShell><main className="container py-8 sm:py-12">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Find your departure</p>
    <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="font-serif text-3xl sm:text-4xl">{cityName(origin)} → {cityName(dest)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{date ? formatDate(date) : "Choose a date"} · {pax} passenger{pax === 1 ? "" : "s"}{type === "round_trip" && returnDate ? ` · Return ${formatDate(returnDate)}` : ""}</p>
      </div>
      <Button variant="outline" className="min-h-11" onClick={() => setEditing(value => !value)} aria-expanded={editing} aria-controls="modify-search">Modify search</Button>
    </div>
    {editing ? <form id="modify-search" className="ticket-card mt-5 grid min-w-0 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4" onSubmit={event => {
      event.preventDefault();
      if (!destinations.some(route => route.destinationCityId === to) || !travelDate || travelers < 1 || travelers > 12 || (tripType === "round_trip" && (!backDate || backDate < travelDate))) return;
      setLocation(searchUrl({ origin: from, dest: to, date: travelDate, pax: travelers, type: tripType, returnDate: backDate }));
      setEditing(false);
    }}>
      <label className="grid gap-1 text-sm font-semibold">Departure<select className="h-12 rounded-md border border-input bg-white px-3" value={from} onChange={event => { const id = Number(event.target.value); setFrom(id); setTo(routeOptions.find(route => route.originCityId === id)?.destinationCityId ?? 0); }}>
        {origins.map(([id, city]) => <option key={id} value={id}>{city?.name}</option>)}
      </select></label>
      <label className="grid gap-1 text-sm font-semibold">Destination<select className="h-12 rounded-md border border-input bg-white px-3" value={to} onChange={event => setTo(Number(event.target.value))}>
        {destinations.map(route => <option key={route.id} value={route.destinationCityId}>{route.destination?.name}</option>)}
      </select></label>
      <label className="grid gap-1 text-sm font-semibold">Departure date<Input className="h-12" type="date" min={isoDate()} value={travelDate} onChange={event => setTravelDate(event.target.value)} required /></label>
      <label className="grid gap-1 text-sm font-semibold">Passengers<Input className="h-12" type="number" min={1} max={12} value={travelers} onChange={event => setTravelers(Number(event.target.value))} required /></label>
      <label className="grid gap-1 text-sm font-semibold">Trip type<select className="h-12 rounded-md border border-input bg-white px-3" value={tripType} onChange={event => setTripType(event.target.value as "one_way" | "round_trip")}><option value="one_way">One way</option><option value="round_trip">Round trip</option></select></label>
      {tripType === "round_trip" ? <label className="grid gap-1 text-sm font-semibold">Return date<Input className="h-12" type="date" min={travelDate || isoDate()} value={backDate} onChange={event => setBackDate(event.target.value)} required /></label> : null}
      <Button type="submit" className="min-h-12 self-end">Update results</Button>
    </form> : null}
    {!valid ? <div role="alert" className="ticket-card mt-8 p-6">This search is incomplete. <Link href="/" className="font-semibold text-primary underline">Start a new search</Link>.</div> : null}
    {valid ? <>
      <ResultLeg label="Outbound" date={date} data={outbound.data} loading={outbound.isLoading} error={outbound.error?.message} retry={() => void outbound.refetch()} selectedId={outId} pax={pax} onSelect={id => { setOutId(id); setInId(null); if (type === "one_way") chooseTrip(id, null); }} direct={type === "one_way"} onModify={() => setEditing(true)} />
      {type === "round_trip" && !selectedOutbound ? <p className="ticket-card mt-6 p-5 text-sm text-muted-foreground">Choose an outbound departure first to see valid returns after its arrival.</p> : null}
      {type === "round_trip" && selectedOutbound ? <ResultLeg label="Return" date={returnDate ?? ""} data={eligibleReturns} loading={inbound.isLoading} error={inbound.error?.message} retry={() => void inbound.refetch()} selectedId={inId} pax={pax} onSelect={setInId} onModify={() => setEditing(true)} /> : null}
      {type === "round_trip" ? <div className="ticket-card mt-8 flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-sm">{selectedOutbound ? `Outbound ${formatTime(selectedOutbound.departAt)}` : "Choose an outbound trip"} · {selectedReturn ? `Return ${formatTime(selectedReturn.departAt)}` : "Choose a return trip"}</p>
        <Button className="min-h-12" disabled={!selectedOutbound || !selectedReturn} onClick={() => chooseTrip(outId!, inId!)}>Review selected trips</Button>
      </div> : null}
    </> : null}
  </main></PageShell>;
}

function ResultLeg({ label, date, data, loading, error, retry, selectedId, pax, onSelect, direct, onModify }: {
  label: string; date: string; data?: Departure[]; loading: boolean; error?: string; retry: () => void;
  selectedId: number | null; pax: number; onSelect: (id: number) => void; direct?: boolean; onModify: () => void;
}) {
  return <section className="mt-9" aria-label={`${label} departures`}>
    <h2 className="font-serif text-2xl">{label} · {formatDate(date)}</h2>
    {loading ? <p role="status" className="mt-4 text-sm text-muted-foreground">Checking live trips and seats…</p> : null}
    {error ? <div role="alert" className="ticket-card mt-4 p-5 text-sm">Trips could not be loaded. <button className="font-semibold text-primary underline" onClick={retry}>Try again</button>.</div> : null}
    {!loading && !error && data?.length === 0 ? <div className="ticket-card mt-4 p-6"><p className="font-semibold">No trips available for this date.</p><p className="mt-2 text-sm text-muted-foreground">Choose a different date or change your route.</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={onModify}>Change date</Button><Button variant="outline" className="min-h-11" onClick={onModify}>Modify search</Button></div></div> : null}
    <div className="mt-4 grid gap-4">{(data ?? []).map(trip => <article key={trip.id} className={`ticket-card grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${selectedId === trip.id ? "ring-2 ring-accent" : ""}`}>
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"><span className="font-semibold text-primary">{trip.origin?.name} → {trip.destination?.name}</span><span className="text-muted-foreground">{trip.vehicleCode ? `Service ${trip.vehicleCode}` : "Vehicle assignment pending"}</span></div>
        <div className="mt-3 flex flex-wrap items-center gap-3"><div><strong className="font-serif text-2xl">{formatTime(trip.departAt)}</strong><p className="text-xs text-muted-foreground">{trip.pickup?.label ?? trip.origin?.name}</p></div><span aria-hidden="true" className="text-lg text-accent">→</span><div><strong className="font-serif text-2xl">{formatTime(trip.arriveAt)}</strong><p className="text-xs text-muted-foreground">{trip.dropoff?.label ?? trip.destination?.name}</p></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{tripDuration(trip.departAt, trip.arriveAt)}</span></div>
        <p className="mt-3 text-xs text-muted-foreground">Available seats: {trip.seatsRemaining} · {trip.standardSeatsRemaining} regular · {trip.frontSeatAvailable ? "1 front" : "front occupied"}{trip.memberEarlyAccess ? " · Member early access" : ""}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 md:flex-col md:items-end"><div className="md:text-right"><p className="text-xs uppercase tracking-wider text-muted-foreground">From</p><p className="price-copper text-2xl font-semibold">{money(trip.standardSeatsRemaining ? trip.standardFareCents : trip.frontFareCents)}</p><p className="text-xs text-muted-foreground">Regular {money(trip.standardFareCents)} · Front {money(trip.frontFareCents)}</p></div><Button type="button" className="min-h-11 min-w-36" disabled={trip.soldOut || trip.seatsRemaining < pax} variant={selectedId === trip.id ? "secondary" : "default"} onClick={() => onSelect(trip.id)}>{trip.soldOut ? trip.memberEarlyAccess ? "Members first" : "Sold out" : selectedId === trip.id ? "Selected" : direct ? "Select seats" : `Select ${label.toLowerCase()}`}</Button></div>
    </article>)}</div>
  </section>;
}
