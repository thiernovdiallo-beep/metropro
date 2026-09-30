import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, or } from "drizzle-orm";
import { z } from "zod";
import {
  auditLogs,
  bookings,
  cities,
  departures,
  dispatchMessages,
  driverProfiles,
  locations,
  maintenanceLogs,
  passengers,
  payments,
  refunds,
  routes,
  tickets,
  users,
  vehicles,
} from "../../drizzle/schema";
import { getDb, writeAudit } from "../db";
import { getAnalytics, getOpsKpis } from "../services/analytics";
import { assertVehicleAssignable } from "../services/dispatch";
import { restoreSoldSeats } from "../services/inventory";
import { TEMPLATES, notify } from "../services/notifications";
import { DEFAULT_SETTINGS, getSettings, saveSettings, type AppSettings } from "../services/policies";
import { getStripe, stripeEnabled } from "../stripe/client";
import { adminProcedure, router } from "../_core/trpc";

async function tripDetail(dep: typeof departures.$inferSelect) {
  const db = await getDb();
  if (!db) return null;
  const [route] = await db.select().from(routes).where(eq(routes.id, dep.routeId)).limit(1);
  const [origin] = route
    ? await db.select().from(cities).where(eq(cities.id, route.originCityId)).limit(1)
    : [null];
  const [destination] = route
    ? await db.select().from(cities).where(eq(cities.id, route.destinationCityId)).limit(1)
    : [null];
  const [vehicle] = dep.vehicleId
    ? await db.select().from(vehicles).where(eq(vehicles.id, dep.vehicleId)).limit(1)
    : [null];
  const [driver] = dep.driverId
    ? await db.select().from(driverProfiles).where(eq(driverProfiles.id, dep.driverId)).limit(1)
    : [null];
  const tripBookings = await db
    .select()
    .from(bookings)
    .where(or(eq(bookings.outboundDepartureId, dep.id), eq(bookings.returnDepartureId, dep.id)));
  const revenue = tripBookings
    .filter(b => b.status === "confirmed")
    .reduce((s, b) => {
      const legs = b.returnDepartureId ? 2 : 1;
      return s + Math.round(b.amountCents / legs);
    }, 0);
  const pax = [];
  for (const b of tripBookings) {
    const people = await db.select().from(passengers).where(eq(passengers.bookingId, b.id));
    pax.push(
      ...people.map(p => ({
        ...p,
        bookingNumber: b.bookingNumber,
        paymentStatus: b.status,
        contactPhone: b.contactPhone,
      }))
    );
  }
  return {
    departure: dep,
    route,
    origin,
    destination,
    vehicle,
    driver,
    seatsSold: dep.seatsSold,
    seatsRemaining: Math.max(0, dep.capacity - dep.seatsSold - dep.seatsHeld),
    revenueCents: revenue,
    paymentStatuses: tripBookings.map(b => ({ bookingNumber: b.bookingNumber, status: b.status })),
    manifest: pax,
    tripStatus: dep.status,
  };
}

export const adminRouter = router({
  kpis: adminProcedure.query(async () => getOpsKpis()),
  analytics: adminProcedure.query(async () => getAnalytics()),
  trip: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [dep] = await db.select().from(departures).where(eq(departures.id, input.id)).limit(1);
      if (!dep) throw new TRPCError({ code: "NOT_FOUND" });
      return tripDetail(dep);
    }),
  tripsToday: adminProcedure.query(async () => {
    const kpis = await getOpsKpis();
    const details = [];
    for (const t of kpis.trips) {
      details.push(await tripDetail(t));
    }
    return details;
  }),
  dispatchBoard: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const vans = await db.select().from(vehicles);
    const now = new Date();
    const soon = new Date(now.getTime() + 36 * 60 * 60 * 1000);
    const board = [];
    for (const van of vans) {
      const assigned = await db
        .select()
        .from(departures)
        .where(eq(departures.vehicleId, van.id));
      const current =
        assigned.find(
          d =>
            d.departAt <= soon &&
            d.arriveAt >= now &&
            d.status !== "canceled" &&
            d.status !== "completed"
        ) ??
        assigned
          .filter(d => d.departAt >= now && d.status !== "canceled")
          .sort((a, b) => a.departAt.getTime() - b.departAt.getTime())[0];
      const next = assigned
        .filter(
          d =>
            current &&
            d.id !== current.id &&
            d.departAt >= (current?.arriveAt ?? now) &&
            d.status !== "canceled"
        )
        .sort((a, b) => a.departAt.getTime() - b.departAt.getTime())[0];
      const currentBundle = current ? await tripDetail(current) : null;
      const nextBundle = next ? await tripDetail(next) : null;
      board.push({
        vehicle: van,
        driver: currentBundle?.driver ?? null,
        status: van.status,
        location: current?.currentLocationLabel ?? currentBundle?.origin?.name ?? "Depot",
        route: currentBundle
          ? `${currentBundle.origin?.name} → ${currentBundle.destination?.name}`
          : "Preparing",
        departure: current?.departAt ?? null,
        eta: current?.arriveAt ?? null,
        nextAssignment: nextBundle
          ? {
              route: `${nextBundle.origin?.name} → ${nextBundle.destination?.name}`,
              departAt: next.departAt,
            }
          : null,
        currentDepartureId: current?.id ?? null,
      });
    }
    return board;
  }),
  vehicles: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(vehicles);
  }),
  vehicle: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [v] = await db.select().from(vehicles).where(eq(vehicles.id, input.id)).limit(1);
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      const logs = await db
        .select()
        .from(maintenanceLogs)
        .where(eq(maintenanceLogs.vehicleId, v.id))
        .orderBy(desc(maintenanceLogs.performedAt));
      const upcoming = await db
        .select()
        .from(departures)
        .where(eq(departures.vehicleId, v.id));
      const driver = v.assignedDriverId
        ? (
            await db
              .select()
              .from(driverProfiles)
              .where(eq(driverProfiles.id, v.assignedDriverId))
              .limit(1)
          )[0]
        : null;
      return { vehicle: v, maintenance: logs, upcoming, driver };
    }),
  saveVehicle: adminProcedure
    .input(
      z.object({
        id: z.number().optional(),
        code: z.string().min(2),
        vin: z.string().optional(),
        make: z.string().min(1),
        model: z.string().min(1),
        year: z.number(),
        capacity: z.number().int().min(1).max(40),
        currentMileage: z.number().int().min(0),
        status: z.enum(["available", "assigned", "in_transit", "maintenance", "out_of_service"]),
        assignedDriverId: z.number().nullable().optional(),
        notes: z.string().optional(),
        registrationExpiresAt: z.string().nullable().optional(),
        insuranceExpiresAt: z.string().nullable().optional(),
        inspectionExpiresAt: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.id) {
        const [prev] = await db.select().from(vehicles).where(eq(vehicles.id, input.id)).limit(1);
        await db
          .update(vehicles)
          .set({
            code: input.code,
            vin: input.vin ?? null,
            make: input.make,
            model: input.model,
            year: input.year,
            capacity: input.capacity,
            currentMileage: input.currentMileage,
            status: input.status,
            assignedDriverId: input.assignedDriverId ?? null,
            notes: input.notes ?? null,
            registrationExpiresAt: input.registrationExpiresAt ? new Date(input.registrationExpiresAt) : null,
            insuranceExpiresAt: input.insuranceExpiresAt ? new Date(input.insuranceExpiresAt) : null,
            inspectionExpiresAt: input.inspectionExpiresAt ? new Date(input.inspectionExpiresAt) : null,
          })
          .where(eq(vehicles.id, input.id));
        if (prev && prev.capacity !== input.capacity) {
          await writeAudit(ctx.user.id, "vehicle.capacity_change", "vehicle", input.id, {
            from: prev.capacity,
            to: input.capacity,
          });
        }
      } else {
        await db.insert(vehicles).values({
          code: input.code,
          vin: input.vin ?? null,
          make: input.make,
          model: input.model,
          year: input.year,
          capacity: input.capacity,
          currentMileage: input.currentMileage,
          status: input.status,
          assignedDriverId: input.assignedDriverId ?? null,
          notes: input.notes ?? null,
          registrationExpiresAt: input.registrationExpiresAt ? new Date(input.registrationExpiresAt) : null,
          insuranceExpiresAt: input.insuranceExpiresAt ? new Date(input.insuranceExpiresAt) : null,
          inspectionExpiresAt: input.inspectionExpiresAt ? new Date(input.inspectionExpiresAt) : null,
        });
      }
      await writeAudit(ctx.user.id, "vehicle.save", "vehicle", input.id ?? input.code);
      return { ok: true };
    }),
  addMaintenance: adminProcedure
    .input(
      z.object({
        vehicleId: z.number(),
        type: z.string(),
        notes: z.string().optional(),
        mileage: z.number().optional(),
        performedAt: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(maintenanceLogs).values({
        vehicleId: input.vehicleId,
        type: input.type,
        notes: input.notes ?? null,
        mileage: input.mileage ?? null,
        performedAt: new Date(input.performedAt),
      });
      await writeAudit(ctx.user.id, "vehicle.maintenance", "vehicle", input.vehicleId);
      return { ok: true };
    }),
  drivers: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(driverProfiles);
  }),
  inviteDriver: adminProcedure
    .input(
      z.object({
        fullName: z.string().min(2),
        email: z.string().email(),
        phone: z.string().optional(),
        licenseNumber: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(driverProfiles).values({
        fullName: input.fullName,
        email: input.email.toLowerCase(),
        phone: input.phone ?? null,
        licenseNumber: input.licenseNumber ?? null,
        status: "active",
      });
      const [user] = await db.select().from(users).where(eq(users.email, input.email.toLowerCase())).limit(1);
      if (user) {
        await db.update(users).set({ role: "driver" }).where(eq(users.id, user.id));
      }
      await writeAudit(ctx.user.id, "driver.invite", "driver", input.email);
      return { ok: true };
    }),
  cities: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(cities);
  }),
  locations: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(locations);
  }),
  addCity: adminProcedure
    .input(z.object({ code: z.string(), name: z.string(), state: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(cities).values(input);
      await writeAudit(ctx.user.id, "city.create", "city", input.code);
      return { ok: true };
    }),
  addLocation: adminProcedure
    .input(z.object({ cityId: z.number(), label: z.string(), address: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(locations).values(input);
      return { ok: true };
    }),
  routes: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(routes);
  }),
  saveRoute: adminProcedure
    .input(
      z.object({
        id: z.number().optional(),
        originCityId: z.number(),
        destinationCityId: z.number(),
        pickupLocationId: z.number(),
        dropoffLocationId: z.number(),
        estimatedMinutes: z.number(),
        standardFareCents: z.number(),
        memberFareCents: z.number(),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...rest } = input;
      if (id) {
        await db.update(routes).set(rest).where(eq(routes.id, id));
      } else {
        await db.insert(routes).values(rest);
      }
      await writeAudit(ctx.user.id, "route.save", "route", id ?? "new", rest);
      return { ok: true };
    }),
  createDeparture: adminProcedure
    .input(
      z.object({
        routeId: z.number(),
        vehicleId: z.number(),
        driverId: z.number(),
        departAt: z.string(),
        arriveAt: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const departAt = new Date(input.departAt);
      const arriveAt = new Date(input.arriveAt);
      const vehicle = await assertVehicleAssignable(input.vehicleId, departAt, arriveAt);
      const settings = await getSettings();
      await db.insert(departures).values({
        routeId: input.routeId,
        vehicleId: input.vehicleId,
        driverId: input.driverId,
        departAt,
        arriveAt,
        capacity: vehicle.capacity,
        memberEarlyAccessAt: new Date(
          departAt.getTime() - settings.memberEarlyAccessHours * 60 * 60 * 1000
        ),
        status: "scheduled",
      });
      await writeAudit(ctx.user.id, "departure.create", "departure", input.routeId);
      return { ok: true };
    }),
  assignTrip: adminProcedure
    .input(
      z.object({
        departureId: z.number(),
        vehicleId: z.number(),
        driverId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [dep] = await db.select().from(departures).where(eq(departures.id, input.departureId)).limit(1);
      if (!dep) throw new TRPCError({ code: "NOT_FOUND" });
      await assertVehicleAssignable(input.vehicleId, dep.departAt, dep.arriveAt, dep.id);
      await db
        .update(departures)
        .set({ vehicleId: input.vehicleId, driverId: input.driverId })
        .where(eq(departures.id, dep.id));
      await writeAudit(ctx.user.id, "departure.assign", "departure", dep.id, input);
      return { ok: true };
    }),
  settings: adminProcedure.query(async () => getSettings()),
  saveSettings: adminProcedure
    .input(z.custom<AppSettings>())
    .mutation(async ({ ctx, input }) => {
      await saveSettings({ ...DEFAULT_SETTINGS, ...input });
      await writeAudit(ctx.user.id, "settings.save", "settings", "app");
      return { ok: true };
    }),
  messages: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(dispatchMessages).orderBy(desc(dispatchMessages.createdAt)).limit(50);
  }),
  audit: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
  }),
  refundBooking: adminProcedure
    .input(z.object({ bookingId: z.number(), reason: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
      if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
      if (booking.status === "refunded") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Booking already refunded" });
      }
      if (booking.stripePaymentIntentId && stripeEnabled()) {
        const refund = await getStripe().refunds.create({
          payment_intent: booking.stripePaymentIntentId,
        });
        const [pay] = await db
          .select()
          .from(payments)
          .where(eq(payments.bookingId, booking.id))
          .limit(1);
        if (pay) {
          await db.insert(refunds).values({
            paymentId: pay.id,
            bookingId: booking.id,
            amountCents: booking.amountCents,
            reason: input.reason,
            adminUserId: ctx.user.id,
            stripeRefundId: refund.id,
          });
          await db.update(payments).set({ status: "refunded" }).where(eq(payments.id, pay.id));
        }
      }
      await restoreSoldSeats(booking.outboundDepartureId, booking.passengerCount);
      if (booking.returnDepartureId) {
        await restoreSoldSeats(booking.returnDepartureId, booking.passengerCount);
      }
      await db.update(bookings).set({ status: "refunded" }).where(eq(bookings.id, booking.id));
      await db.update(tickets).set({ status: "voided" }).where(eq(tickets.bookingId, booking.id));
      await notify({
        userId: booking.userId,
        templateKey: TEMPLATES.refund,
        title: "Refund issued",
        body: `A refund for booking ${booking.bookingNumber} has been issued.`,
      });
      await writeAudit(ctx.user.id, "booking.refund", "booking", booking.id, {
        reason: input.reason,
      });
      return { ok: true };
    }),
  runReminders: adminProcedure.mutation(async () => {
    const { runReminders } = await import("../services/reminders");
    return runReminders();
  }),
});
