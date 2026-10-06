import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

export default function DispatchAssignment() {
  const schedule = trpc.admin.schedule.useQuery();
  const vans = trpc.admin.vehicles.useQuery();
  const drivers = trpc.admin.drivers.useQuery();
  const utils = trpc.useUtils();
  const [departureId, setDepartureId] = useState(0);
  const [vehicleId, setVehicleId] = useState(0);
  const [driverId, setDriverId] = useState(0);
  const upcoming = (schedule.data ?? []).filter(item => item.departure.departAt > new Date() &&
    ["scheduled", "boarding", "delayed"].includes(item.departure.status));
  const chosen = upcoming.find(item => item.departure.id === departureId);
  const fixedCapacity = Boolean(chosen && (chosen.departure.seatsSold > 0 || chosen.departure.seatsHeld > 0 || chosen.departure.status !== "scheduled"));
  const eligibleVans = (vans.data ?? []).filter(van => !["maintenance", "out_of_service"].includes(van.status) &&
    (!fixedCapacity || van.capacity === chosen?.departure.capacity));
  const readyDrivers = (drivers.data ?? []).filter(driver => driver.status === "active" && driver.loginReady);
  const assign = trpc.admin.assignTrip.useMutation({ onSuccess: async () => {
    await Promise.all([utils.admin.dispatchBoard.invalidate(), utils.admin.schedule.invalidate(), utils.admin.tripsToday.invalidate()]);
    toast.success("Trip assignment updated");
  }, onError: error => toast.error(error.message) });
  return <section className="ticket-card mt-6 p-5" aria-labelledby="dispatch-assignment-title">
    <h2 id="dispatch-assignment-title" className="font-serif text-xl">Assign a vehicle and driver</h2>
    <p className="mt-1 text-sm text-muted-foreground">Choose a future trip. Booked trips retain their exact seat capacity; the server rejects overlapping vehicle or driver assignments.</p>
    <form className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={event => {
      event.preventDefault();
      const chosenVan = vehicleId || chosen?.departure.vehicleId || 0;
      const chosenDriver = driverId || chosen?.departure.driverId || 0;
      if (!chosen || !chosenVan || !chosenDriver) { toast.error("Choose a trip, active vehicle and provisioned driver."); return; }
      assign.mutate({ departureId: chosen.departure.id, vehicleId: chosenVan, driverId: chosenDriver });
    }}>
      <label className="grid gap-1 text-sm font-semibold">Trip<select required className="h-11 min-w-0 rounded-md border border-input bg-white px-3" value={departureId || ""} onChange={event => { setDepartureId(Number(event.target.value)); setVehicleId(0); setDriverId(0); }}><option value="">Select a trip</option>{upcoming.map(item => <option key={item.departure.id} value={item.departure.id}>{item.routeLabel} · {formatDate(item.departure.departAt)} {formatTime(item.departure.departAt)} · #{item.departure.id}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-semibold">Vehicle<select required className="h-11 min-w-0 rounded-md border border-input bg-white px-3" value={vehicleId || chosen?.departure.vehicleId || ""} onChange={event => setVehicleId(Number(event.target.value))}><option value="">Select a vehicle</option>{eligibleVans.map(van => <option key={van.id} value={van.id}>{van.code} · {van.capacity} seats</option>)}</select></label>
      <label className="grid gap-1 text-sm font-semibold">Driver<select required className="h-11 min-w-0 rounded-md border border-input bg-white px-3" value={driverId || chosen?.departure.driverId || ""} onChange={event => setDriverId(Number(event.target.value))}><option value="">Select a driver</option>{readyDrivers.map(driver => <option key={driver.id} value={driver.id}>{driver.fullName}</option>)}</select></label>
      <Button type="submit" className="min-h-11 self-end" disabled={!chosen || assign.isPending || !eligibleVans.length || !readyDrivers.length}>{assign.isPending ? "Assigning…" : "Save assignment"}</Button>
    </form>
    {!upcoming.length && !schedule.isLoading ? <p className="mt-3 text-sm text-muted-foreground">No future active trips are available for dispatch.</p> : null}
    {schedule.error || vans.error || drivers.error ? <p role="alert" className="mt-3 text-sm text-destructive">Dispatch options could not be loaded. Reload the page.</p> : null}
  </section>;
}
