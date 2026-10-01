import { TRPCError } from "@trpc/server";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import {
  bookings,
  cities,
  departures,
  dispatchMessages,
  driverProfiles,
  locations,
  passengers,
  routes,
  tickets,
  vehicles,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { setVehicleStatus } from "../services/dispatch";
import { TEMPLATES, notify } from "../services/notifications";
import { driverProcedure, router } from "../_core/trpc";
import type { User } from "../../drizzle/schema";

async function driverIdForUser(userId: number, email?: string | null) {
  const db = await getDb();
  if (!db) return null;
  const [byUser] = await db
    .select()
    .from(driverProfiles)
    .where(eq(driverProfiles.userId, userId))
    .limit(1);
  if (byUser) return byUser;
  if (email) {
    const [byEmail] = await db
      .select()
      .from(driverProfiles)
      .where(eq(driverProfiles.email, email.toLowerCase()))
      .limit(1);
    return byEmail ?? null;
  }
  return null;
}

async function requireAssignedDeparture(user: User, departureId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [dep] = await db.select().from(departures).where(eq(departures.id, departureId)).limit(1);
  if (!dep) throw new TRPCError({ code: "NOT_FOUND" });
  if (user.role === "admin") return { db, dep };
  const profile = await driverIdForUser(user.id, user.email);
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
  return { departure: dep, route, origin, destination, pickup, dropoff, vehicle, driver };
}

export const driverRouter = router({
  home: driverProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { today: null, upcoming: [], vehicle: null };
    const profile = await driverIdForUser(ctx.user.id, ctx.user.email);
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
    return {
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
          status: p.status,
          phone: b.contactPhone,
          bookingNumber: b.bookingNumber,
          qrToken: t.qrToken,
          ticketId: t.id,
          seatType: t.seatType,
        });
      }
      return { ...bundle, manifest };
    }),
  scan: driverProcedure
    .input(z.object({ qrToken: z.string(), departureId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db } = await requireAssignedDeparture(ctx.user, input.departureId);
      const [ticket] = await db.select().from(tickets).where(eq(tickets.qrToken, input.qrToken)).limit(1);
      if (!ticket || ticket.departureId !== input.departureId || ticket.status === "voided") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found for this trip" });
      }
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, ticket.bookingId)).limit(1);
      if (!booking || booking.status !== "confirmed") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Booking is not confirmed" });
      }
      const [p] = await db.select().from(passengers).where(eq(passengers.id, ticket.passengerId)).limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      const next =
        p.status === "booked" ? "checked_in" : p.status === "checked_in" ? "boarded" : p.status;
      await db.update(passengers).set({ status: next }).where(eq(passengers.id, p.id));
      await db
        .update(tickets)
        .set({ status: next as "booked" | "checked_in" | "boarded" })
        .where(eq(tickets.id, ticket.id));
      return { passenger: { id: p.id, firstName: p.firstName, lastName: p.lastName, status: next } };
    }),
  setPassengerStatus: driverProcedure
    .input(
      z.object({
        passengerId: z.number(),
        departureId: z.number(),
        status: z.enum(["booked", "checked_in", "boarded", "no_show"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = await requireAssignedDeparture(ctx.user, input.departureId);
      const [ticket] = await db
        .select()
        .from(tickets)
        .where(and(eq(tickets.passengerId, input.passengerId), eq(tickets.departureId, input.departureId)))
        .limit(1);
      if (!ticket || ticket.status === "voided") throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(passengers).set({ status: input.status }).where(eq(passengers.id, input.passengerId));
      const ticketStatus =
        input.status === "no_show" ? "booked" : (input.status as "booked" | "checked_in" | "boarded");
      await db.update(tickets).set({ status: ticketStatus }).where(eq(tickets.id, ticket.id));
      return { ok: true };
    }),
  startTrip: driverProcedure
    .input(z.object({ departureId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, dep } = await requireAssignedDeparture(ctx.user, input.departureId);
      await db.update(departures).set({ status: "boarding" }).where(eq(departures.id, dep.id));
      if (dep.vehicleId) await setVehicleStatus(dep.vehicleId, "assigned");
      return { ok: true };
    }),
  markDeparture: driverProcedure
    .input(z.object({ departureId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, dep } = await requireAssignedDeparture(ctx.user, input.departureId);
      await db.update(departures).set({ status: "departed" }).where(eq(departures.id, dep.id));
      if (dep.vehicleId) await setVehicleStatus(dep.vehicleId, "in_transit");
      return { ok: true };
    }),
  reportDelay: driverProcedure
    .input(z.object({ departureId: z.number(), reason: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      const { db } = await requireAssignedDeparture(ctx.user, input.departureId);
      await db
        .update(departures)
        .set({ status: "delayed", delayReason: input.reason })
        .where(eq(departures.id, input.departureId));
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
      if (input.departureId) await requireAssignedDeparture(ctx.user, input.departureId);
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
      await db.update(departures).set({ status: "arrived" }).where(eq(departures.id, input.departureId));
      return { ok: true };
    }),
  completeTrip: driverProcedure
    .input(z.object({ departureId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { db, dep } = await requireAssignedDeparture(ctx.user, input.departureId);
      await db.update(departures).set({ status: "completed" }).where(eq(departures.id, dep.id));
      if (dep.vehicleId) await setVehicleStatus(dep.vehicleId, "available");
      return { ok: true };
    }),
});
