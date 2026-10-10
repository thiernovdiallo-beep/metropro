import { TRPCError } from "@trpc/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { bookings, departures, memberships, passengers, tickets } from "../../drizzle/schema";
import { getActiveMembership, getDb } from "../db";
import { affectedRows } from "../lib/mysql";
import { getSeatAvailability } from "./seat-inventory";
import { validateNumberedSeats } from "./seat-selection";
import { TEMPLATES, notify } from "./notifications";
import { canSelfServeChange, getSettings } from "./policies";
import { makeQrToken } from "./tickets";
import { restoreSegmentInventoryInTransaction, sellSegmentInventoryInTransaction } from "./segment-inventory";

export type RescheduleRequest = {
  bookingId: number;
  newOutboundDepartureId: number;
  newReturnDepartureId: number | null;
  outboundSeats: string[];
  returnSeats: string[] | null;
};

/** Paid seats must always have a real physical assignment after a change. */
export async function rescheduleWithNumberedSeats(input: RescheduleRequest, actorUserId: number, isAdmin = false) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const settings = await getSettings();
  const outcome = await db.transaction(async tx => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1).for("update");
    if (!booking || (!isAdmin && booking.userId !== actorUserId)) throw new TRPCError({ code: "NOT_FOUND" });
    if (booking.status !== "confirmed") throw new TRPCError({ code: "BAD_REQUEST", message: "Only confirmed bookings can be rescheduled." });
    if (!booking.userId || booking.usedFreeReschedule) throw new TRPCError({ code: "BAD_REQUEST", message: "This booking has no eligible unused member reschedule." });
    if (Boolean(booking.returnDepartureId) !== Boolean(input.newReturnDepartureId) ||
        Boolean(booking.returnDepartureId) !== Boolean(input.returnSeats)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Select real replacement seats for every booked leg." });
    }
    if (input.newOutboundDepartureId === booking.outboundDepartureId ||
        input.newReturnDepartureId === booking.returnDepartureId ||
        input.newReturnDepartureId === input.newOutboundDepartureId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Choose different departures for every booked leg." });
    }
    const personRows = await tx.select().from(passengers).where(eq(passengers.bookingId, booking.id)).orderBy(passengers.id);
    if (personRows.length !== booking.passengerCount || input.outboundSeats.length !== personRows.length ||
        (booking.returnDepartureId && input.returnSeats?.length !== personRows.length)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Choose one numbered seat per traveler on each leg." });
    }
    if (personRows.some(person => person.status !== "booked")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A traveler has already checked in or boarded; contact operations." });
    }
    const currentMembership = await getActiveMembership(booking.userId);
    if (!currentMembership) throw new TRPCError({ code: "BAD_REQUEST", message: "An active membership is required for the complimentary reschedule." });
    const [membership] = await tx.select().from(memberships).where(eq(memberships.id, currentMembership.id)).limit(1).for("update");
    if (!membership || membership.status !== "active" || membership.freeReschedulesRemaining < 1) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No complimentary reschedules remain on this membership." });
    }

    // Booking then departure rows are locked in stable order. A concurrent
    // checkout, cancel, refund or reschedule must wait until every leg commits.
    const ids = [...new Set([booking.outboundDepartureId, ...(booking.returnDepartureId ? [booking.returnDepartureId] : []),
      input.newOutboundDepartureId, ...(input.newReturnDepartureId ? [input.newReturnDepartureId] : [])])].sort((a, b) => a - b);
    const tripById = new Map<number, typeof departures.$inferSelect>();
    for (const id of ids) {
      const [trip] = await tx.select().from(departures).where(eq(departures.id, id)).limit(1).for("update");
      if (!trip) throw new TRPCError({ code: "NOT_FOUND", message: "A selected departure is no longer available." });
      tripById.set(id, trip);
    }
    const oldOut = tripById.get(booking.outboundDepartureId)!;
    const newOut = tripById.get(input.newOutboundDepartureId)!;
    const oldRet = booking.returnDepartureId ? tripById.get(booking.returnDepartureId)! : null;
    const newRet = input.newReturnDepartureId ? tripById.get(input.newReturnDepartureId)! : null;
    if (!canSelfServeChange(oldOut.departAt, settings.cancelCutoffHours)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This trip is past the eligible reschedule cutoff." });
    }
    if (newOut.routeId !== oldOut.routeId || (oldRet && newRet?.routeId !== oldRet.routeId) ||
        (newRet && newRet.departAt <= newOut.arriveAt)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Choose later departures on the originally booked route(s)." });
    }
    const now = new Date();
    if ([newOut, ...(newRet ? [newRet] : [])].some(trip => trip.departAt <= now || !["scheduled", "boarding", "delayed"].includes(trip.status))) {
      throw new TRPCError({ code: "CONFLICT", message: "A replacement trip is no longer available for booking." });
    }
    const selections = personRows.map((person, index) => ({
      firstName: person.firstName, lastName: person.lastName, isMemberTraveler: false,
      outboundSeatType: person.outboundSeatType, returnSeatType: person.returnSeatType,
      seatNumber: input.outboundSeats[index], returnSeatNumber: input.returnSeats?.[index],
    }));
    validateNumberedSeats(await getSeatAvailability(newOut.id, tx), selections, "outbound");
    if (newRet) validateNumberedSeats(await getSeatAvailability(newRet.id, tx), selections, "return");

    const sell = async (tripId: number, count: number, front: number) => {
      const result = await tx.execute(sql`UPDATE departures SET seatsSold = seatsSold + ${count},
        frontSeatsSold = frontSeatsSold + ${front} WHERE id = ${tripId}
        AND status IN ('scheduled','boarding','delayed') AND departAt > ${now}
        AND capacity - seatsSold - seatsHeld >= ${count}
        AND frontSeatsSold + frontSeatsHeld + ${front} <= 1
        AND capacity - 1 - (seatsSold + seatsHeld - frontSeatsSold - frontSeatsHeld) >= ${count - front}
        AND vehicleId IS NOT NULL AND EXISTS (SELECT 1 FROM vehicles v WHERE v.id = departures.vehicleId
          AND v.status NOT IN ('maintenance', 'out_of_service') AND v.capacity >= departures.capacity)`);
      if (!affectedRows(result)) throw new TRPCError({ code: "CONFLICT", message: "The selected replacement seats are sold out." });
    };
    const restore = async (tripId: number, count: number, front: number) => {
      const result = await tx.execute(sql`UPDATE departures SET seatsSold = seatsSold - ${count},
        frontSeatsSold = frontSeatsSold - ${front} WHERE id = ${tripId}
        AND seatsSold >= ${count} AND frontSeatsSold >= ${front}`);
      if (!affectedRows(result)) throw new Error("Original sold-seat inventory is inconsistent; no changes were committed.");
    };
    await sell(newOut.id, booking.passengerCount, booking.outboundFrontSeats);
    await sellSegmentInventoryInTransaction(tx, newOut.id, personRows, "outbound");
    if (newRet) await sell(newRet.id, booking.passengerCount, booking.returnFrontSeats);
    if (newRet) await sellSegmentInventoryInTransaction(tx, newRet.id, personRows, "return");
    await restore(oldOut.id, booking.passengerCount, booking.outboundFrontSeats);
    await restoreSegmentInventoryInTransaction(tx, oldOut.id, personRows, "outbound");
    if (oldRet) await restore(oldRet.id, booking.passengerCount, booking.returnFrontSeats);
    if (oldRet) await restoreSegmentInventoryInTransaction(tx, oldRet.id, personRows, "return");

    await tx.update(tickets).set({ status: "voided" }).where(eq(tickets.bookingId, booking.id));
    for (const [index, person] of personRows.entries()) {
      await tx.update(passengers).set({ departureId: newOut.id, seatNumber: input.outboundSeats[index],
        returnDepartureId: newRet?.id ?? null, returnSeatNumber: input.returnSeats?.[index] ?? null, status: "booked" })
        .where(eq(passengers.id, person.id));
      for (const tripId of [newOut.id, ...(newRet ? [newRet.id] : [])]) {
        await tx.insert(tickets).values({ bookingId: booking.id, passengerId: person.id, departureId: tripId,
          seatType: tripId === newOut.id ? person.outboundSeatType : person.returnSeatType ?? "standard",
          qrToken: makeQrToken(), status: "booked" });
      }
    }
    const membershipUpdate = await tx.update(memberships).set({ freeReschedulesRemaining: sql`${memberships.freeReschedulesRemaining} - 1` })
      .where(and(eq(memberships.id, membership.id), gt(memberships.freeReschedulesRemaining, 0)));
    if (!affectedRows(membershipUpdate)) throw new TRPCError({ code: "CONFLICT", message: "The membership reschedule benefit was just used." });
    await tx.update(bookings).set({ outboundDepartureId: newOut.id, returnDepartureId: newRet?.id ?? null, usedFreeReschedule: true })
      .where(eq(bookings.id, booking.id));
    return { bookingNumber: booking.bookingNumber, userId: booking.userId };
  });
  try {
    await notify({ userId: outcome.userId, templateKey: TEMPLATES.booking_reschedule,
      title: "Trip rescheduled", body: `Booking ${outcome.bookingNumber} was moved to new numbered seats.` });
  } catch (error) { console.warn("[reschedule] In-app notice unavailable after committed reschedule", error instanceof Error ? error.name : "unknown"); }
  return { ok: true, bookingNumber: outcome.bookingNumber };
}
