import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatTime, parseServiceDateTimeInput, serviceDateTimeInput } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { AdminNav } from "./AdminPages";

export default function AdminSchedule() {
  const q = trpc.admin.schedule.useQuery();
  const routes = trpc.admin.routes.useQuery();
  const cities = trpc.admin.cities.useQuery();
  const vehicles = trpc.admin.vehicles.useQuery();
  const drivers = trpc.admin.drivers.useQuery();
  const utils = trpc.useUtils();
  const refresh = async () => { await Promise.all([utils.admin.schedule.invalidate(), utils.admin.upcomingDepartures.invalidate(), utils.admin.tripsToday.invalidate()]); };
  const save = trpc.admin.updateDeparture.useMutation({ onSuccess: async () => { await refresh(); toast.success("Departure updated"); }, onError: error => toast.error(error.message) });
  const cancel = trpc.admin.cancelDeparture.useMutation({ onSuccess: async () => { await refresh(); toast.success("Empty departure canceled"); }, onError: error => toast.error(error.message) });
  const cityName = (id: number) => cities.data?.find(city => city.id === id)?.name ?? "Unknown city";
  const routeLabel = (id: number) => { const route = routes.data?.find(item => item.id === id); return route ? `${cityName(route.originCityId)} → ${cityName(route.destinationCityId)}` : `Route ${id}`; };
  return <PageShell><main className="container py-8"><AdminNav /><h1 className="font-serif text-3xl">Trip schedule</h1><p className="mt-2 text-sm text-muted-foreground">View the next 60 departures. All schedule times are Eastern (New York/Columbus). Edits and cancellation are available only for future scheduled trips with no sold or held seats.</p>
    <Link href="/admin/routes" className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary underline">Create a departure</Link>
    {q.isLoading ? <p role="status" className="mt-4">Loading schedule…</p> : null}{q.error ? <p role="alert" className="mt-4">The schedule could not be loaded.</p> : null}
    <div className="mt-5 grid gap-4">{(q.data ?? []).map(item => <ScheduleCard key={item.departure.id} item={item} routes={routes.data ?? []} routeLabel={routeLabel}
      vehicles={vehicles.data ?? []} drivers={(drivers.data ?? []).filter(driver => driver.status === "active" && driver.loginReady)}
      saving={save.isPending} canceling={cancel.isPending}
      onSave={value => save.mutate(value)} onCancel={id => {
        if (window.confirm(`Cancel unbooked departure #${id}? This cannot be reversed.`)) cancel.mutate({ id });
      }} />)}{!q.isLoading && !q.data?.length ? <p className="ticket-card p-5 text-sm">No upcoming departures. Create one under Routes.</p> : null}</div>
  </main></PageShell>;
}

type ScheduleItem = { departure: { id: number; routeId: number; vehicleId: number | null; driverId: number | null;
  departAt: Date; arriveAt: Date; status: string; capacity: number; seatsSold: number; seatsHeld: number };
  routeLabel: string; vehicleCode: string | null; driverName: string | null; editable: boolean };
function ScheduleCard({ item, routes, routeLabel, vehicles, drivers, saving, canceling, onSave, onCancel }: {
  item: ScheduleItem; routes: { id: number; isActive: boolean }[]; routeLabel: (id: number) => string;
  vehicles: { id: number; code: string; capacity: number; status: string }[];
  drivers: { id: number; fullName: string }[]; saving: boolean; canceling: boolean;
  onSave: (value: { id: number; routeId: number; vehicleId: number; driverId: number; departAt: string; arriveAt: string }) => void;
  onCancel: (id: number) => void;
}) {
  const d = item.departure;
  const [editing, setEditing] = useState(false);
  const [routeId, setRouteId] = useState<number | null>(null);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [driverId, setDriverId] = useState<number | null>(null);
  const [departAt, setDepartAt] = useState<string | null>(null);
  const [arriveAt, setArriveAt] = useState<string | null>(null);
  return <article className="ticket-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div>
    <h2 className="font-serif text-xl">{item.routeLabel}</h2><p className="mt-1 text-sm">{formatDate(d.departAt)} · {formatTime(d.departAt)} → {formatTime(d.arriveAt)} · <span className="capitalize">{d.status}</span></p>
    <p className="text-sm text-muted-foreground">{item.vehicleCode ?? "Vehicle unassigned"} · {item.driverName ?? "Driver unassigned"} · {d.seatsSold}/{d.capacity} sold · {d.seatsHeld} held</p></div>
    <Link href={`/admin/trips/${d.id}`} className="inline-flex min-h-11 items-center font-semibold text-primary underline">Open trip</Link></div>
    {item.editable ? <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11" onClick={() => setEditing(value => !value)}>{editing ? "Close edit" : "Edit schedule"}</Button><Button type="button" variant="outline" className="min-h-11" disabled={canceling} onClick={() => onCancel(d.id)}>Cancel empty trip</Button></div> : <p className="mt-3 text-xs text-muted-foreground">Booked, in progress, canceled or already departed — changes require an operations review.</p>}
    {editing && item.editable ? <form className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={event => {
      event.preventDefault(); const start = parseServiceDateTimeInput(departAt ?? serviceDateTimeInput(d.departAt));
      const end = parseServiceDateTimeInput(arriveAt ?? serviceDateTimeInput(d.arriveAt));
      if (!start || !end || start <= new Date() || end <= start) { toast.error("Choose valid Eastern times: a future departure and a later arrival. Spring DST gaps are unavailable."); return; }
      const selectedVehicle = vehicleId ?? d.vehicleId;
      const selectedDriver = driverId ?? d.driverId;
      if (!selectedVehicle || !selectedDriver) { toast.error("Choose a vehicle and active driver"); return; }
      onSave({ id: d.id, routeId: routeId ?? d.routeId, vehicleId: selectedVehicle, driverId: selectedDriver, departAt: start.toISOString(), arriveAt: end.toISOString() });
    }}>
      <label className="form-field">Route<select className="h-11 rounded-md border border-input bg-white px-3" value={routeId ?? d.routeId} onChange={event => setRouteId(Number(event.target.value))}>{routes.filter(route => route.isActive).map(route => <option key={route.id} value={route.id}>{routeLabel(route.id)}</option>)}</select></label>
      <label className="form-field">Vehicle<select className="h-11 rounded-md border border-input bg-white px-3" value={vehicleId ?? d.vehicleId ?? ""} onChange={event => setVehicleId(Number(event.target.value))}>{vehicles.filter(vehicle => vehicle.status !== "maintenance" && vehicle.status !== "out_of_service").map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.code} · {vehicle.capacity} seats</option>)}</select></label>
      <label className="form-field">Driver<select className="h-11 rounded-md border border-input bg-white px-3" value={driverId ?? d.driverId ?? ""} onChange={event => setDriverId(Number(event.target.value))}>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.fullName}</option>)}</select></label>
      <label className="form-field">Departure · Eastern Time<Input required type="datetime-local" value={departAt ?? serviceDateTimeInput(d.departAt)} onChange={event => setDepartAt(event.target.value)} /></label>
      <label className="form-field">Arrival · Eastern Time<Input required type="datetime-local" value={arriveAt ?? serviceDateTimeInput(d.arriveAt)} onChange={event => setArriveAt(event.target.value)} /></label>
      <Button type="submit" className="min-h-11 self-end" disabled={saving}>{saving ? "Saving…" : "Save departure"}</Button>
    </form> : null}
  </article>;
}
