import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

type City = { id: number; name: string };
type Location = { id: number; cityId: number; label: string };
export type RouteDraft = {
  originCityId: number; destinationCityId: number; pickupLocationId: number; dropoffLocationId: number;
  estimatedMinutes: number; standardFareCents: number; memberFareCents: number; frontFareCents: number; isActive: boolean;
};

export default function RouteCreateForm({ cities, locations, onSave, initial }: {
  cities: City[]; locations: Location[]; initial?: RouteDraft & { id: number };
  onSave: (value: RouteDraft & { id?: number }) => void;
}) {
  const [originId, setOriginId] = useState(initial?.originCityId ?? 0);
  const [destinationId, setDestinationId] = useState(initial?.destinationCityId ?? 0);
  const [pickupId, setPickupId] = useState(initial?.pickupLocationId ?? 0);
  const [dropoffId, setDropoffId] = useState(initial?.dropoffLocationId ?? 0);
  const [minutes, setMinutes] = useState(initial?.estimatedMinutes ?? 540);
  const [regular, setRegular] = useState(initial?.standardFareCents ?? 15000);
  const [member, setMember] = useState(initial?.memberFareCents ?? 10000);
  const [front, setFront] = useState(initial?.frontFareCents ?? 20000);
  const [active, setActive] = useState(initial?.isActive ?? true);
  const from = originId || cities[0]?.id || 0;
  const to = destinationId !== from && destinationId ? destinationId : cities.find(city => city.id !== from)?.id ?? 0;
  const pickups = locations.filter(location => location.cityId === from);
  const dropoffs = locations.filter(location => location.cityId === to);
  const pickup = pickups.some(location => location.id === pickupId) ? pickupId : pickups[0]?.id ?? 0;
  const dropoff = dropoffs.some(location => location.id === dropoffId) ? dropoffId : dropoffs[0]?.id ?? 0;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!from || !to || !pickup || !dropoff) {
      toast.error("Select two cities and matching pickup/drop-off locations first.");
      return;
    }
    onSave({ ...(initial ? { id: initial.id } : {}), originCityId: from, destinationCityId: to, pickupLocationId: pickup, dropoffLocationId: dropoff,
      estimatedMinutes: minutes, standardFareCents: regular, memberFareCents: member, frontFareCents: front, isActive: active });
  }
  return <form className="ticket-card mt-3 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4" onSubmit={submit}>
    <label className="form-field">From<select className="h-10 rounded-md border border-input bg-white px-3" value={from} onChange={event => { setOriginId(Number(event.target.value)); setPickupId(0); setDropoffId(0); }}>
      {cities.map(city => <option key={city.id} value={city.id}>{city.name}</option>)}
    </select></label>
    <label className="form-field">To<select className="h-10 rounded-md border border-input bg-white px-3" value={to} onChange={event => { setDestinationId(Number(event.target.value)); setDropoffId(0); }}>
      {cities.filter(city => city.id !== from).map(city => <option key={city.id} value={city.id}>{city.name}</option>)}
    </select></label>
    <label className="form-field">Pickup<select className="h-10 rounded-md border border-input bg-white px-3" value={pickup} onChange={event => setPickupId(Number(event.target.value))}>
      {pickups.map(location => <option key={location.id} value={location.id}>{location.label}</option>)}
    </select></label>
    <label className="form-field">Drop-off<select className="h-10 rounded-md border border-input bg-white px-3" value={dropoff} onChange={event => setDropoffId(Number(event.target.value))}>
      {dropoffs.map(location => <option key={location.id} value={location.id}>{location.label}</option>)}
    </select></label>
    <label className="form-field">Estimated travel minutes<Input required type="number" min={1} max={2880} value={minutes} onChange={event => setMinutes(Number(event.target.value))} /></label>
    <label className="form-field">Regular fare cents<Input required type="number" min={0} value={regular} onChange={event => setRegular(Number(event.target.value))} /></label>
    <label className="form-field">Member regular fare cents<Input required type="number" min={0} value={member} onChange={event => setMember(Number(event.target.value))} /></label>
    <label className="form-field">Front fare cents<Input required type="number" min={0} value={front} onChange={event => setFront(Number(event.target.value))} /></label>
    {initial ? <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Active for sale</label> : null}
    <Button type="submit" className="min-h-11 sm:col-span-2 lg:col-span-4" disabled={!from || !to || !pickup || !dropoff}>{initial ? "Save route changes" : "Create active route"}</Button>
  </form>;
}
