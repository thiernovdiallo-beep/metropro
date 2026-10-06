import { StatusNotice } from "@/components/MetroUI";
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
  const loading = schedule.isLoading || vans.isLoading || drivers.isLoading;
  const unavailable = !loading && !upcoming.length;
  return <section className="ticket-card mt-6 p-5 sm:p-6" aria-labelledby="dispatch-assignment-title">
    <h2 id="dispatch-assignment-title" className="metro-section-title text-xl">Assign a vehicle and driver</h2>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Choose a future trip. Booked trips retain their exact seat capacity; the server rejects overlapping vehicle or driver assignments.</p>
    {loading ? <StatusNotice className="mt-4">Loading current trips, vehicle availability, and driver access…</StatusNotice> : null}
    {schedule.error || vans.error || drivers.error ? <StatusNotice tone="error" className="mt-4">Dispatch options could not be loaded. Reload the page before saving an assignment.</StatusNotice> : null}
    <form className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={event => {
      event.preventDefault();
      const chosenVan = vehicleId || chosen?.departure.vehicleId || 0;
      const chosenDriver = driverId || chosen?.departure.driverId || 0;
      if (!chosen || !chosenVan || !chosenDriver) { toast.error("Choose a trip, active vehicle and provisioned driver."); return; }
      assign.mutate({ departureId: chosen.departure.id, vehicleId: chosenVan, driverId: chosenDriver });
    }}>
      <label className="form-field">Trip<select required className="metro-control" disabled={loading || unavailable} value={departureId || ""} onChange={event => { setDepartureId(Number(event.target.value)); setVehicleId(0); setDriverId(0); }}><option value="">Select a trip</option>{upcoming.map(item => <option key={item.departure.id} value={item.departure.id}>{item.routeLabel} · {formatDate(item.departure.departAt)} {formatTime(item.departure.departAt)} · #{item.departure.id}</option>)}</select></label>
      <label className="form-field">Vehicle<select required className="metro-control" disabled={loading || !chosen} value={vehicleId || chosen?.departure.vehicleId || ""} onChange={event => setVehicleId(Number(event.target.value))}><option value="">Select a vehicle</option>{eligibleVans.map(van => <option key={van.id} value={van.id}>{van.code} · {van.capacity} seats</option>)}</select></label>
      <label className="form-field">Driver<select required className="metro-control" disabled={loading || !chosen} value={driverId || chosen?.departure.driverId || ""} onChange={event => setDriverId(Number(event.target.value))}><option value="">Select a driver</option>{readyDrivers.map(driver => <option key={driver.id} value={driver.id}>{driver.fullName}</option>)}</select></label>
      <Button type="submit" className="min-h-11 self-end" disabled={!chosen || assign.isPending || !eligibleVans.length || !readyDrivers.length}>{assign.isPending ? "Assigning…" : "Save assignment"}</Button>
    </form>
    {unavailable ? <StatusNotice tone="pending" className="mt-4">No future active trips are available for dispatch.</StatusNotice> : null}
    {chosen && !eligibleVans.length ? <StatusNotice tone="pending" className="mt-4">No eligible vehicle matches this trip’s capacity and service status.</StatusNotice> : null}
    {chosen && !readyDrivers.length ? <StatusNotice tone="pending" className="mt-4">No active driver with completed password setup is available.</StatusNotice> : null}
  </section>;
}
