type DepartureCapacitySnapshot = {
  id: number;
  capacity: number;
  departAt: Date;
  status: string;
  seatsSold: number;
  seatsHeld: number;
};

/** Retune only empty future departures; never make a booked historical map larger or physically undersized. */
export function planVehicleCapacityRetune(
  assigned: readonly DepartureCapacitySnapshot[],
  passengerCapacity: number,
  now: Date
): number[] {
  const retune: number[] = [];
  for (const departure of assigned) {
    if (departure.status === "canceled") continue;
    const protectedTrip = departure.status !== "scheduled" || departure.seatsSold > 0 || departure.seatsHeld > 0;
    if (protectedTrip && departure.capacity > passengerCapacity) {
      throw new Error("This van has a booked or active departure whose assigned passenger seats exceed its new capacity.");
    }
    if (!protectedTrip && departure.departAt > now) retune.push(departure.id);
  }
  return retune;
}
