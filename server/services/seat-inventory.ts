import { and, eq, isNotNull, or } from "drizzle-orm";
import { bookings, departures, passengers, routes, vehicles } from "../../drizzle/schema";
import { getDb } from "../db";
import { seatFareCents } from "./pricing";
import { getSeatLayout } from "./seat-layout";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type BookingStatus = typeof bookings.$inferSelect.status;
export type SeatAvailabilityStatus = "available" | "taken" | "held";
export type SeatAvailability = {
  seatNumber: string;
  seatType: "standard" | "front";
  status: SeatAvailabilityStatus;
  priceCents: number;
};

export function capacityForSeatMap(vehicleCapacity: number | null, departureCapacity: number) {
  if (vehicleCapacity === null) throw new Error("Departure has no assigned vehicle");
  if (vehicleCapacity < departureCapacity) throw new Error("Departure capacity exceeds its assigned vehicle");
  return departureCapacity;
}

/** A confirmed booking is paid; pending payments hold a seat only until their deadline. */
export function seatStatusForBooking(
  bookingStatus: BookingStatus,
  holdExpiresAt: Date | null,
  now: Date
): SeatAvailabilityStatus {
  switch (bookingStatus) {
    case "confirmed":
      return "taken";
    case "pending_payment":
      return holdExpiresAt && holdExpiresAt > now ? "held" : "available";
    case "canceled":
    case "refunded":
      return "available";
  }
}

/** Public, non-member fare and assignment state for every physical seat in a departure. */
export async function getSeatAvailability(departureId: number, transaction?: Transaction): Promise<SeatAvailability[]> {
  if (!Number.isSafeInteger(departureId) || departureId < 1) {
    throw new Error("Invalid departure ID");
  }
  const db = transaction ?? await getDb();
  if (!db) throw new Error("Database unavailable");

  const [departure] = await db
    .select({
      vehicleCapacity: vehicles.capacity,
      departureCapacity: departures.capacity,
      standardFareCents: routes.standardFareCents,
      memberFareCents: routes.memberFareCents,
      frontFareCents: routes.frontFareCents,
    })
    .from(departures)
    .leftJoin(vehicles, eq(departures.vehicleId, vehicles.id))
    .innerJoin(routes, eq(departures.routeId, routes.id))
    .where(eq(departures.id, departureId))
    .limit(1);

  if (!departure) throw new Error("Departure not found");
  // Existing holds use the departure's snapshot; a later vehicle expansion
  // must never add seats to previously reserved departures. A smaller vehicle
  // cannot safely serve a larger departure without explicit reassignment.
  const capacity = capacityForSeatMap(departure.vehicleCapacity, departure.departureCapacity);

  const assignments = await db
    .select({
      departureId: passengers.departureId,
      seatNumber: passengers.seatNumber,
      returnDepartureId: passengers.returnDepartureId,
      returnSeatNumber: passengers.returnSeatNumber,
      bookingStatus: bookings.status,
      holdExpiresAt: bookings.holdExpiresAt,
    })
    .from(passengers)
    .innerJoin(bookings, eq(passengers.bookingId, bookings.id))
    .where(or(
      and(eq(passengers.departureId, departureId), isNotNull(passengers.seatNumber)),
      and(eq(passengers.returnDepartureId, departureId), isNotNull(passengers.returnSeatNumber))
    ));

  const now = new Date();
  const statusBySeat = new Map<string, SeatAvailabilityStatus>();
  for (const assignment of assignments) {
    const seatNumber = assignment.departureId === departureId ? assignment.seatNumber : assignment.returnSeatNumber;
    if (!seatNumber) continue;
    const status = seatStatusForBooking(assignment.bookingStatus, assignment.holdExpiresAt, now);
    const previous = statusBySeat.get(seatNumber);
    if (status === "taken" || (status === "held" && previous !== "taken") || !previous) statusBySeat.set(seatNumber, status);
  }

  return getSeatLayout(capacity).map(({ seatNumber, seatType }) => ({
    seatNumber,
    seatType,
    status: statusBySeat.get(seatNumber) ?? "available",
    // Member eligibility is passenger-specific and is applied during checkout.
    priceCents: seatFareCents(departure, seatType, false),
  }));
}
