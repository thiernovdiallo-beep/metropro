import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
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
  const { start: startToday, end: endToday } = analyticsDateRange({ period: "today" }, now)!;
  const weekAgo = analyticsDateRange({ period: "week" }, now)!.start;
  const monthStart = analyticsDateRange({ period: "month" }, now)!.start;

  const todayTrips = await db
    .select()
    .from(departures)
    .where(and(gte(departures.departAt, startToday), lt(departures.departAt, endToday), ne(departures.status, "canceled")));

  const [newBookings] = await db.select({ n: sql<number>`count(*)` }).from(bookings)
    .where(and(gte(bookings.createdAt, startToday), lt(bookings.createdAt, endToday)));

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
    .where(and(eq(payments.status, "succeeded"), gte(payments.createdAt, startToday), lt(payments.createdAt, endToday)));
  const [revWeek] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountCents}),0)` })
    .from(payments)
    .where(and(eq(payments.status, "succeeded"), gte(payments.createdAt, weekAgo), lt(payments.createdAt, endToday)));
  const [revMonth] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountCents}),0)` })
    .from(payments)
    .where(and(eq(payments.status, "succeeded"), gte(payments.createdAt, monthStart), lt(payments.createdAt, endToday)));

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
    .where(and(eq(bookings.status, "canceled"), gte(bookings.updatedAt, startToday), lt(bookings.updatedAt, endToday)));
  const [refundCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(refunds)
    .where(and(eq(refunds.status, "succeeded"), gte(refunds.updatedAt, startToday), lt(refunds.updatedAt, endToday)));
  const [[pendingRefunds], [failedRefunds]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(refunds).where(eq(refunds.status, "pending")),
    db.select({ n: sql<number>`count(*)` }).from(refunds).where(eq(refunds.status, "failed")),
  ]);
  const delayed = todayTrips.filter(t => t.status === "delayed").length;

  const vans = await db.select().from(vehicles);
  const activeVans = vans.filter(v => v.status !== "maintenance" && v.status !== "out_of_service").length;
  const driversAssigned = new Set(
    todayTrips.map(t => t.driverId).filter((id): id is number => Boolean(id))
  ).size;

  return {
    tripsToday: todayTrips.length,
    bookingsToday: Number(newBookings?.n ?? 0),
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
    pendingRefunds: Number(pendingRefunds?.n ?? 0),
    failedRefunds: Number(failedRefunds?.n ?? 0),
    delayedTrips: delayed,
    trips: todayTrips,
  };
}

export function averagePaidSeatCents(totalCents: number, seatCount: number) {
  return seatCount > 0 ? Math.round(totalCents / seatCount) : 0;
}

export type RevenueTrendPayment = {
  kind: "ticket" | "membership";
  amountCents: number;
  createdAt: Date;
};

export type RevenueTrendRefund = {
  amountCents: number;
  updatedAt: Date;
};

function newYorkDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function buildRevenueTrend(
  paymentRows: readonly RevenueTrendPayment[],
  refundRows: readonly RevenueTrendRefund[],
  range?: { start: Date; end: Date },
) {
  const rows = new Map<string, { grossTicketCents: number; membershipCents: number; refundsCents: number }>();
  const ensure = (date: string) => {
    const existing = rows.get(date);
    if (existing) return existing;
    const created = { grossTicketCents: 0, membershipCents: 0, refundsCents: 0 };
    rows.set(date, created);
    return created;
  };
  for (const payment of paymentRows) {
    const row = ensure(newYorkDateKey(payment.createdAt));
    if (payment.kind === "ticket") row.grossTicketCents += payment.amountCents;
    else row.membershipCents += payment.amountCents;
  }
  for (const refund of refundRows) ensure(newYorkDateKey(refund.updatedAt)).refundsCents += refund.amountCents;

  if (range) {
    const startDate = newYorkDateKey(range.start);
    const endDate = newYorkDateKey(new Date(range.end.getTime() - 1));
    const start = Date.UTC(Number(startDate.slice(0, 4)), Number(startDate.slice(5, 7)) - 1, Number(startDate.slice(8, 10)));
    const end = Date.UTC(Number(endDate.slice(0, 4)), Number(endDate.slice(5, 7)) - 1, Number(endDate.slice(8, 10)));
    for (let cursor = start; cursor <= end; cursor += 86_400_000) {
      const date = new Date(cursor).toISOString().slice(0, 10);
      ensure(date);
    }
  }

  return [...rows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({
    date,
    ...values,
    netRevenueCents: values.grossTicketCents + values.membershipCents - values.refundsCents,
  }));
}

export type AnalyticsPeriod = "all" | "today" | "week" | "month" | "custom";

function nyDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function nyMidnight(date: string) {
  const utc = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== date) throw new RangeError("Invalid calendar date");
  // At 00:00 UTC New York is still on the preceding evening, which has the
  // same UTC offset as the upcoming local midnight even on a DST change day.
  const text = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(utc).find(part => part.type === "timeZoneName")?.value ?? "";
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(text);
  if (!match) throw new Error("New York timezone offset is unavailable");
  const minutes = (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === "+" ? 1 : -1);
  return new Date(utc.getTime() - minutes * 60_000);
}

export function analyticsDateRange(input: { period: AnalyticsPeriod; from?: string; to?: string }, now = new Date()) {
  if (input.period === "all") return undefined;
  const day = nyDate(now);
  const first = new Date(`${day}T00:00:00.000Z`);
  let from = day;
  let to = day;
  if (input.period === "week") {
    const daysSinceMonday = (first.getUTCDay() + 6) % 7;
    from = new Date(first.getTime() - daysSinceMonday * 86_400_000).toISOString().slice(0, 10);
  }
  if (input.period === "month") from = `${day.slice(0, 7)}-01`;
  if (input.period === "custom") {
    if (!input.from || !input.to) throw new RangeError("Choose both dates for a custom range");
    from = input.from; to = input.to;
  }
  const fromUtc = new Date(`${from}T00:00:00.000Z`);
  const toUtc = new Date(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(fromUtc.getTime()) || !Number.isFinite(toUtc.getTime()) ||
      fromUtc.toISOString().slice(0, 10) !== from || toUtc.toISOString().slice(0, 10) !== to ||
      toUtc < fromUtc || toUtc.getTime() - fromUtc.getTime() > 365 * 86_400_000) {
    throw new RangeError("Choose a valid date range of no more than 366 days");
  }
  const nextDay = new Date(toUtc.getTime() + 86_400_000).toISOString().slice(0, 10);
  return { start: nyMidnight(from), end: nyMidnight(nextDay) };
}

export async function getAnalytics(range?: { start: Date; end: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const allDeps = await db.select().from(departures);
  const periodDeps = allDeps.filter(dep => dep.status !== "canceled" && (!range || dep.departAt >= range.start && dep.departAt < range.end));
  const allRoutes = await db.select().from(routes);
  const allVehicles = await db.select().from(vehicles);
  const confirmed = await db.select().from(bookings).where(eq(bookings.status, "confirmed"));
  const allBookings = await db.select().from(bookings)
    .where(range ? and(gte(bookings.createdAt, range.start), lt(bookings.createdAt, range.end)) : undefined);
  const canceled = allBookings.filter(booking => booking.status === "canceled" || booking.status === "refunded");
  const eligibleBookingIds = allBookings.filter(booking => booking.status === "confirmed").map(booking => booking.id);
  const allPax = eligibleBookingIds.length
    ? await db.select().from(passengers).where(inArray(passengers.bookingId, eligibleBookingIds)) : [];
  const noshows = allPax.filter(person => person.status === "no_show");
  const boarded = allPax.filter(person => person.status === "boarded");
  const members = await db.select().from(memberships).where(eq(memberships.status, "active"));
  const succeeded = await db.select().from(payments).where(and(eq(payments.status, "succeeded"),
    range ? and(gte(payments.createdAt, range.start), lt(payments.createdAt, range.end)) : undefined));
  const successfulRefunds = await db.select({ amountCents: refunds.amountCents, updatedAt: refunds.updatedAt })
    .from(refunds).where(and(eq(refunds.status, "succeeded"),
      range ? and(gte(refunds.updatedAt, range.start), lt(refunds.updatedAt, range.end)) : undefined));

  const occupancyByDeparture = periodDeps.map(d => {
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
    const deps = periodDeps.filter(d => d.routeId === r.id);
    const sold = deps.reduce((s, d) => s + d.seatsSold, 0);
    const cap = deps.reduce((s, d) => s + d.capacity, 0);
    const pct = cap ? Math.round((sold / cap) * 100) : 0;
    return { routeId: r.id, occupancyPercent: pct, band: occupancyBand(pct), trips: deps.length };
  });

  const ticketPayments = succeeded.filter(p => p.kind === "ticket");
  const membershipRevenue = succeeded
    .filter(p => p.kind === "membership")
    .reduce((s, p) => s + p.amountCents, 0);
  const grossTicketRevenue = ticketPayments.reduce((s, p) => s + p.amountCents, 0);
  const refundRevenue = successfulRefunds.reduce((s, refund) => s + refund.amountCents, 0);
  const revenueTrend = buildRevenueTrend(
    succeeded.map(payment => ({ kind: payment.kind, amountCents: payment.amountCents, createdAt: payment.createdAt })),
    successfulRefunds,
    range,
  );

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

  const routePerformance = allRoutes.map(route => {
    const deps = periodDeps.filter(departure => departure.routeId === route.id);
    const capacity = deps.reduce((sum, departure) => sum + departure.capacity, 0);
    const seatsSold = deps.reduce((sum, departure) => sum + departure.seatsSold, 0);
    const revenueCents = revenueByRouteMap.get(route.id) ?? 0;
    return {
      routeId: route.id,
      trips: deps.length,
      seatsSold,
      capacity,
      occupancyPercent: capacity ? Math.round((seatsSold / capacity) * 100) : 0,
      revenueCents,
      averageRevenuePerTripCents: deps.length ? Math.round(revenueCents / deps.length) : 0,
    };
  }).filter(item => item.trips > 0 || item.revenueCents > 0);

  const bookingById = new Map(confirmed.map(booking => [booking.id, booking]));
  const paidSeatCount = ticketPayments.reduce((total, payment) => {
    const booking = payment.bookingId ? bookingById.get(payment.bookingId) : null;
    return total + (booking ? booking.passengerCount * (booking.returnDepartureId ? 2 : 1) : 0);
  }, 0);
  const avgTicket = averagePaidSeatCents(ticketPayments.reduce((sum, payment) => sum + payment.amountCents, 0), paidSeatCount);

  const userCounts = new Map<number, number>();
  for (const b of confirmed.filter(booking => !range || booking.createdAt >= range.start && booking.createdAt < range.end)) {
    if (b.userId !== null) userCounts.set(b.userId, (userCounts.get(b.userId) ?? 0) + 1);
  }
  const repeatCustomers = [...userCounts.values()].filter(n => n > 1).length;
  const uniqueCustomers = userCounts.size;
  const repeatPercent = uniqueCustomers
    ? Math.round((repeatCustomers / uniqueCustomers) * 100)
    : 0;

  const dayCounts = new Array(7).fill(0);
  const hourCounts = new Map<number, number>();
  const departureClock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hourCycle: "h23" });
  for (const d of periodDeps) {
    if (d.seatsSold <= 0) continue;
    const parts = Object.fromEntries(departureClock.formatToParts(d.departAt).map(part => [part.type, part.value]));
    dayCounts[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday)] += d.seatsSold;
    const h = Number(parts.hour);
    hourCounts.set(h, (hourCounts.get(h) ?? 0) + d.seatsSold);
  }

  const cancelRate = allBookings.length
    ? Math.round((canceled.length / allBookings.length) * 100)
    : 0;
  const passengerTotal = allPax.length;
  const noShowRate = passengerTotal ? Math.round((noshows.length / passengerTotal) * 100) : 0;

  return {
    occupancyByDeparture,
    occupancyByRoute,
    revenueByRoute,
    revenueByVehicle,
    revenuePerTrip,
    routePerformance,
    revenueTrend,
    revenueSummary: {
      grossTicketRevenueCents: grossTicketRevenue,
      membershipRevenueCents: membershipRevenue,
      refundsCents: refundRevenue,
      netRevenueCents: grossTicketRevenue + membershipRevenue - refundRevenue,
      confirmedBookings: confirmed.filter(booking => !range || (booking.createdAt >= range.start && booking.createdAt < range.end)).length,
      paidTicketTransactions: ticketPayments.length,
    },
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
