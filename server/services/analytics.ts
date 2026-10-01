import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  bookings,
  departures,
  memberships,
  passengers,
  payments,
  refunds,
  routes,
  vehicles,
} from "../../drizzle/schema";
import { getDb } from "../db";

function occupancyBand(pct: number) {
  if (pct >= 100) return "Sold Out";
  if (pct >= 90) return "90%";
  if (pct >= 80) return "80%";
  if (pct >= 70) return "70%";
  return "under_70";
}

export async function getOpsKpis(now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(startToday);
  endToday.setDate(endToday.getDate() + 1);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const todayTrips = await db
    .select()
    .from(departures)
    .where(and(gte(departures.departAt, startToday), lte(departures.departAt, endToday)));

  const ticketsSold = todayTrips.reduce((s, d) => s + d.seatsSold, 0);
  const seatsAvailable = todayTrips.reduce(
    (s, d) => s + Math.max(0, d.capacity - d.seatsSold - d.seatsHeld),
    0
  );
  const capacity = todayTrips.reduce((s, d) => s + d.capacity, 0);
  const occupancy = capacity ? Math.round((ticketsSold / capacity) * 100) : 0;

  const [revToday] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountCents}),0)` })
    .from(payments)
    .where(and(eq(payments.status, "succeeded"), gte(payments.createdAt, startToday)));
  const [revWeek] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountCents}),0)` })
    .from(payments)
    .where(and(eq(payments.status, "succeeded"), gte(payments.createdAt, weekAgo)));
  const [revMonth] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountCents}),0)` })
    .from(payments)
    .where(and(eq(payments.status, "succeeded"), gte(payments.createdAt, monthStart)));

  const [activeMembers] = await db
    .select({ n: sql<number>`count(*)` })
    .from(memberships)
    .where(eq(memberships.status, "active"));
  const [mrr] = await db
    .select({ total: sql<number>`coalesce(sum(${memberships.priceCentsSnapshot}),0)` })
    .from(memberships)
    .where(eq(memberships.status, "active"));

  const [cancels] = await db
    .select({ n: sql<number>`count(*)` })
    .from(bookings)
    .where(and(eq(bookings.status, "canceled"), gte(bookings.updatedAt, startToday)));
  const [refundCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(refunds)
    .where(gte(refunds.createdAt, startToday));
  const delayed = todayTrips.filter(t => t.status === "delayed").length;

  const vans = await db.select().from(vehicles);
  const activeVans = vans.filter(v => v.status === "assigned" || v.status === "in_transit").length;
  const driversAssigned = new Set(
    todayTrips.map(t => t.driverId).filter((id): id is number => Boolean(id))
  ).size;

  return {
    tripsToday: todayTrips.length,
    activeVans,
    activeDrivers: driversAssigned,
    ticketsSold,
    seatsAvailable,
    occupancyPercent: occupancy,
    revenueTodayCents: Number(revToday?.total ?? 0),
    revenueWeekCents: Number(revWeek?.total ?? 0),
    revenueMonthCents: Number(revMonth?.total ?? 0),
    activeMemberships: Number(activeMembers?.n ?? 0),
    mrrCents: Number(mrr?.total ?? 0),
    cancellationsToday: Number(cancels?.n ?? 0),
    refundsToday: Number(refundCount?.n ?? 0),
    delayedTrips: delayed,
    trips: todayTrips,
  };
}

export async function getAnalytics() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const allDeps = await db.select().from(departures);
  const allRoutes = await db.select().from(routes);
  const allVehicles = await db.select().from(vehicles);
  const confirmed = await db.select().from(bookings).where(eq(bookings.status, "confirmed"));
  const canceled = await db.select().from(bookings).where(eq(bookings.status, "canceled"));
  const allBookings = await db.select().from(bookings);
  const noshows = await db.select().from(passengers).where(eq(passengers.status, "no_show"));
  const boarded = await db.select().from(passengers).where(eq(passengers.status, "boarded"));
  const members = await db.select().from(memberships).where(eq(memberships.status, "active"));
  const succeeded = await db.select().from(payments).where(eq(payments.status, "succeeded"));

  const occupancyByDeparture = allDeps.map(d => {
    const pct = d.capacity ? Math.round((d.seatsSold / d.capacity) * 100) : 0;
    return {
      departureId: d.id,
      routeId: d.routeId,
      departAt: d.departAt,
      occupancyPercent: pct,
      band: occupancyBand(pct),
      seatsSold: d.seatsSold,
      capacity: d.capacity,
    };
  });

  const occupancyByRoute = allRoutes.map(r => {
    const deps = allDeps.filter(d => d.routeId === r.id);
    const sold = deps.reduce((s, d) => s + d.seatsSold, 0);
    const cap = deps.reduce((s, d) => s + d.capacity, 0);
    const pct = cap ? Math.round((sold / cap) * 100) : 0;
    return { routeId: r.id, occupancyPercent: pct, band: occupancyBand(pct), trips: deps.length };
  });

  const ticketPayments = succeeded.filter(p => p.kind === "ticket");
  const membershipRevenue = succeeded
    .filter(p => p.kind === "membership")
    .reduce((s, p) => s + p.amountCents, 0);

  const paidByBooking = new Map<number, number>();
  for (const p of ticketPayments) {
    if (!p.bookingId) continue;
    paidByBooking.set(p.bookingId, (paidByBooking.get(p.bookingId) ?? 0) + p.amountCents);
  }
  const { allocatePaidAcrossLegs } = await import("./pricing");

  const revenueByRouteMap = new Map<number, number>();
  const revenueByVehicleMap = new Map<number, number>();
  const revenuePerTripMap = new Map<number, number>();
  for (const b of confirmed) {
    const split = allocatePaidAcrossLegs(
      paidByBooking.get(b.id) ?? 0,
      b.outboundQuotedCents,
      b.returnQuotedCents
    );
    const out = allDeps.find(d => d.id === b.outboundDepartureId);
    const ret = b.returnDepartureId ? allDeps.find(d => d.id === b.returnDepartureId) : null;
    if (out) {
      revenueByRouteMap.set(out.routeId, (revenueByRouteMap.get(out.routeId) ?? 0) + split.outboundCents);
      if (out.vehicleId) {
        revenueByVehicleMap.set(out.vehicleId, (revenueByVehicleMap.get(out.vehicleId) ?? 0) + split.outboundCents);
      }
      revenuePerTripMap.set(out.id, (revenuePerTripMap.get(out.id) ?? 0) + split.outboundCents);
    }
    if (ret) {
      revenueByRouteMap.set(ret.routeId, (revenueByRouteMap.get(ret.routeId) ?? 0) + split.returnCents);
      if (ret.vehicleId) {
        revenueByVehicleMap.set(ret.vehicleId, (revenueByVehicleMap.get(ret.vehicleId) ?? 0) + split.returnCents);
      }
      revenuePerTripMap.set(ret.id, (revenuePerTripMap.get(ret.id) ?? 0) + split.returnCents);
    }
  }

  const revenueByRoute = allRoutes.map(r => ({
    routeId: r.id,
    revenueCents: revenueByRouteMap.get(r.id) ?? 0,
  }));
  const revenueByVehicle = allVehicles.map(v => ({
    vehicleId: v.id,
    code: v.code,
    revenueCents: revenueByVehicleMap.get(v.id) ?? 0,
  }));
  const revenuePerTrip = allDeps.map(d => ({
    departureId: d.id,
    revenueCents: revenuePerTripMap.get(d.id) ?? 0,
  }));

  const avgTicket =
    ticketPayments.length === 0
      ? 0
      : Math.round(ticketPayments.reduce((s, p) => s + p.amountCents, 0) / ticketPayments.length);

  const userCounts = new Map<number, number>();
  for (const b of confirmed) userCounts.set(b.userId, (userCounts.get(b.userId) ?? 0) + 1);
  const repeatCustomers = [...userCounts.values()].filter(n => n > 1).length;
  const uniqueCustomers = userCounts.size;
  const repeatPercent = uniqueCustomers
    ? Math.round((repeatCustomers / uniqueCustomers) * 100)
    : 0;

  const dayCounts = new Array(7).fill(0);
  const hourCounts = new Map<number, number>();
  for (const d of allDeps) {
    if (d.seatsSold <= 0) continue;
    dayCounts[d.departAt.getDay()] += d.seatsSold;
    const h = d.departAt.getHours();
    hourCounts.set(h, (hourCounts.get(h) ?? 0) + d.seatsSold);
  }

  const totalPassengers = await db.select({ n: sql<number>`count(*)` }).from(passengers);
  const cancelRate = allBookings.length
    ? Math.round((canceled.length / allBookings.length) * 100)
    : 0;
  const passengerTotal = Number(totalPassengers[0]?.n ?? 0);
  const noShowRate = passengerTotal ? Math.round((noshows.length / passengerTotal) * 100) : 0;

  return {
    occupancyByDeparture,
    occupancyByRoute,
    revenueByRoute,
    revenueByVehicle,
    revenuePerTrip,
    averageTicketCents: avgTicket,
    membershipRevenueCents: membershipRevenue,
    activeMembers: members.length,
    repeatCustomerPercent: repeatPercent,
    popularDays: dayCounts.map((count, i) => ({
      day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i],
      seats: count,
    })),
    popularTimes: [...hourCounts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, seats]) => ({ hour, seats })),
    cancellationRate: cancelRate,
    noShowRate,
    boardedCount: boarded.length,
    addVanSignals: occupancyByRoute.filter(r =>
      ["70%", "80%", "90%", "Sold Out"].includes(r.band)
    ),
  };
}
