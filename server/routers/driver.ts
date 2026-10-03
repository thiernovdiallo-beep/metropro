import { TRPCError } from "@trpc/server";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import {
  bookings,
  cities,
  departures,
  dispatchMessages,
  driverPrivateProfiles,
  driverProfiles,
  locations,
  passengers,
  routes,
  tickets,
  vehicles,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { affectedRows } from "../lib/mysql";
import { setVehicleStatus } from "../services/dispatch";
import { TEMPLATES, notify } from "../services/notifications";
import { driverProcedure, router } from "../_core/trpc";
import type { User } from "../../drizzle/schema";

async function driverIdForUser(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [byUser] = await db
    .select()
    .from(driverProfiles)
    .where(eq(driverProfiles.userId, userId))
    .limit(1);
  return byUser?.status === "active" ? byUser : null;
}

async function requireAssignedDeparture(user: User, departureId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [dep] = await db.select().from(departures).where(eq(departures.id, departureId)).limit(1);
  if (!dep) throw new TRPCError({ code: "NOT_FOUND" });
  if (user.role === "admin") return { db, dep };
  const profile = await driverIdForUser(user.id);
  if (!profile || dep.driverId !== profile.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not assigned to this trip" });
  }
  return { db, dep, profile };
}

async function tripBundle(dep: typeof departures.$inferSelect) {
  const db = await getDb();
  if (!db) return null;
  const [route] = await db.select().from(routes).where(eq(routes.id, dep.routeId)).limit(1);
  if (!route) return null;
  const [origin] = await db.select().from(cities).where(eq(cities.id, route.originCityId)).limit(1);
  const [destination] = await db
    .select()
    .from(cities)
    .where(eq(cities.id, route.destinationCityId))
    .limit(1);
  const [pickup] = await db.select().from(locations).where(eq(locations.id, route.pickupLocationId)).limit(1);
  const [dropoff] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, route.dropoffLocationId))
    .limit(1);
  const [vehicle] = dep.vehicleId
    ? await db.select().from(vehicles).where(eq(vehicles.id, dep.vehicleId)).limit(1)
    : [null];
  const [driver] = dep.driverId
    ? await db.select().from(driverProfiles).where(eq(driverProfiles.id, dep.driverId)).limit(1)
    : [null];
  return { departure: dep, route, origin, destination, pickup, dropoff, vehicle,
    driver: driver ? { id: driver.id, fullName: driver.fullName, phone: driver.phone, status: driver.status } : null };
}

export const driverRouter = router({
  home: driverProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { today: null, upcoming: [], vehicle: null };
    const profile = await driverIdForUser(ctx.user.id);
    if (!profile && ctx.user.role !== "admin") {
      return { today: null, upcoming: [], vehicle: null, message: "No driver profile linked." };
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const assigned =
      ctx.user.role === "admin" && !profile
        ? await db.select().from(departures)
        : await db.select().from(departures).where(eq(departures.driverId, profile!.id));
    const todayRows = assigned.filter(d => d.departAt >= start && d.departAt < end);
    const upcomingRows = assigned
      .filter(d => d.departAt >= end && d.status !== "canceled" && d.status !== "completed")
      .sort((a, b) => a.departAt.getTime() - b.departAt.getTime())
      .slice(0, 8);
    const today = todayRows[0] ? await tripBundle(todayRows[0]) : null;
    const upcoming = await Promise.all(upcomingRows.map(tripBundle));
    const [privateProfile] = profile ? await db.select({ idLast4: driverPrivateProfiles.idLast4 })
      .from(driverPrivateProfiles).where(eq(driverPrivateProfiles.profileId, profile.id)).limit(1) : [null];
    return {
      profile: profile ? { id: profile.id, fullName: profile.fullName, phone: profile.phone,
        email: profile.email, idLast4: privateProfile?.idLast4 ?? null } : null,
      today: today
        ? {
            ...today,
            passengersBooked: today.departure.seatsSold,
            capacity: today.departure.capacity,
          }
        : null,
      upcoming,
      vehicle: today?.vehicle ?? null,
    };
  }),
  trip: driverProcedure
    .input(z.object({ departureId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { db, dep } = await requireAssignedDeparture(ctx.user, input.departureId);
      const bundle = await tripBundle(dep);
      const tix = await db.select().from(tickets).where(eq(tickets.departureId, dep.id));
      const manifest = [];
      for (const t of tix) {
        if (t.status === "voided") continue;
        const [p] = await db.select().from(passengers).where(eq(passengers.id, t.passengerId)).limit(1);
        const [b] = await db.select().from(bookings).where(eq(bookings.id, t.bookingId)).limit(1);
        if (!p || !b || b.status !== "confirmed") continue;
        manifest.push({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          status: t.status,
          boardedAt: t.boardedAt,
          phone: b.contactPhone,
          bookingNumber: b.bookingNumber,
          ticketId: t.id,
          seatType: t.seatType,
        });
      }
      return { ...bundle, manifest };
    }),
  scan: driverProcedure
    .input(z.object({ qrToken: z.string().trim().min(12).max(48), departureId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { db, dep } = await requireAssignedDeparture(ctx.user, input.departureId);
      if (dep.status !== "boarding") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This trip is not open for boarding." });
      }
      return db.transaction(async tx => {
        const [ticket] = await tx.select().from(tickets).where(eq(tickets.qrToken, input.qrToken)).limit(1).for("update");
        if (!ticket || ticket.departureId !== input.departureId || ticket.status === "voided") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found for this trip." });
        }
        const [currentTrip] = await tx.select({ status: departures.status }).from(departures)
          .where(eq(departures.id, input.departureId)).limit(1).for("update");
        if (currentTrip?.status !== "boarding") throw new TRPCError({ code: "BAD_REQUEST", message: "Boarding has closed." });
        const [booking] = await tx.select({ status: bookings.status }).from(bookings)
          .where(eq(bookings.id, ticket.bookingId)).limit(1);
        if (booking?.status !== "confirmed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This ticket has not been paid or has been canceled." });
        }
        const [passenger] = await tx.select().from(passengers).where(eq(passengers.id, ticket.passengerId)).limit(1);
        if (!passenger) throw new TRPCError({ code: "NOT_FOUND" });
        if (ticket.status === "boarded") {
          return { passenger: { id: passenger.id, firstName: passenger.firstName,
            lastName: passenger.lastName, status: "boarded" as const }, alreadyBoarded: true };
        }
        await tx.update(tickets).set({ status: "boarded", boardedAt: new Date() }).where(eq(tickets.id, ticket.id));
        await tx.update(passengers).set({ status: "boarded" }).where(eq(passengers.id, passenger.id));
        return { passenger: { id: passenger.id, firstName: passenger.firstName,
          lastName: passenger.lastName, status: "boarded" as const }, alreadyBoarded: false };
      });
    }),
  setPassengerStatus: driverProcedure
    .input(
      z.object({
        passengerId: z.number(),
        departureId: z.number(),
        status: z.enum(["booked", "checked_in", "no_show"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, dep } = await requireAssignedDeparture(ctx.user, input.departureId);
      if (dep.status !== "boarding" && !(dep.status === "departed" && input.status === "no_show")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This trip is not open for manual check-in." });
      }
      return db.transaction(async tx => {
        const [ticket] = await tx.select().from(tickets)
          .where(and(eq(tickets.passengerId, input.passengerId), eq(tickets.departureId, input.departureId)))
          .limit(1).for("update");
        if (!ticket || ticket.status === "voided") throw new TRPCError({ code: "NOT_FOUND" });
        if (ticket.status === "boarded") throw new TRPCError({ code: "BAD_REQUEST", message: "Boarded attendance cannot be changed here." });
        const [currentTrip] = await tx.select({ status: departures.status }).from(departures)
          .where(eq(departures.id, input.departureId)).limit(1).for("update");
        if (currentTrip?.status !== "boarding" && !(currentTrip?.status === "departed" && input.status === "no_show")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Check-in has closed." });
        }
        const [booking] = await tx.select({ status: bookings.status }).from(bookings)
          .where(eq(bookings.id, ticket.bookingId)).limit(1);
        if (booking?.status !== "confirmed") throw new TRPCError({ code: "BAD_REQUEST", message: "Booking is not confirmed." });
        await tx.update(tickets).set({ status: input.status, boardedAt: null }).where(eq(tickets.id, ticket.id));
        await tx.update(passengers).set({ status: input.status }).where(eq(passengers.id, input.passengerId));
        return { ok: true };
      });
    }),
  startTrip: driverProcedure
    .input(z.object({ departureId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, dep } = await requireAssignedDeparture(ctx.user, input.departureId);
      const changed = await db.update(departures).set({ status: "boarding" })
        .where(and(eq(departures.id, dep.id), inArray(departures.status, ["scheduled", "delayed"])));
      if (!affectedRows(changed)) throw new TRPCError({ code: "BAD_REQUEST", message: "This trip cannot be opened for boarding." });
      if (dep.vehicleId) await setVehicleStatus(dep.vehicleId, "assigned");
      return { ok: true };
    }),
  markDeparture: driverProcedure
    .input(z.object({ departureId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, dep } = await requireAssignedDeparture(ctx.user, input.departureId);
      const changed = await db.update(departures).set({ status: "departed" })
        .where(and(eq(departures.id, dep.id), eq(departures.status, "boarding")));
      if (!affectedRows(changed)) throw new TRPCError({ code: "BAD_REQUEST", message: "Open boarding before marking departure." });
      if (dep.vehicleId) await setVehicleStatus(dep.vehicleId, "in_transit");
      return { ok: true };
    }),
  reportDelay: driverProcedure
    .input(z.object({ departureId: z.number(), reason: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      const { db } = await requireAssignedDeparture(ctx.user, input.departureId);
      const changed = await db
        .update(departures)
        .set({ status: "delayed", delayReason: input.reason })
        .where(and(eq(departures.id, input.departureId), inArray(departures.status, ["scheduled", "boarding", "delayed"])));
      if (!affectedRows(changed)) throw new TRPCError({ code: "BAD_REQUEST", message: "Delay reporting is closed for this trip." });
      await db.insert(dispatchMessages).values({
        departureId: input.departureId,
        fromUserId: ctx.user.id,
        kind: "delay",
        message: input.reason,
      });
      const confirmed = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.status, "confirmed"),
            or(
              eq(bookings.outboundDepartureId, input.departureId),
              eq(bookings.returnDepartureId, input.departureId)
            )
          )
        );
      for (const b of confirmed) {
        if (b.userId === null) continue;
        await notify({
          userId: b.userId,
          templateKey: TEMPLATES.trip_delay,
          title: "Trip delayed",
          body: `Your Metro Pro trip is delayed. ${input.reason}`,
        });
      }
      return { ok: true };
    }),
  contactDispatch: driverProcedure
    .input(z.object({ departureId: z.number(), message: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      await requireAssignedDeparture(ctx.user, input.departureId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(dispatchMessages).values({
        departureId: input.departureId,
        fromUserId: ctx.user.id,
        kind: "dispatch",
        message: input.message,
      });
      return { ok: true };
    }),
  reportVehicle: driverProcedure
    .input(z.object({ vehicleId: z.number(), departureId: z.number().optional(), message: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role === "driver" && !input.departureId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Choose an assigned trip to report this vehicle." });
      }
      if (input.departureId) {
        const { dep } = await requireAssignedDeparture(ctx.user, input.departureId);
        if (ctx.user.role === "driver" && dep.vehicleId !== input.vehicleId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This vehicle is not assigned to your trip." });
        }
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(dispatchMessages).values({
        departureId: input.departureId ?? null,
        vehicleId: input.vehicleId,
        fromUserId: ctx.user.id,
        kind: "vehicle_problem",
        message: input.message,
      });
      return { ok: true };
    }),
  markArrival: driverProcedure
    .input(z.object({ departureId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db } = await requireAssignedDeparture(ctx.user, input.departureId);
      const changed = await db.update(departures).set({ status: "arrived" })
        .where(and(eq(departures.id, input.departureId), eq(departures.status, "departed")));
      if (!affectedRows(changed)) throw new TRPCError({ code: "BAD_REQUEST", message: "Mark departure before arrival." });
      return { ok: true };
    }),
  completeTrip: driverProcedure
    .input(z.object({ departureId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, dep } = await requireAssignedDeparture(ctx.user, input.departureId);
      const changed = await db.update(departures).set({ status: "completed" })
        .where(and(eq(departures.id, dep.id), eq(departures.status, "arrived")));
      if (!affectedRows(changed)) throw new TRPCError({ code: "BAD_REQUEST", message: "Mark arrival before completing the trip." });
      if (dep.vehicleId) await setVehicleStatus(dep.vehicleId, "available");
      return { ok: true };
    }),
});
