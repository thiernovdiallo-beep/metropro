import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import {
  cities,
  departures,
  locations,
  routes,
  vehicles,
} from "../../drizzle/schema";
import { getActiveMembership, getDb } from "../db";
import { analyticsDateRange } from "../services/analytics";
import { getMemberProfileStatus } from "../services/member-profile";
import { remainingSeats, seatAvailability } from "../services/inventory";
import { reconcileExpiredHolds } from "../services/hold-reconciliation";
import { getSettings } from "../services/policies";
import { publicProcedure, router } from "../_core/trpc";

export const publicRouter = router({
  cities: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(cities);
  }),
  settings: publicProcedure.query(async () => {
    const s = await getSettings();
    return {
      standardFareCents: s.standardFareCents,
      memberFareCents: s.memberFareCents,
      frontFareCents: s.frontFareCents,
      membershipPriceCents: s.membershipPriceCents,
      membershipBenefits: s.membershipBenefits,
      emergencyContactRequired: s.emergencyContactRequired,
    };
  }),
  routes: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const [rs, cs, ls] = await Promise.all([
      db.select().from(routes).where(eq(routes.isActive, true)),
      db.select().from(cities),
      db.select().from(locations),
    ]);
    const cityMap = new Map(cs.map(c => [c.id, c]));
    const locMap = new Map(ls.map(l => [l.id, l]));
    return rs.map(r => ({
      ...r,
      origin: cityMap.get(r.originCityId)!,
      destination: cityMap.get(r.destinationCityId)!,
      pickup: locMap.get(r.pickupLocationId)!,
      dropoff: locMap.get(r.dropoffLocationId)!,
    }));
  }),
  seatOptions: publicProcedure
    .input(z.object({ departureId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      await reconcileExpiredHolds();
      const [departure] = await db.select().from(departures).where(eq(departures.id, input.departureId)).limit(1);
      return departure ? seatAvailability(departure) : null;
    }),
  departure: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await reconcileExpiredHolds();
      const [dep] = await db.select().from(departures).where(eq(departures.id, input.id)).limit(1);
      if (!dep) throw new TRPCError({ code: "NOT_FOUND", message: "Departure not found" });
      if (!dep.vehicleId) throw new TRPCError({ code: "NOT_FOUND", message: "Departure is unavailable until a vehicle is assigned" });
      const [route] = await db.select().from(routes).where(eq(routes.id, dep.routeId)).limit(1);
      if (!route?.isActive) throw new TRPCError({ code: "NOT_FOUND", message: "Route not available" });
      const [origin, destination, pickup, dropoff, vehicle] = await Promise.all([
        db.select().from(cities).where(eq(cities.id, route.originCityId)).limit(1).then(rows => rows[0] ?? null),
        db.select().from(cities).where(eq(cities.id, route.destinationCityId)).limit(1).then(rows => rows[0] ?? null),
        db.select().from(locations).where(eq(locations.id, route.pickupLocationId)).limit(1).then(rows => rows[0] ?? null),
        db.select().from(locations).where(eq(locations.id, route.dropoffLocationId)).limit(1).then(rows => rows[0] ?? null),
        dep.vehicleId ? db.select({ code: vehicles.code, status: vehicles.status, capacity: vehicles.capacity }).from(vehicles).where(eq(vehicles.id, dep.vehicleId)).limit(1).then(rows => rows[0] ?? null) : Promise.resolve(null),
      ]);
      if (!vehicle || ["maintenance", "out_of_service"].includes(vehicle.status) || vehicle.capacity < dep.capacity) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Departure is not available for booking" });
      }
      const available = seatAvailability(dep);
      return {
        id: dep.id, departAt: dep.departAt, arriveAt: dep.arriveAt, status: dep.status,
        capacity: dep.capacity, seatsRemaining: remainingSeats(dep.capacity, dep.seatsSold, dep.seatsHeld),
        standardSeatsRemaining: available.standard, frontSeatAvailable: available.front > 0,
        memberEarlyAccessAt: dep.memberEarlyAccessAt,
        vehicleCode: vehicle?.code ?? null,
        origin, destination, pickup, dropoff,
        standardFareCents: route.standardFareCents,
        memberFareCents: route.memberFareCents,
        frontFareCents: route.frontFareCents,
      };
    }),
  search: publicProcedure
    .input(
      z.object({
        originCityId: z.number(),
        destinationCityId: z.number(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        passengers: z.number().int().min(1).max(11),
        isMember: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      await reconcileExpiredHolds();
      let range;
      try { range = analyticsDateRange({ period: "custom", from: input.date, to: input.date })!; }
      catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid travel date." }); }
      const rs = await db
        .select()
        .from(routes)
        .where(
          and(
            eq(routes.originCityId, input.originCityId),
            eq(routes.destinationCityId, input.destinationCityId),
            eq(routes.isActive, true)
          )
        );
      if (!rs.length) return [];
      const membership = ctx.user ? await getActiveMembership(ctx.user.id) : null;
      const memberProfile = membership && ctx.user ? await getMemberProfileStatus(ctx.user.id) : null;
      const eligibleMember = Boolean(membership && memberProfile?.complete);
      const [cs, ls, vs, deps] = await Promise.all([
        db.select().from(cities),
        db.select().from(locations),
        db.select().from(vehicles),
        db
          .select()
          .from(departures)
          .where(
            and(
              inArray(departures.routeId, rs.map(route => route.id)),
              gte(departures.departAt, range.start),
              lt(departures.departAt, range.end)
            )
          ),
      ]);
      const cityMap = new Map(cs.map(c => [c.id, c]));
      const locMap = new Map(ls.map(l => [l.id, l]));
      const vehicleMap = new Map(vs.map(v => [v.id, v]));
      const routeMap = new Map(rs.map(route => [route.id, route]));
      const now = new Date();
      return deps
        .filter(d => d.departAt > now && ["scheduled", "boarding", "delayed"].includes(d.status) &&
          Boolean(d.vehicleId && vehicleMap.has(d.vehicleId)) &&
          (vehicleMap.get(d.vehicleId!)?.capacity ?? 0) >= d.capacity &&
          !["maintenance", "out_of_service"].includes(vehicleMap.get(d.vehicleId!)?.status ?? ""))
        .map(d => {
          const route = routeMap.get(d.routeId)!;
          const left = remainingSeats(d.capacity, d.seatsSold, d.seatsHeld);
          const seats = seatAvailability(d);
          const early =
            d.memberEarlyAccessAt && d.memberEarlyAccessAt > now && !eligibleMember;
          return {
            id: d.id,
            departAt: d.departAt,
            arriveAt: d.arriveAt,
            capacity: d.capacity,
            seatsSold: d.seatsSold,
            seatsHeld: d.seatsHeld,
            seatsRemaining: left,
            standardSeatsRemaining: seats.standard,
            frontSeatAvailable: seats.front > 0,
            soldOut: left < input.passengers || d.status === "canceled" || Boolean(early),
            memberEarlyAccess: Boolean(early),
            standardFareCents: route.standardFareCents,
            memberFareCents: route.memberFareCents,
            frontFareCents: route.frontFareCents,
            pickup: locMap.get(route.pickupLocationId),
            dropoff: locMap.get(route.dropoffLocationId),
            origin: cityMap.get(route.originCityId),
            destination: cityMap.get(route.destinationCityId),
            vehicleCode: d.vehicleId ? vehicleMap.get(d.vehicleId)?.code : null,
            status: d.status,
            routeId: route.id,
          };
        })
        .sort((a, b) => a.departAt.getTime() - b.departAt.getTime());
    }),
});
