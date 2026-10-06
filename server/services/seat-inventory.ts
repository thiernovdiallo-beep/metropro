import { and, eq, isNotNull } from "drizzle-orm";
import { bookings, departures, passengers, routes, vehicles } from "../../drizzle/schema";
import { getDb } from "../db";
import { seatFareCents } from "./pricing";
import { getSeatLayout } from "./seat-layout";

type BookingStatus = typeof bookings.$inferSelect.status;
export type SeatAvailabilityStatus = "available" | "taken" | "held";
export type SeatAvailability = {
  seatNumber: string;
  seatType: "standard" | "front";
  status: SeatAvailabilityStatus;
  priceCents: number;
};

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
export async function getSeatAvailability(departureId: number): Promise<SeatAvailability[]> {
  if (!Number.isSafeInteger(departureId) || departureId < 1) {
    throw new Error("Invalid departure ID");
  }
  const db = await getDb();
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
  if (departure.vehicleCapacity === null) throw new Error("Departure has no assigned vehicle");
  // Existing holds use the departure's capacity snapshot. Never display extra
  // seats that those holds cannot sell after an administrator edits a vehicle.
  if (departure.vehicleCapacity !== departure.departureCapacity) {
    throw new Error("Departure capacity does not match its assigned vehicle");
  }

  const assignments = await db
    .select({
      seatNumber: passengers.seatNumber,
      bookingStatus: bookings.status,
      holdExpiresAt: bookings.holdExpiresAt,
    })
    .from(passengers)
    .innerJoin(bookings, eq(passengers.bookingId, bookings.id))
    .where(and(eq(passengers.departureId, departureId), isNotNull(passengers.seatNumber)));

  const now = new Date();
  const statusBySeat = new Map<string, SeatAvailabilityStatus>();
  for (const assignment of assignments) {
    if (assignment.seatNumber !== null) {
      statusBySeat.set(
        assignment.seatNumber,
        seatStatusForBooking(assignment.bookingStatus, assignment.holdExpiresAt, now)
      );
    }
  }

  return getSeatLayout(departure.vehicleCapacity).map(({ seatNumber, seatType }) => ({
    seatNumber,
    seatType,
    status: statusBySeat.get(seatNumber) ?? "available",
    // Member eligibility is passenger-specific and is applied during checkout.
    priceCents: seatFareCents(departure, seatType, false),
  }));
}
