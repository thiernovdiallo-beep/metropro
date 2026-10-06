import { describe, expect, it } from "vitest";
import { and, eq, inArray, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { bookings, departures, memberships, notifications, passengers, routes, tickets, users, vehicles } from "../../drizzle/schema";
import { getDb } from "../db";
import { insertId } from "../lib/mysql";
import { getSeatAvailability } from "./seat-inventory";
import { rescheduleWithNumberedSeats } from "./rescheduling";
import { holdSeatsInTransaction } from "./inventory";

const integration = process.env.METROPRO_DB_INTEGRATION_TEST === "1" ? describe : describe.skip;
integration("transactional numbered round-trip reschedule using disposable MySQL rows", () => {
  it("rolls back a two-seat conditional hold when booking insertion crashes", async () => {
    const db = await getDb();
    if (!db) throw new Error("The opt-in integration test requires the Metro Pro test database");
    const code = `MP-T-${randomUUID().slice(0, 8)}`;
    let vanId = 0;
    let depId = 0;
    try {
      const [route] = await db.select().from(routes).where(eq(routes.isActive, true)).limit(1);
      if (!route) throw new Error("No test route is configured");
      vanId = insertId(await db.insert(vehicles).values({ code, make: "Synthetic", model: "Rollback test",
        year: 2026, capacity: 10, status: "available", currentMileage: 0 }));
      const from = new Date("2026-12-15T15:00:00Z");
      depId = insertId(await db.insert(departures).values({ routeId: route.id, vehicleId: vanId,
        departAt: from, arriveAt: new Date(from.getTime() + 9 * 60 * 60_000), capacity: 10, status: "scheduled" }));
      await expect(db.transaction(async tx => {
        await holdSeatsInTransaction(tx, depId, 2);
        throw new Error("Simulated process failure before booking/passengers insert");
      })).rejects.toThrow("Simulated process failure");
      const [departure] = await db.select().from(departures).where(eq(departures.id, depId)).limit(1);
      expect(departure.seatsHeld).toBe(0);
      expect(departure.frontSeatsHeld).toBe(0);
    } finally {
      if (depId) await db.delete(departures).where(eq(departures.id, depId));
      if (vanId) await db.delete(vehicles).where(eq(vehicles.id, vanId));
    }
  });
  it("atomically transfers four seats and replaces QR passes without leaving test data", async () => {
    const db = await getDb();
    if (!db) throw new Error("The opt-in integration test requires the Metro Pro test database");
    const marker = `METRO-TEST-${randomUUID().slice(0, 8)}`;
    const ids = { user: 0, van: 0, membership: 0, booking: 0, departures: [] as number[] };
    try {
      const allRoutes = await db.select().from(routes);
      const outRoute = allRoutes.find(row => row.isActive);
      const retRoute = allRoutes.find(row => row.id !== outRoute?.id && row.isActive &&
        row.originCityId === outRoute?.destinationCityId && row.destinationCityId === outRoute?.originCityId);
      if (!outRoute || !retRoute) throw new Error("This integration test needs the two existing reverse Metro Pro routes");
      ids.user = insertId(await db.insert(users).values({ openId: marker, email: `${marker.toLowerCase()}@example.invalid`, name: "Synthetic Test Member", role: "customer" }));
      ids.van = insertId(await db.insert(vehicles).values({ code: marker.replace("METRO-TEST-", "MP-T-"), make: "Synthetic", model: "Test fixture", year: 2026, capacity: 10, status: "available", currentMileage: 0 }));
      ids.membership = insertId(await db.insert(memberships).values({ userId: ids.user, status: "active", freeReschedulesRemaining: 1,
        priceCentsSnapshot: 2500, currentPeriodEnd: new Date("2027-01-01T00:00:00Z") }));
      const starts = ["2026-12-02T15:00:00Z", "2026-12-05T15:00:00Z", "2026-12-09T15:00:00Z", "2026-12-12T15:00:00Z"];
      for (const [index, start] of starts.entries()) {
        const from = new Date(start);
        ids.departures.push(insertId(await db.insert(departures).values({ routeId: index % 2 ? retRoute.id : outRoute.id,
          vehicleId: ids.van, driverId: null, departAt: from, arriveAt: new Date(from.getTime() + 9 * 60 * 60_000),
          capacity: 10, seatsSold: index < 2 ? 2 : 0, seatsHeld: 0, status: "scheduled" })));
      }
      ids.booking = insertId(await db.insert(bookings).values({ bookingNumber: marker, userId: ids.user,
        outboundDepartureId: ids.departures[0], returnDepartureId: ids.departures[1], tripType: "round_trip", passengerCount: 2,
        outboundFrontSeats: 0, returnFrontSeats: 0, fareType: "standard", outboundQuotedCents: 30000,
        returnQuotedCents: 30000, amountCents: 60000, status: "confirmed", contactFirstName: "Synthetic", contactLastName: "Tester",
        contactPhone: "2125550199", contactEmail: `${marker.toLowerCase()}@example.invalid` }));
      for (const [index, seat] of ["2A", "2B"].entries()) {
        const id = insertId(await db.insert(passengers).values({ bookingId: ids.booking, departureId: ids.departures[0],
          seatNumber: seat, returnDepartureId: ids.departures[1], returnSeatNumber: seat,
          firstName: `Fixture${index + 1}`, lastName: "Test", outboundSeatType: "standard", returnSeatType: "standard" }));
        for (const dep of ids.departures.slice(0, 2)) await db.insert(tickets).values({ bookingId: ids.booking,
          passengerId: id, departureId: dep, qrToken: `${marker}-${id}-${dep}`, seatType: "standard", status: "booked" });
      }
      const initialTickets = await db.select().from(tickets).where(eq(tickets.bookingId, ids.booking));
      const input = { bookingId: ids.booking, newOutboundDepartureId: ids.departures[2], newReturnDepartureId: ids.departures[3],
        outboundSeats: ["2A", "2B"], returnSeats: ["2A", "2B"] };
      await expect(rescheduleWithNumberedSeats({ ...input, outboundSeats: ["2A", "2A"] }, ids.user))
        .rejects.toMatchObject({ code: "BAD_REQUEST" });
      const before = await db.select().from(departures).where(inArray(departures.id, ids.departures));
      expect(before.map(dep => dep.seatsSold)).toEqual([2, 2, 0, 0]);
      await expect(rescheduleWithNumberedSeats(input, ids.user)).resolves.toMatchObject({ ok: true, bookingNumber: marker });
      const after = await db.select().from(departures).where(inArray(departures.id, ids.departures));
      expect(after.map(dep => dep.seatsSold)).toEqual([0, 0, 2, 2]);
      const people = await db.select().from(passengers).where(eq(passengers.bookingId, ids.booking));
      expect(people.map(person => [person.departureId, person.seatNumber, person.returnDepartureId, person.returnSeatNumber]))
        .toEqual([[ids.departures[2], "2A", ids.departures[3], "2A"], [ids.departures[2], "2B", ids.departures[3], "2B"]]);
      for (const oldId of ids.departures.slice(0, 2)) expect((await getSeatAvailability(oldId)).filter(seat => ["2A", "2B"].includes(seat.seatNumber)).map(seat => seat.status)).toEqual(["available", "available"]);
      for (const newId of ids.departures.slice(2)) expect((await getSeatAvailability(newId)).filter(seat => ["2A", "2B"].includes(seat.seatNumber)).map(seat => seat.status)).toEqual(["taken", "taken"]);
      const replacement = await db.select().from(tickets).where(and(eq(tickets.bookingId, ids.booking), ne(tickets.status, "voided")));
      expect(replacement).toHaveLength(4);
      expect(new Set(replacement.map(ticket => ticket.qrToken)).size).toBe(4);
      expect((await db.select().from(tickets).where(eq(tickets.bookingId, ids.booking))).filter(ticket => ticket.status === "voided")).toHaveLength(initialTickets.length);
      const [benefit] = await db.select().from(memberships).where(eq(memberships.id, ids.membership));
      expect(benefit.freeReschedulesRemaining).toBe(0);
      await expect(rescheduleWithNumberedSeats(input, ids.user)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      if (ids.user) await db.delete(notifications).where(eq(notifications.userId, ids.user));
      if (ids.booking) {
        await db.delete(tickets).where(eq(tickets.bookingId, ids.booking));
        await db.delete(passengers).where(eq(passengers.bookingId, ids.booking));
        await db.delete(bookings).where(eq(bookings.id, ids.booking));
      }
      if (ids.membership) await db.delete(memberships).where(eq(memberships.id, ids.membership));
      if (ids.departures.length) await db.delete(departures).where(inArray(departures.id, ids.departures));
      if (ids.van) await db.delete(vehicles).where(eq(vehicles.id, ids.van));
      if (ids.user) await db.delete(users).where(eq(users.id, ids.user));
    }
  });
});
