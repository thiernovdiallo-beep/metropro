import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { FIRST_PARTY_HEADER } from "@shared/const";
import { z } from "zod";
import {
  auditLogs,
  bookings,
  cities,
  departures,
  dispatchMessages,
  driverPrivateProfiles,
  driverProfiles,
  driverSetupInvites,
  locations,
  maintenanceLogs,
  memberCredentials,
  passengers,
  payments,
  refunds,
  routes,
  tickets,
  users,
  vehicles,
} from "../../drizzle/schema";
import { getDb, writeAudit } from "../db";
import { insertId } from "../lib/mysql";
import { createDriverSetupToken, DRIVER_SETUP_MS } from "../services/driver-auth";
import { prepareDriverPrivate } from "../services/driver-private";
import { normalizeMemberEmail } from "../services/member-auth";
import { assertMemberAuthOrigin } from "../services/checkout-origin";
import { getAnalytics, getOpsKpis } from "../services/analytics";
import { assertDriverAssignable, assertVehicleAssignable } from "../services/dispatch";
import { restoreSoldSeats } from "../services/inventory";
import { allocatePaidAcrossLegs } from "../services/pricing";
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
      const paid = allocatePaidAcrossLegs(b.amountCents, b.outboundQuotedCents, b.returnQuotedCents);
      return s + (b.outboundDepartureId === dep.id ? paid.outboundCents : paid.returnCents);
    }, 0);
  const pax = [];
  for (const b of tripBookings) {
    if (b.status !== "confirmed") continue;
    const tripTickets = await db.select().from(tickets)
      .where(and(eq(tickets.bookingId, b.id), eq(tickets.departureId, dep.id)));
    for (const ticket of tripTickets) {
      if (ticket.status === "voided") continue;
      const [p] = await db.select().from(passengers).where(eq(passengers.id, ticket.passengerId)).limit(1);
      if (p) pax.push({ ...p, status: ticket.status, boardedAt: ticket.boardedAt,
        bookingNumber: b.bookingNumber, paymentStatus: b.status, contactPhone: b.contactPhone,
        seatType: ticket.seatType });
    }
  }
  return {
    departure: dep,
    route,
    origin,
    destination,
    vehicle,
    driver: driver ? { id: driver.id, fullName: driver.fullName, phone: driver.phone, status: driver.status } : null,
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
      return { vehicle: v, maintenance: logs, upcoming,
        driver: driver ? { id: driver.id, fullName: driver.fullName, phone: driver.phone, status: driver.status } : null };
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
    const profiles = await db.select().from(driverProfiles);
    const privateRows = await db.select({ profileId: driverPrivateProfiles.profileId, idLast4: driverPrivateProfiles.idLast4 }).from(driverPrivateProfiles);
    const credentials = await db.select({ userId: memberCredentials.userId }).from(memberCredentials);
    const ids = new Map(privateRows.map(row => [row.profileId, row.idLast4]));
    const activated = new Set(credentials.map(row => row.userId));
    return profiles.map(profile => ({
      ...profile,
      idLast4: ids.get(profile.id) ?? null,
      loginReady: profile.userId !== null && activated.has(profile.userId),
    }));
  }),
  inviteDriver: adminProcedure
    .input(
      z.object({
        fullName: z.string().trim().min(2).max(160),
        email: z.string().trim().email().max(320),
        phone: z.string().trim().min(7).max(32),
        idNumber: z.string().trim().min(4).max(64),
        photoBase64: z.string().min(32).max(2_800_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const email = normalizeMemberEmail(input.email);
      assertMemberAuthOrigin(ctx.req.headers.origin, ctx.req.headers["sec-fetch-site"], ctx.req.get(FIRST_PARTY_HEADER));
      const details = prepareDriverPrivate(input.idNumber, input.photoBase64);
      const invite = createDriverSetupToken();
      try {
        const result = await db.transaction(async tx => {
          const [existingUser] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
          if (existingUser) throw new TRPCError({ code: "CONFLICT", message: "This email already belongs to an account. Driver access cannot be assigned to a customer account." });
          const [existingProfile] = await tx.select().from(driverProfiles).where(eq(driverProfiles.email, email)).limit(1).for("update");
          if (existingProfile?.userId || existingProfile?.status === "inactive") {
            throw new TRPCError({ code: "CONFLICT", message: "This driver profile is already linked or inactive." });
          }
          const newUserId = insertId(await tx.insert(users).values({
            openId: `local_driver_${randomUUID()}`, name: input.fullName, email, phone: input.phone,
            loginMethod: "password", role: "driver", lastSignedIn: new Date(),
          }));
          const profileId = existingProfile?.id ?? insertId(await tx.insert(driverProfiles).values({
            fullName: input.fullName, email, phone: input.phone, status: "active", userId: newUserId,
          }));
          if (existingProfile) await tx.update(driverProfiles).set({
            userId: newUserId, fullName: input.fullName, phone: input.phone,
          }).where(eq(driverProfiles.id, existingProfile.id));
          await tx.insert(driverPrivateProfiles).values({ profileId, ...details });
          await tx.insert(driverSetupInvites).values({
            userId: newUserId, tokenHash: invite.hash,
            expiresAt: new Date(Date.now() + DRIVER_SETUP_MS),
          });
          return { profileId, expiresAt: new Date(Date.now() + DRIVER_SETUP_MS) };
        });
        await writeAudit(ctx.user.id, "driver.account.create", "driver", result.profileId);
        return { ...result, setupToken: invite.token };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "CONFLICT", message: "Could not create this driver. Check whether the email is already in use." });
      }
    }),
  reissueDriverInvite: adminProcedure.input(z.object({ profileId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertMemberAuthOrigin(ctx.req.headers.origin, ctx.req.headers["sec-fetch-site"], ctx.req.get(FIRST_PARTY_HEADER));
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const invite = createDriverSetupToken();
      const expiresAt = new Date(Date.now() + DRIVER_SETUP_MS);
      await db.transaction(async tx => {
        const [profile] = await tx.select().from(driverProfiles).where(eq(driverProfiles.id, input.profileId)).limit(1).for("update");
        if (!profile?.userId || profile.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "No active driver account to invite." });
        const [user] = await tx.select().from(users).where(eq(users.id, profile.userId)).limit(1);
        const [credential] = await tx.select({ id: memberCredentials.id }).from(memberCredentials)
          .where(eq(memberCredentials.userId, profile.userId)).limit(1);
        if (user?.role !== "driver" || credential) throw new TRPCError({ code: "BAD_REQUEST", message: "Driver setup is already complete or the account is unavailable." });
        await tx.update(driverSetupInvites).set({ consumedAt: new Date() })
          .where(and(eq(driverSetupInvites.userId, profile.userId), isNull(driverSetupInvites.consumedAt)));
        await tx.insert(driverSetupInvites).values({ userId: profile.userId, tokenHash: invite.hash, expiresAt });
      });
      await writeAudit(ctx.user.id, "driver.account.reinvite", "driver", input.profileId);
      return { setupToken: invite.token, expiresAt };
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
        frontFareCents: z.number(),
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
      try { await assertDriverAssignable(input.driverId, departAt, arriveAt); }
      catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Driver unavailable" }); }
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
      try { await assertDriverAssignable(input.driverId, dep.departAt, dep.arriveAt, dep.id); }
      catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Driver unavailable" }); }
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
      await restoreSoldSeats(booking.outboundDepartureId, booking.passengerCount, booking.outboundFrontSeats);
      if (booking.returnDepartureId) {
        await restoreSoldSeats(booking.returnDepartureId, booking.passengerCount, booking.returnFrontSeats);
      }
      await db.transaction(async tx => {
        await tx.update(bookings).set({ status: "refunded" }).where(eq(bookings.id, booking.id));
        await tx.update(passengers).set({ departureId: null, seatNumber: null, returnDepartureId: null, returnSeatNumber: null })
          .where(eq(passengers.bookingId, booking.id));
        await tx.update(tickets).set({ status: "voided" }).where(eq(tickets.bookingId, booking.id));
      });
      if (booking.userId !== null) await notify({
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
