import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatTime, money, occupancyLabel } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { useState } from "react";

function AdminNav() {
  return (
    <nav className="mb-6 flex flex-wrap gap-3 text-sm">
      <Link href="/admin">Ops</Link>
      <Link href="/admin/dispatch">Dispatch</Link>
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
  const refund = trpc.admin.refundBooking.useMutation({ onSuccess: () => toast.success("Refunded") });
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
            <div key={p.id} className="ticket-card flex justify-between p-4 text-sm">
              <span>
                {p.firstName} {p.lastName} · {p.status} · {p.bookingNumber}
              </span>
              <span>
                {p.paymentStatus}
                {p.paymentStatus === "confirmed" ? (
                  <Button
                    className="ml-2"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      refund.mutate({ bookingId: p.bookingId, reason: "admin refund" });
                    }}
                  >
                    Refund
                  </Button>
                ) : null}
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
  const save = trpc.admin.saveVehicle.useMutation({ onSuccess: () => vans.refetch() });
  const invite = trpc.admin.inviteDriver.useMutation({ onSuccess: () => drivers.refetch() });
  const [code, setCode] = useState("MP-005");
  return (
    <PageShell>
      <div className="container py-8">
        <AdminNav />
        <h1 className="font-serif text-3xl">Fleet</h1>
        <div className="mt-4 grid gap-3">
          {(vans.data ?? []).map(v => (
            <Link key={v.id} href={`/admin/fleet/${v.id}`} className="ticket-card block p-4">
              <div className="flex justify-between">
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
          className="mt-3 grid gap-2 md:grid-cols-3"
          onSubmit={e => {
            e.preventDefault();
            save.mutate({
              code,
              make: "Ford",
              model: "Transit 350",
              year: 2024,
              capacity: 10,
              currentMileage: 0,
              status: "available",
            });
          }}
        >
          <Input value={code} onChange={e => setCode(e.target.value)} />
          <Button type="submit">Create</Button>
        </form>
        <h2 className="mt-8 font-serif text-xl">Drivers</h2>
        <div className="mt-3 grid gap-2">
          {(drivers.data ?? []).map(d => (
            <div key={d.id} className="ticket-card p-3 text-sm">
              {d.fullName} · {d.email} · {d.status}
            </div>
          ))}
        </div>
        <InviteDriver onInvite={input => invite.mutate(input)} />
      </div>
    </PageShell>
  );
}

function InviteDriver({
  onInvite,
}: {
  onInvite: (v: { fullName: string; email: string }) => void;
}) {
  const [fullName, setName] = useState("");
  const [email, setEmail] = useState("");
  return (
    <form
      className="mt-4 flex gap-2"
      onSubmit={e => {
        e.preventDefault();
        onInvite({ fullName, email });
      }}
    >
      <Input placeholder="Driver name" value={fullName} onChange={e => setName(e.target.value)} required />
      <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
      <Button type="submit">Invite driver</Button>
    </form>
  );
}

export function AdminVehicle() {
  const [, params] = useRoute("/admin/fleet/:id");
  const id = Number(params?.id);
  const q = trpc.admin.vehicle.useQuery({ id }, { enabled: Boolean(id) });
  const save = trpc.admin.saveVehicle.useMutation({ onSuccess: () => toast.success("Saved") });
  const maint = trpc.admin.addMaintenance.useMutation({ onSuccess: () => q.refetch() });
  const v = q.data?.vehicle;
  const [capacity, setCapacity] = useState<number | null>(null);
  return (
    <PageShell>
      <div className="container py-8">
        <AdminNav />
        <h1 className="font-serif text-3xl">{v?.code}</h1>
        {v ? (
          <div className="ticket-card mt-4 space-y-2 p-5 text-sm">
            <div>VIN {v.vin}</div>
            <div>
              {v.year} {v.make} {v.model}
            </div>
            <div>Mileage {v.currentMileage}</div>
            <div>Status {v.status}</div>
            <div>Assigned driver {q.data?.driver?.fullName ?? "—"}</div>
            <label className="block">
              Capacity
              <Input
                className="mt-1"
                type="number"
                value={capacity ?? v.capacity}
                onChange={e => setCapacity(Number(e.target.value))}
              />
            </label>
            <Button
              onClick={() =>
                save.mutate({
                  id: v.id,
                  code: v.code,
                  vin: v.vin ?? undefined,
                  make: v.make,
                  model: v.model,
                  year: v.year,
                  capacity: capacity ?? v.capacity,
                  currentMileage: v.currentMileage,
                  status: v.status,
                })
              }
            >
              Save capacity
            </Button>
            <div>Registration {v.registrationExpiresAt ? formatDate(v.registrationExpiresAt) : "—"}</div>
            <div>Insurance {v.insuranceExpiresAt ? formatDate(v.insuranceExpiresAt) : "—"}</div>
            <div>Inspection {v.inspectionExpiresAt ? formatDate(v.inspectionExpiresAt) : "—"}</div>
          </div>
        ) : null}
        <h2 className="mt-8 font-serif text-xl">Maintenance</h2>
        {(q.data?.maintenance ?? []).map(m => (
          <div key={m.id} className="text-sm">
            {formatDate(m.performedAt)} · {m.type} · {m.notes}
          </div>
        ))}
        <Button
          className="mt-3"
          variant="outline"
          onClick={() =>
            maint.mutate({
              vehicleId: id,
              type: "Inspection",
              notes: "Logged from dashboard",
              performedAt: new Date().toISOString(),
            })
          }
        >
          Log inspection
        </Button>
        <h2 className="mt-8 font-serif text-xl">Upcoming assignments</h2>
        {(q.data?.upcoming ?? []).map(d => (
          <div key={d.id} className="text-sm">
            {formatDate(d.departAt)} {formatTime(d.departAt)} · {d.status}
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export function AdminRoutes() {
  const routes = trpc.admin.routes.useQuery();
  const cities = trpc.admin.cities.useQuery();
  const locs = trpc.admin.locations.useQuery();
  const save = trpc.admin.saveRoute.useMutation({ onSuccess: () => routes.refetch() });
  const addCity = trpc.admin.addCity.useMutation({ onSuccess: () => cities.refetch() });
  const createDep = trpc.admin.createDeparture.useMutation({ onSuccess: () => toast.success("Departure created") });
  const vans = trpc.admin.vehicles.useQuery();
  const drivers = trpc.admin.drivers.useQuery();
  const addLocation = trpc.admin.addLocation.useMutation({ onSuccess: () => locs.refetch() });
  return (
    <PageShell>
      <div className="container py-8">
        <AdminNav />
        <h1 className="font-serif text-3xl">Routes</h1>
        {(routes.data ?? []).map(r => (
          <RouteFareRow key={r.id} route={r} onSave={next => save.mutate(next)} />
        ))}
        <h2 className="mt-8 font-serif text-xl">New city (future routes)</h2>
        <CityForm onSave={v => addCity.mutate(v)} />
        <h2 className="mt-8 font-serif text-xl">Pickup / drop-off</h2>
        <LocationForm cities={cities.data ?? []} onSave={v => addLocation.mutate(v)} />
        <h2 className="mt-8 font-serif text-xl">Create departure</h2>
        <DepartureForm
          routes={routes.data ?? []}
          vans={vans.data ?? []}
          drivers={drivers.data ?? []}
          onCreate={v => createDep.mutate(v)}
        />
      </div>
    </PageShell>
  );
}

function RouteFareRow({
  route,
  onSave,
}: {
  route: {
    id: number;
    originCityId: number;
    destinationCityId: number;
    pickupLocationId: number;
    dropoffLocationId: number;
    estimatedMinutes: number;
    standardFareCents: number;
    memberFareCents: number;
    isActive: boolean;
  };
  onSave: (v: typeof route) => void;
}) {
  const [standard, setStandard] = useState(route.standardFareCents);
  const [member, setMember] = useState(route.memberFareCents);
  return (
    <div className="ticket-card mt-3 flex flex-wrap items-end gap-3 p-4 text-sm">
      <div>
        Route #{route.id} · {route.estimatedMinutes} min
      </div>
      <label>
        Standard cents
        <Input type="number" value={standard} onChange={e => setStandard(Number(e.target.value))} />
      </label>
      <label>
        Member cents
        <Input type="number" value={member} onChange={e => setMember(Number(e.target.value))} />
      </label>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onSave({ ...route, standardFareCents: standard, memberFareCents: member })}
      >
        Save fares
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
      className="mt-3 flex gap-2"
      onSubmit={e => {
        e.preventDefault();
        onSave({ code, name, state });
      }}
    >
      <Input placeholder="CLE" value={code} onChange={e => setCode(e.target.value)} />
      <Input placeholder="Cleveland" value={name} onChange={e => setName(e.target.value)} />
      <Input placeholder="OH" value={state} onChange={e => setState(e.target.value)} />
      <Button type="submit">Add city</Button>
    </form>
  );
}

function DepartureForm({
  routes,
  vans,
  drivers,
  onCreate,
}: {
  routes: { id: number; estimatedMinutes: number }[];
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
        const start = new Date(departAt);
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
      <select className="h-10 rounded-md border px-2" value={routeId} onChange={e => setRoute(Number(e.target.value))}>
        {routes.map(r => (
          <option key={r.id} value={r.id}>
            Route {r.id}
          </option>
        ))}
      </select>
      <select className="h-10 rounded-md border px-2" value={vehicleId} onChange={e => setVan(Number(e.target.value))}>
        {vans.map(v => (
          <option key={v.id} value={v.id}>
            {v.code}
          </option>
        ))}
      </select>
      <select className="h-10 rounded-md border px-2" value={driverId} onChange={e => setDriver(Number(e.target.value))}>
        {drivers.map(d => (
          <option key={d.id} value={d.id}>
            {d.fullName}
          </option>
        ))}
      </select>
      <Input type="datetime-local" value={departAt} onChange={e => setDepart(e.target.value)} required />
      <Button type="submit">Create departure</Button>
    </form>
  );
}

export function AdminAnalytics() {
  const q = trpc.admin.analytics.useQuery();
  const a = q.data;
  return (
    <PageShell>
      <div className="container py-8">
        <AdminNav />
        <h1 className="font-serif text-3xl">Analytics</h1>
        {a ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="ticket-card p-5">
              <h2 className="font-serif text-xl">Occupancy by route</h2>
              {a.occupancyByRoute.map(r => (
                <div key={r.routeId} className="mt-2 flex justify-between text-sm">
                  <span>Route {r.routeId}</span>
                  <span>
                    {occupancyLabel(r.occupancyPercent)} · {r.band}
                  </span>
                </div>
              ))}
            </div>
            <div className="ticket-card p-5">
              <h2 className="font-serif text-xl">Revenue</h2>
              <div className="text-sm">Avg ticket {money(a.averageTicketCents)}</div>
              <div className="text-sm">Membership {money(a.membershipRevenueCents)}</div>
              <div className="text-sm">Active members {a.activeMembers}</div>
              <div className="text-sm">Repeat customers {a.repeatCustomerPercent}%</div>
              <div className="text-sm">Cancel rate {a.cancellationRate}%</div>
              <div className="text-sm">No-show rate {a.noShowRate}%</div>
            </div>
            <div className="ticket-card p-5">
              <h2 className="font-serif text-xl">Popular days</h2>
              {a.popularDays.map(d => (
                <div key={d.day} className="flex justify-between text-sm">
                  <span>{d.day}</span>
                  <span>{d.seats}</span>
                </div>
              ))}
            </div>
            <div className="ticket-card p-5">
              <h2 className="font-serif text-xl">Add-a-van signals</h2>
              {(a.addVanSignals ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No routes at 70%+ occupancy yet.</p>
              ) : (
                a.addVanSignals.map(s => (
                  <div key={s.routeId} className="text-sm">
                    Route {s.routeId}: {s.band}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}

export function AdminSettings() {
  const q = trpc.admin.settings.useQuery();
  const save = trpc.admin.saveSettings.useMutation({ onSuccess: () => toast.success("Saved") });
  const reminders = trpc.admin.runReminders.useMutation({
    onSuccess: r => toast.success(`Reminders ${r.sent24h}/${r.sentBoarding}`),
  });
  const audit = trpc.admin.audit.useQuery();
  const s = q.data;
  const [standard, setStandard] = useState<number | null>(null);
  const [member, setMember] = useState<number | null>(null);
  const [membership, setMembership] = useState<number | null>(null);
  return (
    <PageShell>
      <div className="container py-8">
        <AdminNav />
        <h1 className="font-serif text-3xl">Settings</h1>
        {s ? (
          <div className="mt-4 grid max-w-md gap-3">
            <label>
              Standard fare cents
              <Input
                type="number"
                value={standard ?? s.standardFareCents}
                onChange={e => setStandard(Number(e.target.value))}
              />
            </label>
            <label>
              Member fare cents
              <Input type="number" value={member ?? s.memberFareCents} onChange={e => setMember(Number(e.target.value))} />
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
              Run reminders now
            </Button>
          </div>
        ) : null}
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
