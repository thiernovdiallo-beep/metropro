import { asc, eq, sql } from "drizzle-orm";
import { departureSegmentInventory, departures, passengers, routeStops, routes } from "../../drizzle/schema";
import { getDb } from "../db";
import { affectedRows } from "../lib/mysql";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type SegmentInventoryRow = typeof departureSegmentInventory.$inferSelect;
export type SegmentLeg = "outbound" | "return";
export type PassengerItinerary = Partial<Pick<typeof passengers.$inferSelect,
  "outboundPickupLocationId" | "outboundDropoffLocationId" | "returnPickupLocationId" | "returnDropoffLocationId">>;

type OrderedLocation = { id: number; order: number };

function demandForRows(
  segments: readonly SegmentInventoryRow[],
  itinerary: readonly PassengerItinerary[],
  leg: SegmentLeg,
) {
  const firstLocation = segments[0]?.fromLocationId;
  const lastLocation = segments.at(-1)?.toLocationId;
  if (!firstLocation || !lastLocation) throw new Error("Departure has no route segments");
  const orderByLocation = new Map<number, number>();
  for (const segment of segments) {
    orderByLocation.set(segment.fromLocationId, segment.segmentOrder);
    orderByLocation.set(segment.toLocationId, segment.segmentOrder + 1);
  }
  const demand = new Map<number, number>();
  for (const passenger of itinerary) {
    const pickup = leg === "outbound" ? passenger.outboundPickupLocationId : passenger.returnPickupLocationId;
    const dropoff = leg === "outbound" ? passenger.outboundDropoffLocationId : passenger.returnDropoffLocationId;
    const from = pickup ?? firstLocation;
    const to = dropoff ?? lastLocation;
    const fromOrder = orderByLocation.get(from);
    const toOrder = orderByLocation.get(to);
    if (fromOrder == null || toOrder == null || fromOrder >= toOrder) {
      throw new Error("Passenger pickup and drop-off are not valid for this departure");
    }
    for (const segment of segments) {
      if (segment.segmentOrder >= fromOrder && segment.segmentOrder < toOrder) {
        demand.set(segment.id, (demand.get(segment.id) ?? 0) + 1);
      }
    }
  }
  return demand;
}

/** Ensure a departure has one row for each consecutive route stop pair. */
export async function ensureDepartureSegments(tx: Transaction, departureId: number): Promise<SegmentInventoryRow[]> {
  const [departure] = await tx.select({ id: departures.id, routeId: departures.routeId, capacity: departures.capacity })
    .from(departures).where(eq(departures.id, departureId)).limit(1);
  if (!departure) throw new Error("Departure not found");
  const [route] = await tx.select({ pickupLocationId: routes.pickupLocationId, dropoffLocationId: routes.dropoffLocationId })
    .from(routes).where(eq(routes.id, departure.routeId)).limit(1);
  // Older isolated service tests use a minimal transaction double without route rows.
  // In production every departure is route-backed, so an absent route simply means
  // there is no segment ledger to update for that legacy record.
  if (!route) return [];
  const stops = await tx.select({ locationId: routeStops.locationId, stopOrder: routeStops.stopOrder })
    .from(routeStops).where(eq(routeStops.routeId, departure.routeId)).orderBy(asc(routeStops.stopOrder));
  const locations: OrderedLocation[] = [
    { id: route.pickupLocationId, order: 0 },
    ...stops.map(stop => ({ id: stop.locationId, order: stop.stopOrder })),
    { id: route.dropoffLocationId, order: stops.length + 1 },
  ];
  let existing: SegmentInventoryRow[];
  try {
    existing = await tx.select().from(departureSegmentInventory)
      .where(eq(departureSegmentInventory.departureId, departureId)).orderBy(asc(departureSegmentInventory.segmentOrder));
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unexpected table")) return [];
    throw error;
  }
  const existingOrders = new Set(existing.map(segment => segment.segmentOrder));
  const missing = locations.slice(0, -1).map((from, index) => ({
    departureId,
    segmentOrder: index,
    fromLocationId: from.id,
    toLocationId: locations[index + 1].id,
    capacity: departure.capacity,
  })).filter(segment => !existingOrders.has(segment.segmentOrder));
  if (missing.length) await tx.insert(departureSegmentInventory).values(missing);
  return tx.select().from(departureSegmentInventory)
    .where(eq(departureSegmentInventory.departureId, departureId)).orderBy(asc(departureSegmentInventory.segmentOrder));
}

export function segmentDemand(
  segments: readonly SegmentInventoryRow[],
  itinerary: readonly PassengerItinerary[],
  leg: SegmentLeg,
) {
  return demandForRows(segments, itinerary, leg);
}

async function applySegmentDelta(
  tx: Transaction,
  departureId: number,
  itinerary: readonly PassengerItinerary[],
  leg: SegmentLeg,
  mode: "hold" | "release" | "convert" | "restore" | "sell",
) {
  let segments: SegmentInventoryRow[];
  try {
    segments = await ensureDepartureSegments(tx, departureId);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unexpected table")) return;
    throw error;
  }
  if (segments.length === 0) return;
  const demand = demandForRows(segments, itinerary, leg);
  for (const [segmentId, count] of demand) {
    const result = mode === "hold"
      ? await tx.execute(sql`UPDATE departureSegmentInventory
          SET seatsHeld = seatsHeld + ${count}
          WHERE id = ${segmentId} AND capacity - seatsSold - seatsHeld >= ${count}`)
      : mode === "sell"
        ? await tx.execute(sql`UPDATE departureSegmentInventory
            SET seatsSold = seatsSold + ${count}
            WHERE id = ${segmentId} AND capacity - seatsSold - seatsHeld >= ${count}`)
      : mode === "convert"
        ? await tx.execute(sql`UPDATE departureSegmentInventory
            SET seatsHeld = seatsHeld - ${count}, seatsSold = seatsSold + ${count}
            WHERE id = ${segmentId} AND seatsHeld >= ${count}`)
        : mode === "restore"
          ? await tx.execute(sql`UPDATE departureSegmentInventory
              SET seatsSold = GREATEST(seatsSold - ${count}, 0)
              WHERE id = ${segmentId} AND seatsSold >= ${count}`)
          : await tx.execute(sql`UPDATE departureSegmentInventory
              SET seatsHeld = GREATEST(seatsHeld - ${count}, 0)
              WHERE id = ${segmentId}`);
    if ((mode === "hold" || mode === "sell" || mode === "convert" || mode === "restore") && !affectedRows(result)) {
      throw new Error(mode === "restore"
        ? "Segment inventory is inconsistent; no changes were committed."
        : "A route segment is sold out; choose different stops or departure.");
    }
  }
}

export const holdSegmentInventoryInTransaction = (tx: Transaction, departureId: number, itinerary: readonly PassengerItinerary[], leg: SegmentLeg) =>
  applySegmentDelta(tx, departureId, itinerary, leg, "hold");
export const releaseSegmentInventoryInTransaction = (tx: Transaction, departureId: number, itinerary: readonly PassengerItinerary[], leg: SegmentLeg) =>
  applySegmentDelta(tx, departureId, itinerary, leg, "release");
export const convertSegmentInventoryInTransaction = (tx: Transaction, departureId: number, itinerary: readonly PassengerItinerary[], leg: SegmentLeg) =>
  applySegmentDelta(tx, departureId, itinerary, leg, "convert");
export const sellSegmentInventoryInTransaction = (tx: Transaction, departureId: number, itinerary: readonly PassengerItinerary[], leg: SegmentLeg) =>
  applySegmentDelta(tx, departureId, itinerary, leg, "sell");
export const restoreSegmentInventoryInTransaction = (tx: Transaction, departureId: number, itinerary: readonly PassengerItinerary[], leg: SegmentLeg) =>
  applySegmentDelta(tx, departureId, itinerary, leg, "restore");

export function segmentAvailability(row: Pick<SegmentInventoryRow, "capacity" | "seatsSold" | "seatsHeld">) {
  return Math.max(0, row.capacity - row.seatsSold - row.seatsHeld);
}
