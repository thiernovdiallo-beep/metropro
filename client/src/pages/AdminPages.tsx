import { AdminLayout } from "@/layouts/AdminLayout";
import { DriverAccountForm } from "@/components/DriverAccountForm";
import { DriverPortrait } from "@/components/DriverPortrait";
import { PageIntro, ResourceState, StatusBadge, StatusNotice } from "@/components/MetroUI";
import DispatchAssignment from "@/components/DispatchAssignment";
import RouteCreateForm from "@/components/RouteCreateForm";
import RouteStopsEditor from "@/components/RouteStopsEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatTime, money, parseServiceDateTimeInput } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { lazy, Suspense, useState } from "react";

const AnalyticsDashboard = lazy(() => import("@/components/AnalyticsDashboard"));

export function AdminTrip() {
  const [, params] = useRoute("/admin/trips/:id");
  const id = Number(params?.id);
  const trip = trpc.admin.trip.useQuery({ id }, { enabled: Boolean(id) });
  const t = trip.data;
  return <AdminLayout><div className="metro-page metro-page--wide">
    <PageIntro eyebrow="Operations" title={t ? `${t.origin?.name} → ${t.destination?.name}` : "Trip details"}
      description={t ? <>Vehicle {t.vehicle?.code ?? "unassigned"} · Driver {t.driver?.fullName ?? "unassigned"} · {t.seatsSold} sold · {t.seatsRemaining} remaining · {money(t.revenueCents)}</> : "Review assignments, passenger records, and the manifest for this departure."} />
    <ResourceState loading={trip.isLoading} error={trip.error ? "Trip details could not be loaded." : null} empty={!t} emptyTitle="Trip unavailable" emptyDescription="This departure may have been removed or is not available to your account." onRetry={() => void trip.refetch()}>
      {t ? <section aria-labelledby="manifest-title"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="manifest-title" className="metro-section-title">Passenger manifest</h2><StatusBadge status={t.tripStatus} /></div>
        <div className="mt-3 grid gap-3">{t.manifest.map(p => <div key={p.id} className="ticket-card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <div className="min-w-0"><strong>{p.firstName} {p.lastName}</strong><span className="mt-1 block text-muted-foreground">{p.departureId === id && p.seatNumber ? `Seat ${p.seatNumber}` : p.returnDepartureId === id && p.returnSeatNumber ? `Seat ${p.returnSeatNumber}` : p.seatType === "front" ? "Front seat" : "Regular seat"} · {p.bookingNumber}</span></div>
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={p.status} /><StatusBadge status={p.paymentStatus} /><Link href={`/admin/bookings/${p.bookingId}`} className="metro-action-link">Booking details</Link></div>
        </div>)}</div>
      </section> : null}
    </ResourceState>
  </div></AdminLayout>;
}

export function AdminDispatch() {
  const board = trpc.admin.dispatchBoard.useQuery();
  return <AdminLayout><div className="metro-page metro-page--wide">
    <PageIntro eyebrow="Operations" title="Dispatch board" description="Review vehicle readiness and active assignments, then make changes using the assignment controls." />
    <DispatchAssignment />
    <div className="mt-6"><ResourceState loading={board.isLoading} error={board.error ? "The dispatch board could not be loaded." : null} empty={!board.data?.length} emptyTitle="No dispatch cards" emptyDescription="Active vehicles and assignments will appear here." onRetry={() => void board.refetch()}>
      <div className="grid gap-3 md:grid-cols-2">{(board.data ?? []).map(card => <article key={card.vehicle.id} className="ticket-card border-l-4 border-l-primary p-5">
        <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-serif text-2xl">{card.vehicle.code}</h2><StatusBadge status={card.status} /></div>
        <div className="mt-3 text-sm"><strong>{card.driver?.fullName ?? "Unassigned"}</strong><span className="mt-1 block text-muted-foreground">{card.location}</span></div>
        <div className="mt-3 text-sm font-semibold">{card.route}</div>
        <div className="mt-1 text-sm text-muted-foreground">{card.departure ? `${formatTime(card.departure)} → ETA ${card.eta ? formatTime(card.eta) : "—"}` : "Preparing"}</div>
        <div className="mt-3 text-xs text-muted-foreground">Next: {card.nextAssignment ? `${card.nextAssignment.route} ${formatTime(card.nextAssignment.departAt)}` : "None"}</div>
        {card.currentDepartureId ? <Link href={`/admin/trips/${card.currentDepartureId}`} className="metro-action-link mt-4">Open trip</Link> : null}
      </article>)}</div>
    </ResourceState></div>
  </div></AdminLayout>;
}

export function AdminFleet() {
  const vans = trpc.admin.vehicles.useQuery();
  const drivers = trpc.admin.drivers.useQuery();
  const save = trpc.admin.saveVehicle.useMutation({ onSuccess: () => { void vans.refetch(); toast.success("Vehicle saved"); }, onError: error => toast.error(error.message) });
  const reinvite = trpc.admin.reissueDriverInvite.useMutation();
  const [code, setCode] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [capacity, setCapacity] = useState(11);
  const [mileage, setMileage] = useState(0);
  const [vin, setVin] = useState("");
  const [status, setStatus] = useState<"available" | "maintenance" | "out_of_service">("available");
  const [setupLink, setSetupLink] = useState("");
  return (
    <AdminLayout>
      <div className="metro-page metro-page--wide">
            <PageIntro eyebrow="Operations" title="Fleet" description="Manage vehicle records, driver access, and maintenance readiness." />
        <div className="mt-4"><ResourceState loading={vans.isLoading} error={vans.error ? "Vehicle records could not be loaded." : null} empty={!vans.data?.length} emptyTitle="No vehicles yet" emptyDescription="Create a vehicle record to start building the fleet." onRetry={() => void vans.refetch()}>
          <div className="grid gap-3">{(vans.data ?? []).map(v => (
            <Link key={v.id} href={`/admin/fleet/${v.id}`} className="ticket-card block p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  {v.code} · {v.year} {v.make} {v.model}
                </span>
                <span className="flex items-center gap-2"><span>{v.capacity} seats</span><StatusBadge status={v.status} /></span>
              </div>
            </Link>
          ))}</div>
        </ResourceState></div>
        <h2 className="metro-section-title mt-8">Add vehicle</h2>
        <p className="mt-2 text-sm text-muted-foreground">For a 12-place van, enter 11 paying passenger seats. The driver is not part of sellable capacity.</p>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={e => {
            e.preventDefault();
            save.mutate({
              code: code.trim(), vin: vin.trim() || undefined, make: make.trim(), model: model.trim(), year, capacity,
              currentMileage: mileage, status,
            });
          }}
        >
          <label className="form-field">Fleet code *<Input className="metro-control" required placeholder="MP-005" value={code} onChange={e => setCode(e.target.value)} /></label>
          <label className="form-field">Make *<Input className="metro-control" required placeholder="Ford" value={make} onChange={e => setMake(e.target.value)} /></label>
          <label className="form-field">Model *<Input className="metro-control" required placeholder="Transit 350" value={model} onChange={e => setModel(e.target.value)} /></label>
          <label className="form-field">Year *<Input className="metro-control" required type="number" min={1990} max={new Date().getFullYear() + 2} value={year} onChange={e => setYear(Number(e.target.value))} /></label>
          <label className="form-field">Paying passenger seats *<Input className="metro-control" required type="number" min={1} max={40} value={capacity} onChange={e => setCapacity(Number(e.target.value))} /></label>
          <label className="form-field">Current mileage<Input className="metro-control" required type="number" min={0} value={mileage} onChange={e => setMileage(Number(e.target.value))} /></label>
          <label className="form-field">VIN (optional)<Input className="metro-control" value={vin} onChange={e => setVin(e.target.value)} /></label>
          <label className="form-field">Status<select className="metro-control" value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="out_of_service">Out of service</option></select></label>
          <Button type="submit" className="min-h-11 sm:col-span-2 lg:col-span-4" disabled={save.isPending}>{save.isPending ? "Saving…" : "Create vehicle"}</Button>
        </form>
        <h2 className="metro-section-title mt-8">Drivers</h2>
        <div className="mt-3"><ResourceState loading={drivers.isLoading} error={drivers.error ? "Driver records could not be loaded." : null} empty={!drivers.data?.length} emptyTitle="No driver profiles yet" emptyDescription="Create a driver account when you are ready to grant portal access." onRetry={() => void drivers.refetch()}>
          <div className="grid gap-3">{(drivers.data ?? []).map(d => (
            <div key={d.id} className="ticket-card flex min-w-0 flex-wrap items-center gap-4 p-4 text-sm">
              <DriverPortrait profileId={d.idLast4 ? d.id : null} name={d.fullName} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{d.fullName}</div>
                <div className="break-words text-muted-foreground">{d.email} · {d.phone ?? "No phone"}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{d.idLast4 ? `ID ending ${d.idLast4}` : "Profile details pending"} · {d.loginReady ? "Ready to sign in" : d.userId ? "Awaiting password setup" : "No driver login"}</span><StatusBadge status={d.status} /></div>
              </div>
              {d.userId && !d.loginReady && d.status === "active" ? <Button type="button" variant="outline" size="sm" disabled={reinvite.isPending} onClick={async () => {
                try { const result = await reinvite.mutateAsync({ profileId: d.id }); setSetupLink(`${window.location.origin}/driver/setup#token=${result.setupToken}`); toast.success("New one-time driver link ready to copy"); }
                catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not reissue setup link"); }
              }}>Reissue setup link</Button> : null}
            </div>
          ))}</div>
        </ResourceState></div>
        {setupLink ? <div className="ticket-card mt-4 max-w-2xl p-4 text-sm">
          <p className="font-semibold">One-time link · copy now and share privately</p>
          <Input className="mt-2" aria-label="Reissued driver setup link" readOnly value={setupLink} onFocus={event => event.currentTarget.select()} />
          <Button className="mt-2" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(setupLink); toast.success("Copied"); } catch { toast.error("Select and copy the link above"); } }}>Copy link</Button>
        </div> : null}
        <DriverAccountForm drivers={drivers.data ?? []} onCreated={() => { void drivers.refetch(); setSetupLink(""); }} />
      </div>
    </AdminLayout>
  );
}

export function AdminVehicle() {
  const [, params] = useRoute("/admin/fleet/:id");
  const id = Number(params?.id);
  const q = trpc.admin.vehicle.useQuery({ id }, { enabled: Boolean(id) });
  const save = trpc.admin.saveVehicle.useMutation({ onSuccess: () => { void q.refetch(); toast.success("Vehicle saved"); }, onError: error => toast.error(error.message) });
  const maint = trpc.admin.addMaintenance.useMutation({ onSuccess: () => { void q.refetch(); toast.success("Maintenance recorded"); }, onError: error => toast.error(error.message) });
  const v = q.data?.vehicle;
  const [capacity, setCapacity] = useState<number | null>(null);
  const [mileage, setMileage] = useState<number | null>(null);
  const [status, setStatus] = useState<"available" | "assigned" | "in_transit" | "maintenance" | "out_of_service" | null>(null);
  const [make, setMake] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [vin, setVin] = useState<string | null>(null);
  const [registration, setRegistration] = useState<string | null>(null);
  const [insurance, setInsurance] = useState<string | null>(null);
  const [inspection, setInspection] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");
  const [serviceMileage, setServiceMileage] = useState<number | null>(null);
  const [performedAt, setPerformedAt] = useState("");
  const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? "";
  return (
    <AdminLayout>
      <div className="metro-page metro-page--wide">
            <PageIntro eyebrow="Fleet" title={v?.code ?? "Vehicle details"} description={v ? `${v.year} ${v.make} ${v.model} · ${v.capacity} paying passenger seats` : "Review vehicle details, compliance dates, and maintenance records."} />
        {!v ? <ResourceState loading={q.isLoading} error={q.error ? "Vehicle details could not be loaded." : null} empty={!q.isLoading && !q.error} emptyTitle="Vehicle unavailable" emptyDescription="This vehicle may have been removed or is not available to your account." onRetry={() => void q.refetch()}><></></ResourceState> : null}
        {v ? (
          <form className="ticket-card mt-4 grid gap-4 p-5 text-sm sm:grid-cols-2 lg:grid-cols-3" onSubmit={event => { event.preventDefault(); save.mutate({
            id: v.id, code: v.code, vin: vin === null ? v.vin ?? undefined : vin.trim() || undefined,
            make: make ?? v.make, model: model ?? v.model, year: year ?? v.year,
            capacity: capacity ?? v.capacity, currentMileage: mileage ?? v.currentMileage,
            status: status ?? v.status,
            registrationExpiresAt: registration === null ? undefined : registration || null,
            insuranceExpiresAt: insurance === null ? undefined : insurance || null,
            inspectionExpiresAt: inspection === null ? undefined : inspection || null,
          }); }}>
            <StatusNotice className="sm:col-span-2 lg:col-span-3">A 12-place van has 11 paying passenger seats plus the driver. Capacity changes update only empty future scheduled departures. Booked trips keep their original seat maps; reducing capacity below a booked trip is blocked.</StatusNotice>
            <label className="form-field">Make<Input required value={make ?? v.make} onChange={event => setMake(event.target.value)} /></label>
            <label className="form-field">Model<Input required value={model ?? v.model} onChange={event => setModel(event.target.value)} /></label>
            <label className="form-field">Year<Input className="metro-control" required type="number" min={1990} max={new Date().getFullYear() + 2} value={year ?? v.year} onChange={event => setYear(Number(event.target.value))} /></label>
            <label className="form-field">Paying passenger seats<Input className="metro-control" required type="number" min={1} max={40} value={capacity ?? v.capacity} onChange={event => setCapacity(Number(event.target.value))} /></label>
            <label className="form-field">Current mileage<Input className="metro-control" required type="number" min={0} value={mileage ?? v.currentMileage} onChange={event => setMileage(Number(event.target.value))} /></label>
            <label className="form-field">VIN<Input value={vin ?? v.vin ?? ""} onChange={event => setVin(event.target.value)} /></label>
            <label className="form-field">Status<select className="metro-control" value={status ?? v.status} onChange={event => setStatus(event.target.value as NonNullable<typeof status>)}><option value="available">Available</option><option value="assigned">Assigned</option><option value="in_transit">In transit</option><option value="maintenance">Maintenance</option><option value="out_of_service">Out of service</option></select></label>
            <label className="form-field">Registration expires<Input type="date" value={registration ?? date(v.registrationExpiresAt)} onChange={event => setRegistration(event.target.value)} /></label>
            <label className="form-field">Insurance expires<Input type="date" value={insurance ?? date(v.insuranceExpiresAt)} onChange={event => setInsurance(event.target.value)} /></label>
            <label className="form-field">Inspection expires<Input type="date" value={inspection ?? date(v.inspectionExpiresAt)} onChange={event => setInspection(event.target.value)} /></label>
            <div className="text-muted-foreground sm:col-span-2 lg:col-span-3">Assigned driver: {q.data?.driver?.fullName ?? "—"}</div>
            <Button type="submit" className="min-h-11 sm:col-span-2 lg:col-span-3" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save vehicle"}</Button>
          </form>
        ) : null}
        <h2 className="metro-section-title mt-8">Maintenance</h2>
        {(q.data?.maintenance ?? []).map(m => (
          <div key={m.id} className="ticket-card mt-2 p-3 text-sm">
            {formatDate(m.performedAt)} · {m.type} · {m.notes ?? "No notes"} {m.mileage !== null ? `· ${m.mileage.toLocaleString()} miles` : ""}
          </div>
        ))}
        <form className="ticket-card mt-4 grid max-w-3xl gap-3 p-5 sm:grid-cols-2" onSubmit={event => { event.preventDefault();
          if (!performedAt) { toast.error("Choose when maintenance was performed"); return; }
          maint.mutate({ vehicleId: id, type: serviceType.trim(), notes: serviceNotes.trim(),
            mileage: serviceMileage ?? undefined, performedAt: new Date(performedAt).toISOString() });
        }}>
          <label className="form-field">Service type<Input required placeholder="Inspection, repair, oil change…" value={serviceType} onChange={event => setServiceType(event.target.value)} /></label>
          <label className="form-field">Performed at<Input required type="datetime-local" value={performedAt} onChange={event => setPerformedAt(event.target.value)} /></label>
          <label className="form-field">Odometer<Input type="number" min={0} value={serviceMileage ?? ""} onChange={event => setServiceMileage(event.target.value ? Number(event.target.value) : null)} /></label>
          <label className="form-field">Work completed<Input required value={serviceNotes} onChange={event => setServiceNotes(event.target.value)} /></label>
          <Button type="submit" className="min-h-11 sm:col-span-2" disabled={maint.isPending}>Record actual service</Button>
        </form>
        <h2 className="metro-section-title mt-8">Upcoming assignments</h2>
        {(q.data?.upcoming ?? []).filter(d => d.departAt > new Date() && d.status !== "canceled").sort((a, b) => a.departAt.getTime() - b.departAt.getTime()).map(d => (
          <Link key={d.id} href={`/admin/trips/${d.id}`} className="mt-2 block min-h-11 text-sm font-semibold text-primary underline">
            {formatDate(d.departAt)} {formatTime(d.departAt)} · {d.status}
          </Link>
        ))}
      </div>
    </AdminLayout>
  );
}

export function AdminRoutes() {
  const [editRouteId, setEditRouteId] = useState<number | null>(null);
  const routes = trpc.admin.routes.useQuery();
  const cities = trpc.admin.cities.useQuery();
  const locs = trpc.admin.locations.useQuery();
  const save = trpc.admin.saveRoute.useMutation({ onSuccess: () => { void routes.refetch(); setEditRouteId(null); toast.success("Route saved"); }, onError: error => toast.error(error.message) });
  const addCity = trpc.admin.addCity.useMutation({ onSuccess: () => { void cities.refetch(); toast.success("City added"); }, onError: error => toast.error(error.message) });
  const createDep = trpc.admin.createDeparture.useMutation({ onSuccess: () => toast.success("Departure created"), onError: error => toast.error(error.message) });
  const vans = trpc.admin.vehicles.useQuery();
  const drivers = trpc.admin.drivers.useQuery();
  const addLocation = trpc.admin.addLocation.useMutation({ onSuccess: () => { void locs.refetch(); toast.success("Location added"); }, onError: error => toast.error(error.message) });
  const cityName = (id: number) => cities.data?.find(city => city.id === id)?.name ?? "Unknown city";
  return (
    <AdminLayout>
      <div className="metro-page metro-page--wide">
            <PageIntro eyebrow="Operations" title="Routes" description="Set the published network, fares, pickup locations, and future departures." />
        {routes.isLoading ? <ResourceState loading><></></ResourceState> : null}
        {routes.error || cities.error || locs.error ? <StatusNotice tone="error" className="mb-4">Some route configuration records could not be loaded. Refresh before making changes.</StatusNotice> : null}
        {(routes.data ?? []).map(r => (
          <div key={r.id}>
            <RouteFareRow route={r} label={`${cityName(r.originCityId)} → ${cityName(r.destinationCityId)}`} onSave={next => save.mutate(next)} />
            <button type="button" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline" aria-expanded={editRouteId === r.id} onClick={() => setEditRouteId(current => current === r.id ? null : r.id)}>{editRouteId === r.id ? "Close route editor" : "Edit cities, stops & duration"}</button>
            {editRouteId === r.id ? <><p className="mt-2 text-xs text-muted-foreground">Existing departures keep their booked itinerary. To change cities, stops or duration after trips have been scheduled, create a new route instead; fares and activation can still be updated here.</p><RouteCreateForm key={r.id} cities={cities.data ?? []} locations={locs.data ?? []} initial={r} onSave={next => save.mutate(next)} /><RouteStopsEditor routeId={r.id} locations={(locs.data ?? []).filter(location => location.cityId !== r.originCityId && location.cityId !== r.destinationCityId)} /></> : null}
          </div>
        ))}
        {!routes.isLoading && !routes.data?.length ? <p className="ticket-card mt-4 p-4 text-sm">No routes configured. Add cities and pickup/drop-off locations before creating a route.</p> : null}
        <h2 className="metro-section-title mt-8">Create route</h2>
        <RouteCreateForm cities={cities.data ?? []} locations={locs.data ?? []} onSave={value => save.mutate(value)} />
        <h2 className="metro-section-title mt-8">New city (future routes)</h2>
        <CityForm onSave={v => addCity.mutate(v)} />
        <h2 className="metro-section-title mt-8">Pickup / drop-off</h2>
        <LocationForm cities={cities.data ?? []} onSave={v => addLocation.mutate(v)} />
        <h2 className="metro-section-title mt-8">Create departure</h2>
        <Link href="/admin/schedule" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">View and edit scheduled departures</Link>
        <DepartureForm
          routes={(routes.data ?? []).filter(route => route.isActive).map(route => ({ ...route, label: `${cityName(route.originCityId)} → ${cityName(route.destinationCityId)}` }))}
          vans={vans.data ?? []}
          drivers={(drivers.data ?? []).filter(driver => driver.status === "active" && driver.loginReady)}
          onCreate={v => createDep.mutate(v)}
        />
      </div>
    </AdminLayout>
  );
}

function RouteFareRow({
  route,
  label,
  onSave,
}: {
  label: string;
  route: {
    id: number;
    originCityId: number;
    destinationCityId: number;
    pickupLocationId: number;
    dropoffLocationId: number;
    estimatedMinutes: number;
    standardFareCents: number;
    memberFareCents: number;
    frontFareCents: number;
    isActive: boolean;
  };
  onSave: (v: typeof route) => void;
}) {
  const [standard, setStandard] = useState(route.standardFareCents);
  const [member, setMember] = useState(route.memberFareCents);
  const [front, setFront] = useState(route.frontFareCents);
  const [active, setActive] = useState(route.isActive);
  return (
    <div className="ticket-card mt-3 grid min-w-0 gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-[auto_repeat(3,minmax(0,1fr))_auto] lg:items-end">
      <div>
        <strong>{label}</strong><span className="block text-xs text-muted-foreground">#{route.id} · {route.estimatedMinutes} min</span>
      </div>
      <label className="form-field">
        Standard cents
        <Input className="metro-control" type="number" value={standard} onChange={e => setStandard(Number(e.target.value))} />
      </label>
      <label className="form-field">
        Member's regular seat cents
        <Input className="metro-control" type="number" value={member} onChange={e => setMember(Number(e.target.value))} />
      </label>
      <label className="form-field">
        Front seat cents (everyone)
        <Input className="metro-control" type="number" value={front} onChange={e => setFront(Number(e.target.value))} />
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Active for sale</label>
      <Button
        className="min-h-11"
        size="sm"
        variant="outline"
        onClick={() => onSave({ ...route, standardFareCents: standard, memberFareCents: member, frontFareCents: front, isActive: active })}
      >
        Save fares & status
      </Button>
    </div>
  );
}

function LocationForm({
  cities,
  onSave,
}: {
  cities: { id: number; name: string }[];
  onSave: (v: { cityId: number; label: string; address: string }) => void;
}) {
  const [cityId, setCityId] = useState(cities[0]?.id ?? 0);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  return (
    <form
      className="mt-3 grid gap-2 md:grid-cols-4"
      onSubmit={e => {
        e.preventDefault();
        onSave({ cityId: cityId || cities[0]?.id, label, address });
      }}
    >
      <select className="metro-control" value={cityId} onChange={e => setCityId(Number(e.target.value))}>
        {cities.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Input className="metro-control" placeholder="Pickup label" value={label} onChange={e => setLabel(e.target.value)} required />
      <Input className="metro-control" placeholder="Address" value={address} onChange={e => setAddress(e.target.value)} required />
      <Button type="submit" className="min-h-11">Add location</Button>
    </form>
  );
}

function CityForm({ onSave }: { onSave: (v: { code: string; name: string; state: string }) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  return (
    <form
      className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_auto]"
      onSubmit={e => {
        e.preventDefault();
        onSave({ code, name, state });
      }}
    >
      <Input className="metro-control" placeholder="CLE" value={code} onChange={e => setCode(e.target.value)} />
      <Input className="metro-control" placeholder="Cleveland" value={name} onChange={e => setName(e.target.value)} />
      <Input className="metro-control" placeholder="OH" value={state} onChange={e => setState(e.target.value)} />
      <Button type="submit" className="min-h-10">Add city</Button>
    </form>
  );
}

function DepartureForm({
  routes,
  vans,
  drivers,
  onCreate,
}: {
  routes: { id: number; estimatedMinutes: number; label?: string }[];
  vans: { id: number; code: string }[];
  drivers: { id: number; fullName: string }[];
  onCreate: (v: { routeId: number; vehicleId: number; driverId: number; departAt: string; arriveAt: string }) => void;
}) {
  const [routeId, setRoute] = useState(routes[0]?.id ?? 0);
  const [vehicleId, setVan] = useState(vans[0]?.id ?? 0);
  const [driverId, setDriver] = useState(drivers[0]?.id ?? 0);
  const [departAt, setDepart] = useState("");
  return (
    <form
      className="mt-3 grid gap-2 md:grid-cols-2"
      onSubmit={e => {
        e.preventDefault();
        if (!drivers.length || !vans.length || !routes.length) return;
        const start = parseServiceDateTimeInput(departAt);
        if (!start || start <= new Date()) { toast.error("Choose a valid future departure in Eastern Time. Spring DST gaps are unavailable."); return; }
        const selected = routes.find(r => r.id === (routeId || routes[0]?.id));
        const minutes = selected?.estimatedMinutes ?? 540;
        const end = new Date(start.getTime() + minutes * 60000);
        onCreate({
          routeId: routeId || routes[0]?.id,
          vehicleId: vehicleId || vans[0]?.id,
          driverId: driverId || drivers[0]?.id,
          departAt: start.toISOString(),
          arriveAt: end.toISOString(),
        });
      }}
    >
      <label className="form-field">Route<select className="metro-control" value={routeId} onChange={e => setRoute(Number(e.target.value))}>
        {routes.map(r => (
          <option key={r.id} value={r.id}>
            {r.label ?? `Route ${r.id}`}
          </option>
        ))}
      </select></label>
      <label className="form-field">Vehicle<select className="metro-control" value={vehicleId} onChange={e => setVan(Number(e.target.value))}>
        {vans.map(v => (
          <option key={v.id} value={v.id}>
            {v.code}
          </option>
        ))}
      </select></label>
      <label className="form-field">Driver<select className="metro-control" value={driverId} onChange={e => setDriver(Number(e.target.value))}>
        {drivers.map(d => (
          <option key={d.id} value={d.id}>
            {d.fullName}
          </option>
        ))}
      </select></label>
      <label className="form-field">Departure · Eastern Time<Input className="metro-control" type="datetime-local" value={departAt} onChange={e => setDepart(e.target.value)} required /></label>
      {!drivers.length ? <p className="text-sm text-muted-foreground md:col-span-2">Create a driver account in Fleet and have the driver complete password setup before scheduling a departure.</p> : null}
      <Button type="submit" className="min-h-11" disabled={!drivers.length || !vans.length || !routes.length}>Create departure</Button>
    </form>
  );
}

export function AdminAnalytics() {
  return (
    <AdminLayout>
      <div className="metro-page metro-page--wide">
            <Suspense fallback={<div role="status" className="ticket-card flex min-h-28 items-center p-5 text-sm text-muted-foreground">Loading analytics…</div>}><AnalyticsDashboard /></Suspense>
      </div>
    </AdminLayout>
  );
}

export function AdminSettings() {
  const q = trpc.admin.settings.useQuery();
  const save = trpc.admin.saveSettings.useMutation({ onSuccess: () => { void q.refetch(); toast.success("Settings saved"); }, onError: error => toast.error(error.message) });
  const reminders = trpc.admin.runReminders.useMutation({
    onSuccess: r => toast.success(`In-app reminders recorded: ${r.sent24h} 24-hour, ${r.sentBoarding} boarding`),
    onError: error => toast.error(error.message),
  });
  const audit = trpc.admin.audit.useQuery();
  const s = q.data;
  const [standard, setStandard] = useState<number | null>(null);
  const [member, setMember] = useState<number | null>(null);
  const [front, setFront] = useState<number | null>(null);
  const [membership, setMembership] = useState<number | null>(null);
  return (
    <AdminLayout>
      <div className="metro-page metro-page--wide">
            <PageIntro eyebrow="Operations" title="Settings" description={<>Existing trip fares are configured per route in <Link href="/admin/routes" className="font-semibold text-primary underline">Routes</Link>; changing default fares here does not reprice booked tickets. New membership prices apply to new subscriptions, not existing ones.</>} />
        {!s ? <ResourceState loading={q.isLoading} error={q.error ? "Settings could not be loaded." : null} empty={!q.isLoading && !q.error} emptyTitle="Settings unavailable" onRetry={() => void q.refetch()}><></></ResourceState> : null}
        {s ? (
          <div className="ticket-card mt-4 grid max-w-xl gap-4 p-5 sm:grid-cols-2">
            <label className="form-field">
              Default standard fare cents
              <Input
                className="metro-control"
                type="number"
                value={standard ?? s.standardFareCents}
                onChange={e => setStandard(Number(e.target.value))}
              />
            </label>
            <label className="form-field">
              Default member regular-seat fare cents
              <Input className="metro-control" type="number" value={member ?? s.memberFareCents} onChange={e => setMember(Number(e.target.value))} />
            </label>
            <label className="form-field">
              Default front-seat fare cents
              <Input className="metro-control" type="number" value={front ?? s.frontFareCents} onChange={e => setFront(Number(e.target.value))} />
            </label>
            <label className="form-field">
              Membership cents / month
              <Input
                className="metro-control"
                type="number"
                value={membership ?? s.membershipPriceCents}
                onChange={e => setMembership(Number(e.target.value))}
              />
            </label>
            <label className="form-field sm:col-span-2">
              Membership benefits (one per line)
              <textarea
                id="membership-benefits"
                className="metro-control min-h-28 py-3"
                defaultValue={s.membershipBenefits.join("\n")}
              />
            </label>
            <Button
              className="min-h-11 sm:col-span-2"
              onClick={() =>
                save.mutate({
                  ...s,
                  standardFareCents: standard ?? s.standardFareCents,
                  memberFareCents: member ?? s.memberFareCents,
                  frontFareCents: front ?? s.frontFareCents,
                  membershipPriceCents: membership ?? s.membershipPriceCents,
                  membershipBenefits: (
                    (document.getElementById("membership-benefits") as HTMLTextAreaElement | null)?.value ??
                    s.membershipBenefits.join("\n")
                  )
                    .split("\n")
                    .map(line => line.trim())
                    .filter(Boolean),
                })
              }
            >
              Save
            </Button>
            <Button className="min-h-11 sm:col-span-2" variant="outline" onClick={() => reminders.mutate()}>
              Record in-app reminders now
            </Button>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">Email, SMS and push delivery providers are not configured; running reminders records only in-app notices.</p>
        <h2 className="mt-10 font-serif text-xl">Activity log</h2>
        {audit.isLoading ? <StatusNotice className="mt-3">Loading activity log…</StatusNotice> : null}
        {audit.error ? <StatusNotice tone="error" className="mt-3">Activity log could not be loaded.</StatusNotice> : null}
        <div className="ticket-card mt-3 space-y-1 p-4 text-xs">
          {(audit.data ?? []).map(a => (
            <div key={a.id}>
              {a.action} · {a.entityType} {a.entityId}
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
