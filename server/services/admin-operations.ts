import { and, desc, eq, gte, inArray, like, lt, or, sql, type SQL } from "drizzle-orm";
import { bookings, cities, departures, passengers, payments, refunds, routes, supportTickets, tickets } from "../../drizzle/schema";
import { getDb } from "../db";
import { analyticsDateRange } from "./analytics";

export type BookingSearch = { query?: string; status?: typeof bookings.$inferSelect.status; date?: string };

export async function searchAdminBookings(input: BookingSearch) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: SQL[] = [];
  if (input.status) conditions.push(eq(bookings.status, input.status));
  if (input.date) {
    const range = analyticsDateRange({ period: "custom", from: input.date, to: input.date })!;
    const ids = (await db.select({ id: departures.id }).from(departures).where(and(gte(departures.departAt, range.start), lt(departures.departAt, range.end)))).map(row => row.id);
    if (!ids.length) return [];
    conditions.push(or(inArray(bookings.outboundDepartureId, ids), inArray(bookings.returnDepartureId, ids))!);
  }
  const term = input.query?.trim();
  if (term) {
    const pattern = `%${term}%`;
    const foundCities = await db.select({ id: cities.id }).from(cities).where(or(like(cities.name, pattern), like(cities.code, pattern)));
    const matchingRoutes = foundCities.length ? await db.select({ id: routes.id }).from(routes).where(or(inArray(routes.originCityId, foundCities.map(city => city.id)), inArray(routes.destinationCityId, foundCities.map(city => city.id)))) : [];
    const routeDepIds = matchingRoutes.length ? (await db.select({ id: departures.id }).from(departures).where(inArray(departures.routeId, matchingRoutes.map(route => route.id)))).map(row => row.id) : [];
    const matchingPassengers = db.select({ bookingId: passengers.bookingId }).from(passengers).where(or(
      like(passengers.firstName, pattern), like(passengers.lastName, pattern),
      sql`concat(${passengers.firstName}, ' ', ${passengers.lastName}) like ${pattern}`
    ));
    conditions.push(or(
      like(bookings.bookingNumber, pattern), like(bookings.contactPhone, pattern),
      like(bookings.contactEmail, pattern), like(bookings.contactFirstName, pattern), like(bookings.contactLastName, pattern),
      sql`concat(${bookings.contactFirstName}, ' ', ${bookings.contactLastName}) like ${pattern}`,
      inArray(bookings.id, matchingPassengers),
      ...(routeDepIds.length ? [inArray(bookings.outboundDepartureId, routeDepIds), inArray(bookings.returnDepartureId, routeDepIds)] : []),
    )!);
  }
  const found = await db.select({
    id: bookings.id, bookingNumber: bookings.bookingNumber, status: bookings.status,
    userId: bookings.userId, usedFreeReschedule: bookings.usedFreeReschedule,
    createdAt: bookings.createdAt, amountCents: bookings.amountCents, passengerCount: bookings.passengerCount,
    outboundDepartureId: bookings.outboundDepartureId, returnDepartureId: bookings.returnDepartureId,
    contactFirstName: bookings.contactFirstName, contactLastName: bookings.contactLastName,
    contactPhone: bookings.contactPhone, contactEmail: bookings.contactEmail,
  }).from(bookings).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(bookings.createdAt)).limit(100);
  if (!found.length) return [];
  const bookingIds = found.map(row => row.id);
  const depIds = [...new Set(found.flatMap(row => [row.outboundDepartureId, row.returnDepartureId]).filter((id): id is number => id !== null))];
  const [deps, allRoutes, allCities, pax, pay] = await Promise.all([
    db.select({ id: departures.id, routeId: departures.routeId, departAt: departures.departAt, arriveAt: departures.arriveAt, status: departures.status }).from(departures).where(inArray(departures.id, depIds)),
    db.select({ id: routes.id, originCityId: routes.originCityId, destinationCityId: routes.destinationCityId }).from(routes),
    db.select({ id: cities.id, name: cities.name }).from(cities),
    db.select({ id: passengers.id, bookingId: passengers.bookingId, firstName: passengers.firstName, lastName: passengers.lastName,
      seatNumber: passengers.seatNumber, returnSeatNumber: passengers.returnSeatNumber, outboundSeatType: passengers.outboundSeatType,
      returnSeatType: passengers.returnSeatType, status: passengers.status }).from(passengers).where(inArray(passengers.bookingId, bookingIds)),
    db.select({ id: payments.id, bookingId: payments.bookingId, status: payments.status, amountCents: payments.amountCents }).from(payments).where(inArray(payments.bookingId, bookingIds)),
  ]);
  const depById = new Map(deps.map(row => [row.id, row]));
  const routeById = new Map(allRoutes.map(row => [row.id, row]));
  const cityById = new Map(allCities.map(row => [row.id, row.name]));
  const label = (id: number | null) => {
    const dep = id ? depById.get(id) : null;
    const route = dep ? routeById.get(dep.routeId) : null;
    return route ? `${cityById.get(route.originCityId) ?? "Unknown"} → ${cityById.get(route.destinationCityId) ?? "Unknown"}` : "Unassigned route";
  };
  return found.map(row => ({ ...row,
    outbound: depById.get(row.outboundDepartureId) ?? null, returnTrip: row.returnDepartureId ? depById.get(row.returnDepartureId) ?? null : null,
    routeLabel: label(row.outboundDepartureId), returnRouteLabel: row.returnDepartureId ? label(row.returnDepartureId) : null,
    passengers: pax.filter(person => person.bookingId === row.id),
    payments: pay.filter(payment => payment.bookingId === row.id),
  }));
}

export async function adminBookingDetail(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.select({ bookingNumber: bookings.bookingNumber }).from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!row) return null;
  const item = (await searchAdminBookings({ query: row.bookingNumber })).find(booking => booking.id === id);
  if (!item) return null;
  const digitalTickets = await db.select({ id: tickets.id, passengerId: tickets.passengerId, departureId: tickets.departureId, qrToken: tickets.qrToken, status: tickets.status, seatType: tickets.seatType, boardedAt: tickets.boardedAt }).from(tickets).where(eq(tickets.bookingId, id));
  const [refund] = await db.select({ status: refunds.status, failureReason: refunds.failureReason, amountCents: refunds.amountCents })
    .from(refunds).where(eq(refunds.bookingId, id)).orderBy(desc(refunds.createdAt)).limit(1);
  return { ...item, digitalTickets, refund: refund ?? null };
}

export async function adminPayments() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db.select({ id: payments.id, bookingId: payments.bookingId, kind: payments.kind, status: payments.status,
    amountCents: payments.amountCents, currency: payments.currency, createdAt: payments.createdAt,
    stripePaymentIntentId: payments.stripePaymentIntentId }).from(payments).orderBy(desc(payments.createdAt)).limit(100);
  const bookingIds = [...new Set(rows.map(row => row.bookingId).filter((id): id is number => id !== null))];
  const found = bookingIds.length ? await db.select({ id: bookings.id, bookingNumber: bookings.bookingNumber,
    firstName: bookings.contactFirstName, lastName: bookings.contactLastName }).from(bookings).where(inArray(bookings.id, bookingIds)) : [];
  const refundRows = rows.length ? await db.select({ paymentId: refunds.paymentId, status: refunds.status })
    .from(refunds).where(inArray(refunds.paymentId, rows.map(row => row.id))).orderBy(desc(refunds.createdAt)) : [];
  const refundByPayment = new Map<number, typeof refundRows[number]>();
  for (const refund of refundRows) if (!refundByPayment.has(refund.paymentId)) refundByPayment.set(refund.paymentId, refund);
  const references = new Map(found.map(row => [row.id, row]));
  return rows.map(row => ({ ...row, bookingNumber: row.bookingId ? references.get(row.bookingId)?.bookingNumber ?? null : null,
    customerName: row.bookingId ? `${references.get(row.bookingId)?.firstName ?? ""} ${references.get(row.bookingId)?.lastName ?? ""}`.trim() || null : null,
    refundStatus: refundByPayment.get(row.id)?.status ?? null }));
}

export async function adminSupportTickets() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).limit(100);
}
