import { and, eq, gte, lte, or } from "drizzle-orm";
import { bookings, cities, departures, routes } from "../../drizzle/schema";
import { getDb } from "../db";
import { expireStaleHolds } from "./inventory";
import { TEMPLATES, boardingCopy, notify, tripReminderCopy } from "./notifications";
import { getSettings } from "./policies";

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

async function bookingsForDeparture(departureId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "confirmed"),
        or(eq(bookings.outboundDepartureId, departureId), eq(bookings.returnDepartureId, departureId))
      )
    );
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

  const upcoming24 = await db
    .select()
    .from(departures)
    .where(and(gte(departures.departAt, windowStart), lte(departures.departAt, windowEnd)));
  const boarding = await db
    .select()
    .from(departures)
    .where(and(gte(departures.departAt, boardStart), lte(departures.departAt, boardEnd)));

  let sent24h = 0;
  let sentBoarding = 0;
  for (const dep of upcoming24) {
    const [route] = await db.select().from(routes).where(eq(routes.id, dep.routeId)).limit(1);
    if (!route) continue;
    const [origin] = await db.select().from(cities).where(eq(cities.id, route.originCityId)).limit(1);
    const [dest] = await db.select().from(cities).where(eq(cities.id, route.destinationCityId)).limit(1);
    const confirmed = await bookingsForDeparture(dep.id);
    for (const b of confirmed) {
      if (b.userId === null) continue;
      if (b.reminder24hSentAt && b.outboundDepartureId === dep.id) continue;
      const key = b.outboundDepartureId === dep.id ? TEMPLATES.reminder_24h : TEMPLATES.upcoming_departure;
      await notify({
        userId: b.userId,
        templateKey: key,
        title: b.outboundDepartureId === dep.id ? "Trip tomorrow" : "Upcoming departure",
        body: tripReminderCopy(origin?.name ?? "origin", dest?.name ?? "destination", formatTime(dep.departAt)),
      });
      if (b.outboundDepartureId === dep.id) {
        await db.update(bookings).set({ reminder24hSentAt: now }).where(eq(bookings.id, b.id));
      }
      sent24h += 1;
    }
    if (!dep.reminder24hSentAt) {
      await db.update(departures).set({ reminder24hSentAt: now }).where(eq(departures.id, dep.id));
    }
  }

  for (const dep of boarding) {
    const confirmed = await bookingsForDeparture(dep.id);
    for (const b of confirmed) {
      if (b.userId === null) continue;
      if (b.boardingReminderSentAt && b.outboundDepartureId === dep.id) continue;
      await notify({
        userId: b.userId,
        templateKey: TEMPLATES.boarding_reminder,
        title: "Boarding soon",
        body: boardingCopy(),
      });
      if (b.outboundDepartureId === dep.id) {
        await db.update(bookings).set({ boardingReminderSentAt: now }).where(eq(bookings.id, b.id));
      }
      sentBoarding += 1;
    }
    if (!dep.boardingReminderSentAt) {
      await db.update(departures).set({ boardingReminderSentAt: now }).where(eq(departures.id, dep.id));
    }
  }

  return { sent24h, sentBoarding, expiredHolds: expired.expired };
}
