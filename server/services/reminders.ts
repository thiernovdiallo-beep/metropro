import { and, eq, gte, lte, or, sql } from "drizzle-orm";
import { bookings, cities, departures, notifications, routes } from "../../drizzle/schema";
import { getDb } from "../db";
import { expireStaleHolds } from "./inventory";
import { TEMPLATES, boardingCopy, tripReminderCopy } from "./notifications";
import { getSettings } from "./policies";

type ReminderKind = "24h" | "boarding";

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

async function remindDeparture(departureId: number, kind: ReminderKind, now: Date) {
  const db = await getDb();
  if (!db) return 0;

  // Lock the departure before checking its timestamp. Concurrent scheduled and
  // admin-triggered runs cannot both pass this guard or partially persist notices.
  return db.transaction(async tx => {
    const [departure] = await tx.select().from(departures)
      .where(eq(departures.id, departureId)).limit(1).for("update");
    if (!departure || (kind === "24h" ? departure.reminder24hSentAt : departure.boardingReminderSentAt)) {
      return 0;
    }

    let reminderBody = boardingCopy();
    if (kind === "24h") {
      const [route] = await tx.select().from(routes).where(eq(routes.id, departure.routeId)).limit(1);
      if (!route) return 0;
      const [origin] = await tx.select().from(cities).where(eq(cities.id, route.originCityId)).limit(1);
      const [dest] = await tx.select().from(cities).where(eq(cities.id, route.destinationCityId)).limit(1);
      reminderBody = tripReminderCopy(origin?.name ?? "origin", dest?.name ?? "destination", formatTime(departure.departAt));
    }

    const confirmed = await tx.select().from(bookings).where(and(
      eq(bookings.status, "confirmed"),
      or(eq(bookings.outboundDepartureId, departureId), eq(bookings.returnDepartureId, departureId))
    ));
    let sent = 0;
    for (const booking of confirmed) {
      if (booking.userId === null) continue;
      const outbound = booking.outboundDepartureId === departureId;
      // The old booking-level flags are not departure-scoped: a rescheduled
      // booking may still have a flag from its previous outbound trip.
      // Only the departure guard and scoped notice marker can deduplicate it.
      const templateKey = kind === "boarding" ? TEMPLATES.boarding_reminder
        : outbound ? TEMPLATES.reminder_24h : TEMPLATES.upcoming_departure;

      // Existing JSON payloads provide a durable per-booking, per-departure,
      // per-template marker, without adding a column or editing past migrations.
      const [existing] = await tx.select({ id: notifications.id }).from(notifications)
        .where(and(
          eq(notifications.userId, booking.userId),
          eq(notifications.channel, "in_app"),
          eq(notifications.templateKey, templateKey),
          sql`JSON_UNQUOTE(JSON_EXTRACT(${notifications.payload}, '$.bookingId')) = ${String(booking.id)}`,
          sql`JSON_UNQUOTE(JSON_EXTRACT(${notifications.payload}, '$.departureId')) = ${String(departureId)}`
        )).limit(1);
      if (existing) continue;

      const title = kind === "boarding" ? "Boarding soon" : outbound ? "Trip tomorrow" : "Upcoming departure";
      const payload = { bookingId: booking.id, departureId };
      // Record only an actual in-app notice. Email, SMS and push delivery need
      // provider adapters and must not be marked sent before those exist.
      // The notice, marker and departure guard commit under the same lock.
      await tx.insert(notifications).values({
        userId: booking.userId,
        channel: "in_app",
        templateKey,
        title,
        body: reminderBody,
        payload,
      });
      if (outbound) {
        await tx.update(bookings).set(kind === "24h"
          ? { reminder24hSentAt: now }
          : { boardingReminderSentAt: now })
          .where(eq(bookings.id, booking.id));
      }
      sent += 1;
    }

    await tx.update(departures).set(kind === "24h"
      ? { reminder24hSentAt: now }
      : { boardingReminderSentAt: now })
      .where(eq(departures.id, departureId));
    return sent;
  });
}

export async function runReminders(now = new Date()) {
  const db = await getDb();
  if (!db) return { sent24h: 0, sentBoarding: 0, expiredHolds: 0 };
  const expired = await expireStaleHolds(now);
  const settings = await getSettings();
  const windowStart = new Date(now.getTime() + (settings.reminderOffsets.hours24 - 0.26) * 3600000);
  const windowEnd = new Date(now.getTime() + (settings.reminderOffsets.hours24 + 0.26) * 3600000);
  const boardStart = new Date(now.getTime() + (settings.reminderOffsets.boardingMinutes - 8) * 60000);
  const boardEnd = new Date(now.getTime() + (settings.reminderOffsets.boardingMinutes + 8) * 60000);

  const upcoming24 = await db.select({ id: departures.id }).from(departures)
    .where(and(gte(departures.departAt, windowStart), lte(departures.departAt, windowEnd)));
  const boarding = await db.select({ id: departures.id }).from(departures)
    .where(and(gte(departures.departAt, boardStart), lte(departures.departAt, boardEnd)));

  let sent24h = 0;
  let sentBoarding = 0;
  for (const departure of upcoming24) sent24h += await remindDeparture(departure.id, "24h", now);
  for (const departure of boarding) sentBoarding += await remindDeparture(departure.id, "boarding", now);
  return { sent24h, sentBoarding, expiredHolds: expired.expired };
}
