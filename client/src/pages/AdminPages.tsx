import { PageShell } from "@/components/Brand";
import { DriverAccountForm } from "@/components/DriverAccountForm";
import { DriverPortrait } from "@/components/DriverPortrait";
import DispatchAssignment from "@/components/DispatchAssignment";
import RouteCreateForm from "@/components/RouteCreateForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatTime, money, parseServiceDateTimeInput } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { lazy, Suspense, useState } from "react";

const AnalyticsDashboard = lazy(() => import("@/components/AnalyticsDashboard"));

export function AdminNav() {
  return (
    <nav className="mb-6 flex flex-wrap gap-3 text-sm">
      <Link href="/admin">Ops</Link>
      <Link href="/admin/dispatch">Dispatch</Link>
      <Link href="/admin/schedule">Schedule</Link>
      <Link href="/admin/bookings">Bookings</Link>
      <Link href="/admin/payments">Payments</Link>
      <Link href="/admin/support">Support</Link>
      <Link href="/admin/fleet">Fleet</Link>
      <Link href="/admin/routes">Routes</Link>
      <Link href="/admin/analytics">Analytics</Link>
      <Link href="/admin/settings">Settings</Link>
    </nav>
  );
}

export function AdminTrip() {
  const [, params] = useRoute("/admin/trips/:id");
  const id = Number(params?.id);
  const trip = trpc.admin.trip.useQuery({ id }, { enabled: Boolean(id) });
  const t = trip.data;
  return (
    <PageShell>
      <div className="container py-8">
        <AdminNav />
        <h1 className="font-serif text-3xl">
          {t?.origin?.name} → {t?.destination?.name}
        </h1>
        <p className="text-muted-foreground">
          Vehicle {t?.vehicle?.code} · Driver {t?.driver?.fullName} · {t?.seatsSold} sold ·{" "}
          {t?.seatsRemaining} remaining · {t ? money(t.revenueCents) : ""} · {t?.tripStatus}
        </p>
        <h2 className="mt-6 font-serif text-xl">Passenger manifest</h2>
        <div className="mt-3 grid gap-2">
          {(t?.manifest ?? []).map(p => (
            <div key={p.id} className="ticket-card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <span>
                {p.firstName} {p.lastName} · {p.departureId === id && p.seatNumber ? `Seat ${p.seatNumber}` : p.returnDepartureId === id && p.returnSeatNumber ? `Seat ${p.returnSeatNumber}` : p.seatType === "front" ? "Front seat" : "Regular seat"} · {p.status} · {p.bookingNumber}
              </span>
              <span>
                {p.paymentStatus}
                <Link href={`/admin/bookings/${p.bookingId}`} className="ml-2 inline-flex min-h-11 items-center font-semibold text-primary underline">Booking details</Link>
              </span>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

export function AdminDispatch() {
  const board = trpc.admin.dispatchBoard.useQuery();
  return (
    <PageShell>
      <div className="container py-8">
        <AdminNav />
        <h1 className="font-serif text-3xl">Dispatch board</h1>
        <DispatchAssignment />
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {(board.data ?? []).map(card => (
            <div key={card.vehicle.id} className="ticket-card border-l-4 border-l-accent p-5">
              <div className="font-serif text-2xl">{card.vehicle.code}</div>
              <div className="text-sm capitalize">{card.status.replace("_", " ")}</div>
              <div className="mt-2">{card.driver?.fullName ?? "Unassigned"}</div>
              <div className="text-sm text-muted-foreground">{card.location}</div>
              <div className="mt-2 font-medium">{card.route}</div>
              <div className="text-sm">
                {card.departure ? `${formatTime(card.departure)} → ETA ${card.eta ? formatTime(card.eta) : "—"}` : "Preparing"}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Next: {card.nextAssignment ? `${card.nextAssignment.route} ${formatTime(card.nextAssignment.departAt)}` : "None"}
              </div>
              {card.currentDepartureId ? (
                <Link href={`/admin/trips/${card.currentDepartureId}`} className="mt-3 inline-block text-sm text-accent">
                  Open trip
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
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
  const [capacity, setCapacity] = useState(10);
  const [mileage, setMileage] = useState(0);
  const [vin, setVin] = useState("");
  const [status, setStatus] = useState<"available" | "maintenance" | "out_of_service">("available");
  const [setupLink, setSetupLink] = useState("");
  return (
    <PageShell>
      <div className="container py-8">
        <AdminNav />
        <h1 className="font-serif text-3xl">Fleet</h1>
        <div className="mt-4 grid gap-3">
          {(vans.data ?? []).map(v => (
            <Link key={v.id} href={`/admin/fleet/${v.id}`} className="ticket-card block p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  {v.code} · {v.year} {v.make} {v.model}
                </span>
                <span className="capitalize">
                  {v.capacity} seats · {v.status.replace("_", " ")}
                </span>
              </div>
            </Link>
          ))}
        </div>
        <h2 className="mt-8 font-serif text-xl">Add vehicle</h2>
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
          <label className="grid gap-1 text-sm">Fleet code *<Input required placeholder="MP-005" value={code} onChange={e => setCode(e.target.value)} /></label>
          <label className="grid gap-1 text-sm">Make *<Input required placeholder="Ford" value={make} onChange={e => setMake(e.target.value)} /></label>
          <label className="grid gap-1 text-sm">Model *<Input required placeholder="Transit 350" value={model} onChange={e => setModel(e.target.value)} /></label>
          <label className="grid gap-1 text-sm">Year *<Input required type="number" min={1990} max={new Date().getFullYear() + 2} value={year} onChange={e => setYear(Number(e.target.value))} /></label>
          <label className="grid gap-1 text-sm">Paying passenger seats *<Input required type="number" min={1} max={40} value={capacity} onChange={e => setCapacity(Number(e.target.value))} /></label>
          <label className="grid gap-1 text-sm">Current mileage<Input required type="number" min={0} value={mileage} onChange={e => setMileage(Number(e.target.value))} /></label>
          <label className="grid gap-1 text-sm">VIN (optional)<Input value={vin} onChange={e => setVin(e.target.value)} /></label>
          <label className="grid gap-1 text-sm">Status<select className="h-10 rounded-md border border-input bg-white px-3" value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="out_of_service">Out of service</option></select></label>
          <Button type="submit" className="min-h-11 sm:col-span-2 lg:col-span-4" disabled={save.isPending}>{save.isPending ? "Saving…" : "Create vehicle"}</Button>
        </form>
        <h2 className="mt-8 font-serif text-xl">Drivers</h2>
        <div className="mt-3 grid gap-2">
          {(drivers.data ?? []).map(d => (
            <div key={d.id} className="ticket-card flex min-w-0 flex-wrap items-center gap-4 p-4 text-sm">
              <DriverPortrait profileId={d.idLast4 ? d.id : null} name={d.fullName} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{d.fullName}</div>
                <div className="break-words text-muted-foreground">{d.email} · {d.phone ?? "No phone"}</div>
                <div className="text-xs text-muted-foreground">{d.idLast4 ? `ID ending ${d.idLast4}` : "Profile details pending"} · {d.loginReady ? "Ready to sign in" : d.userId ? "Awaiting password setup" : "No driver login"} · {d.status}</div>
              </div>
              {d.userId && !d.loginReady && d.status === "active" ? <Button type="button" variant="outline" size="sm" disabled={reinvite.isPending} onClick={async () => {
                try { const result = await reinvite.mutateAsync({ profileId: d.id }); setSetupLink(`${window.location.origin}/driver/setup#token=${result.setupToken}`); toast.success("New one-time driver link ready to copy"); }
                catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not reissue setup link"); }
              }}>Reissue setup link</Button> : null}
            </div>
          ))}
        </div>
        {setupLink ? <div className="ticket-card mt-4 max-w-2xl p-4 text-sm">
          <p className="font-semibold">One-time link · copy now and share privately</p>
          <Input className="mt-2" aria-label="Reissued driver setup link" readOnly value={setupLink} onFocus={event => event.currentTarget.select()} />
          <Button className="mt-2" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(setupLink); toast.success("Copied"); } catch { toast.error("Select and copy the link above"); } }}>Copy link</Button>
        </div> : null}
        <DriverAccountForm drivers={drivers.data ?? []} onCreated={() => { void drivers.refetch(); setSetupLink(""); }} />
      </div>
    </PageShell>
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
    <PageShell>
      <div className="container py-8">
        <AdminNav />
        <h1 className="font-serif text-3xl">{v?.code}</h1>
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
            <p className="rounded-xl bg-secondary p-3 sm:col-span-2 lg:col-span-3">Capacity changes update only empty future scheduled departures. Booked/active departures retain their seat assignments; use another vehicle or finish those trips first.</p>
            <label className="form-field">Make<Input required value={make ?? v.make} onChange={event => setMake(event.target.value)} /></label>
            <label className="form-field">Model<Input required value={model ?? v.model} onChange={event => setModel(event.target.value)} /></label>
            <label className="form-field">Year<Input required type="number" min={1990} max={new Date().getFullYear() + 2} value={year ?? v.year} onChange={event => setYear(Number(event.target.value))} /></label>
            <label className="form-field">Paying passenger seats<Input required type="number" min={1} max={40} value={capacity ?? v.capacity} onChange={event => setCapacity(Number(event.target.value))} /></label>
            <label className="form-field">Current mileage<Input required type="number" min={0} value={mileage ?? v.currentMileage} onChange={event => setMileage(Number(event.target.value))} /></label>
            <label className="form-field">VIN<Input value={vin ?? v.vin ?? ""} onChange={event => setVin(event.target.value)} /></label>
            <label className="form-field">Status<select className="h-10 rounded-md border border-input bg-white px-3" value={status ?? v.status} onChange={event => setStatus(event.target.value as NonNullable<typeof status>)}><option value="available">Available</option><option value="assigned">Assigned</option><option value="in_transit">In transit</option><option value="maintenance">Maintenance</option><option value="out_of_service">Out of service</option></select></label>
            <label className="form-field">Registration expires<Input type="date" value={registration ?? date(v.registrationExpiresAt)} onChange={event => setRegistration(event.target.value)} /></label>
            <label className="form-field">Insurance expires<Input type="date" value={insurance ?? date(v.insuranceExpiresAt)} onChange={event => setInsurance(event.target.value)} /></label>
            <label className="form-field">Inspection expires<Input type="date" value={inspection ?? date(v.inspectionExpiresAt)} onChange={event => setInspection(event.target.value)} /></label>
            <div className="text-muted-foreground sm:col-span-2 lg:col-span-3">Assigned driver: {q.data?.driver?.fullName ?? "—"}</div>
            <Button type="submit" className="min-h-11 sm:col-span-2 lg:col-span-3" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save vehicle"}</Button>
          </form>
        ) : null}
        <h2 className="mt-8 font-serif text-xl">Maintenance</h2>
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
        <h2 className="mt-8 font-serif text-xl">Upcoming assignments</h2>
        {(q.data?.upcoming ?? []).filter(d => d.departAt > new Date() && d.status !== "canceled").sort((a, b) => a.departAt.getTime() - b.departAt.getTime()).map(d => (
          <Link key={d.id} href={`/admin/trips/${d.id}`} className="mt-2 block min-h-11 text-sm font-semibold text-primary underline">
            {formatDate(d.departAt)} {formatTime(d.departAt)} · {d.status}
          </Link>
        ))}
      </div>
    </PageShell>
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
    <PageShell>
      <div className="container py-8">
        <AdminNav />
        <h1 className="font-serif text-3xl">Routes</h1>
        {(routes.data ?? []).map(r => (
          <div key={r.id}>
            <RouteFareRow route={r} label={`${cityName(r.originCityId)} → ${cityName(r.destinationCityId)}`} onSave={next => save.mutate(next)} />
            <button type="button" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline" aria-expanded={editRouteId === r.id} onClick={() => setEditRouteId(current => current === r.id ? null : r.id)}>{editRouteId === r.id ? "Close route editor" : "Edit cities, stops & duration"}</button>
            {editRouteId === r.id ? <><p className="mt-2 text-xs text-muted-foreground">Existing departures keep their booked itinerary. To change cities, stops or duration after trips have been scheduled, create a new route instead; fares and activation can still be updated here.</p><RouteCreateForm key={r.id} cities={cities.data ?? []} locations={locs.data ?? []} initial={r} onSave={next => save.mutate(next)} /></> : null}
          </div>
        ))}
        {!routes.isLoading && !routes.data?.length ? <p className="ticket-card mt-4 p-4 text-sm">No routes configured. Add cities and pickup/drop-off locations before creating a route.</p> : null}
        <h2 className="mt-8 font-serif text-xl">Create route</h2>
        <RouteCreateForm cities={cities.data ?? []} locations={locs.data ?? []} onSave={value => save.mutate(value)} />
        <h2 className="mt-8 font-serif text-xl">New city (future routes)</h2>
        <CityForm onSave={v => addCity.mutate(v)} />
        <h2 className="mt-8 font-serif text-xl">Pickup / drop-off</h2>
        <LocationForm cities={cities.data ?? []} onSave={v => addLocation.mutate(v)} />
        <h2 className="mt-8 font-serif text-xl">Create departure</h2>
        <Link href="/admin/schedule" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">View and edit scheduled departures</Link>
        <DepartureForm
          routes={(routes.data ?? []).filter(route => route.isActive).map(route => ({ ...route, label: `${cityName(route.originCityId)} → ${cityName(route.destinationCityId)}` }))}
          vans={vans.data ?? []}
          drivers={(drivers.data ?? []).filter(driver => driver.status === "active" && driver.loginReady)}
          onCreate={v => createDep.mutate(v)}
        />
      </div>
    </PageShell>
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
        <Input type="number" value={standard} onChange={e => setStandard(Number(e.target.value))} />
      </label>
      <label className="form-field">
        Member's regular seat cents
        <Input type="number" value={member} onChange={e => setMember(Number(e.target.value))} />
      </label>
      <label className="form-field">
        Front seat cents (everyone)
        <Input type="number" value={front} onChange={e => setFront(Number(e.target.value))} />
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Active for sale</label>
      <Button
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
      <select className="h-10 rounded-md border px-2" value={cityId} onChange={e => setCityId(Number(e.target.value))}>
        {cities.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Input placeholder="Pickup label" value={label} onChange={e => setLabel(e.target.value)} required />
      <Input placeholder="Address" value={address} onChange={e => setAddress(e.target.value)} required />
      <Button type="submit">Add location</Button>
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
      <Input placeholder="CLE" value={code} onChange={e => setCode(e.target.value)} />
      <Input placeholder="Cleveland" value={name} onChange={e => setName(e.target.value)} />
      <Input placeholder="OH" value={state} onChange={e => setState(e.target.value)} />
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
      <label className="grid gap-1 text-sm">Route<select className="h-11 rounded-md border px-2" value={routeId} onChange={e => setRoute(Number(e.target.value))}>
        {routes.map(r => (
          <option key={r.id} value={r.id}>
            {r.label ?? `Route ${r.id}`}
          </option>
        ))}
      </select></label>
      <label className="grid gap-1 text-sm">Vehicle<select className="h-11 rounded-md border px-2" value={vehicleId} onChange={e => setVan(Number(e.target.value))}>
        {vans.map(v => (
          <option key={v.id} value={v.id}>
            {v.code}
          </option>
        ))}
      </select></label>
      <label className="grid gap-1 text-sm">Driver<select className="h-11 rounded-md border px-2" value={driverId} onChange={e => setDriver(Number(e.target.value))}>
        {drivers.map(d => (
          <option key={d.id} value={d.id}>
            {d.fullName}
          </option>
        ))}
      </select></label>
      <label className="grid gap-1 text-sm">Departure · Eastern Time<Input type="datetime-local" value={departAt} onChange={e => setDepart(e.target.value)} required /></label>
      {!drivers.length ? <p className="text-sm text-muted-foreground md:col-span-2">Create a driver account in Fleet and have the driver complete password setup before scheduling a departure.</p> : null}
      <Button type="submit" disabled={!drivers.length || !vans.length || !routes.length}>Create departure</Button>
    </form>
  );
}

export function AdminAnalytics() {
  return (
    <PageShell>
      <div className="container py-8">
        <AdminNav />
        <Suspense fallback={<p role="status" className="mt-5">Loading analytics…</p>}><AnalyticsDashboard /></Suspense>
      </div>
    </PageShell>
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
    <PageShell>
      <div className="container py-8">
        <AdminNav />
        <h1 className="font-serif text-3xl">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Existing trip fares are configured per route in <Link href="/admin/routes" className="font-semibold text-primary underline">Routes</Link>; changing default fares here does not reprice booked tickets. New membership prices apply to new subscriptions, not existing ones.</p>
        {s ? (
          <div className="mt-4 grid max-w-md gap-3">
            <label>
              Default standard fare cents
              <Input
                type="number"
                value={standard ?? s.standardFareCents}
                onChange={e => setStandard(Number(e.target.value))}
              />
            </label>
            <label>
              Default member regular-seat fare cents
              <Input type="number" value={member ?? s.memberFareCents} onChange={e => setMember(Number(e.target.value))} />
            </label>
            <label>
              Default front-seat fare cents
              <Input type="number" value={front ?? s.frontFareCents} onChange={e => setFront(Number(e.target.value))} />
            </label>
            <label>
              Membership cents / month
              <Input
                type="number"
                value={membership ?? s.membershipPriceCents}
                onChange={e => setMembership(Number(e.target.value))}
              />
            </label>
            <label>
              Membership benefits (one per line)
              <textarea
                id="membership-benefits"
                className="mt-1 min-h-28 w-full rounded-md border border-input p-3 text-sm"
                defaultValue={s.membershipBenefits.join("\n")}
              />
            </label>
            <Button
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
            <Button variant="outline" onClick={() => reminders.mutate()}>
              Record in-app reminders now
            </Button>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">Email, SMS and push delivery providers are not configured; running reminders records only in-app notices.</p>
        <h2 className="mt-10 font-serif text-xl">Activity log</h2>
        <div className="mt-3 space-y-1 text-xs">
          {(audit.data ?? []).map(a => (
            <div key={a.id}>
              {a.action} · {a.entityType} {a.entityId}
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
