import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import {
  cities,
  departures,
  locations,
  routes,
  vehicles,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { remainingSeats } from "../services/inventory";
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
  search: publicProcedure
    .input(
      z.object({
        originCityId: z.number(),
        destinationCityId: z.number(),
        date: z.string(),
        passengers: z.number().int().min(1).max(10),
        isMember: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const day = new Date(`${input.date}T00:00:00`);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const [rs] = await db
        .select()
        .from(routes)
        .where(
          and(
            eq(routes.originCityId, input.originCityId),
            eq(routes.destinationCityId, input.destinationCityId),
            eq(routes.isActive, true)
          )
        )
        .limit(1);
      if (!rs) return [];
      const [cs, ls, vs, deps] = await Promise.all([
        db.select().from(cities),
        db.select().from(locations),
        db.select().from(vehicles),
        db
          .select()
          .from(departures)
          .where(
            and(
              eq(departures.routeId, rs.id),
              gte(departures.departAt, day),
              lte(departures.departAt, next)
            )
          ),
      ]);
      const cityMap = new Map(cs.map(c => [c.id, c]));
      const locMap = new Map(ls.map(l => [l.id, l]));
      const vehicleMap = new Map(vs.map(v => [v.id, v]));
      const now = new Date();
      return deps
        .filter(d => d.status !== "canceled" && d.status !== "completed")
        .map(d => {
          const left = remainingSeats(d.capacity, d.seatsSold, d.seatsHeld);
          const early =
            d.memberEarlyAccessAt && d.memberEarlyAccessAt > now && !input.isMember;
          return {
            id: d.id,
            departAt: d.departAt,
            arriveAt: d.arriveAt,
            capacity: d.capacity,
            seatsSold: d.seatsSold,
            seatsHeld: d.seatsHeld,
            seatsRemaining: left,
            soldOut: left < input.passengers || d.status === "canceled" || Boolean(early),
            memberEarlyAccess: Boolean(early),
            standardFareCents: rs.standardFareCents,
            memberFareCents: rs.memberFareCents,
            pickup: locMap.get(rs.pickupLocationId),
            dropoff: locMap.get(rs.dropoffLocationId),
            origin: cityMap.get(rs.originCityId),
            destination: cityMap.get(rs.destinationCityId),
            vehicleCode: d.vehicleId ? vehicleMap.get(d.vehicleId)?.code : null,
            status: d.status,
            routeId: rs.id,
          };
        })
        .sort((a, b) => a.departAt.getTime() - b.departAt.getTime());
    }),
});
