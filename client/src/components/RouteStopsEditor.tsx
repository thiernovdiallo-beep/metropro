import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

type Location = { id: number; label: string; address: string; cityId: number };
type Stop = { id: number; routeId: number; locationId: number; stopOrder: number; pickupAllowed: boolean; dropoffAllowed: boolean; location: Location | null };

export default function RouteStopsEditor({ routeId, locations }: { routeId: number; locations: Location[] }) {
  const q = trpc.admin.routeStops.useQuery({ routeId });
  const save = trpc.admin.saveRouteStop.useMutation({ onSuccess: () => { void q.refetch(); toast.success("Route stop saved"); }, onError: e => toast.error(e.message) });
  const remove = trpc.admin.deleteRouteStop.useMutation({ onSuccess: () => { void q.refetch(); toast.success("Route stop removed"); }, onError: e => toast.error(e.message) });
  const [locationId, setLocationId] = useState(0); const [stopOrder, setStopOrder] = useState(1); const [pickupAllowed, setPickupAllowed] = useState(true); const [dropoffAllowed, setDropoffAllowed] = useState(true);
  const routeLocations = locations;
  function reset() { setLocationId(0); setStopOrder((q.data?.length ?? 0) + 1); setPickupAllowed(true); setDropoffAllowed(true); }
  return <section className="ticket-card mt-3 p-5" aria-labelledby={`route-stops-${routeId}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id={`route-stops-${routeId}`} className="font-serif text-xl">Intermediate stops</h3><p className="mt-1 text-sm text-muted-foreground">Stops are shown in travel order. Existing booked itineraries are not changed.</p></div><span className="text-xs font-semibold text-muted-foreground">{q.data?.length ?? 0} configured</span></div>
    <div className="mt-4 grid gap-3">{(q.data ?? []).map(stop => <article key={stop.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3 text-sm"><div><strong>{stop.stopOrder}. {stop.location?.label ?? "Unknown location"}</strong><span className="mt-1 block text-xs text-muted-foreground">{stop.location?.address ?? ""} · Pickup {stop.pickupAllowed ? "yes" : "no"} · Drop-off {stop.dropoffAllowed ? "yes" : "no"}</span></div><Button type="button" size="sm" variant="outline" disabled={remove.isPending} onClick={() => remove.mutate({ id: stop.id })}>Remove</Button></article>)}</div>
    <form className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={event => { event.preventDefault(); const chosen = locationId || routeLocations[0]?.id; if (!chosen) { toast.error("Add a location first"); return; } save.mutate({ routeId, locationId: chosen, stopOrder, pickupAllowed, dropoffAllowed }); }}>
      <label className="form-field sm:col-span-2 lg:col-span-2">Location<select className="metro-control" value={locationId || routeLocations[0]?.id || 0} onChange={e => setLocationId(Number(e.target.value))}>{routeLocations.map(location => <option key={location.id} value={location.id}>{location.label} · {location.address}</option>)}</select></label>
      <label className="form-field">Order<Input className="metro-control" type="number" min={1} max={20} value={stopOrder} onChange={e => setStopOrder(Number(e.target.value))} /></label>
      <div className="flex flex-wrap items-end gap-4 pb-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={pickupAllowed} onChange={e => setPickupAllowed(e.target.checked)} /> Pickup</label><label className="flex items-center gap-2"><input type="checkbox" checked={dropoffAllowed} onChange={e => setDropoffAllowed(e.target.checked)} /> Drop-off</label></div>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4"><Button type="submit" disabled={save.isPending || !routeLocations.length}>{save.isPending ? "Saving…" : "Add stop"}</Button><Button type="button" variant="outline" onClick={reset}>Reset</Button></div>
    </form>
  </section>;
}
