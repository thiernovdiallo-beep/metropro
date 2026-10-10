import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
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
  routes,
  routeStops,
  supportTickets,
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
import { analyticsDateRange, getAnalytics, getOpsKpis } from "../services/analytics";
import { adminBookingDetail, adminPayments, adminSupportTickets, searchAdminBookings } from "../services/admin-operations";
import { changesBookedItinerary } from "../services/route-safety";
import { rescheduleWithNumberedSeats } from "../services/rescheduling";
import { beginBookingRefund, reconcilePendingRefunds, submitRefundIntent } from "../services/refund-lifecycle";
import { assertDriverAssignable, assertVehicleAssignable } from "../services/dispatch";
import { planVehicleCapacityRetune } from "../services/vehicle-capacity";
import { allocatePaidAcrossLegs } from "../services/pricing";
import { TEMPLATES, notify } from "../services/notifications";
import { DEFAULT_SETTINGS, getSettings, saveSettings, type AppSettings } from "../services/policies";
import { stripeEnabled } from "../stripe/client";
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
  kpis: adminProcedure.query(async () => { await reconcilePendingRefunds(); return getOpsKpis(); }),
  analytics: adminProcedure.input(z.object({ period: z.enum(["all", "today", "week", "month", "custom"]),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).optional())
    .query(async ({ input }) => {
      try { return await getAnalytics(analyticsDateRange(input ?? { period: "all" })); }
      catch (error) { if (error instanceof RangeError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message }); throw error; }
    }),
  bookings: adminProcedure.input(z.object({
    query: z.string().trim().max(80).optional(),
    status: z.enum(["pending_payment", "confirmed", "canceled", "refunded"]).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
      const parsed = Date.parse(`${value}T00:00:00Z`);
      return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
    }).optional(),
  })).query(({ input }) => searchAdminBookings(input)),
  booking: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    await reconcilePendingRefunds();
    const item = await adminBookingDetail(input.id);
    if (!item) throw new TRPCError({ code: "NOT_FOUND" });
    return item;
  }),
  rescheduleBooking: adminProcedure.input(z.object({
    bookingId: z.number().int().positive(), newOutboundDepartureId: z.number().int().positive(),
    newReturnDepartureId: z.number().int().positive().nullable(),
    outboundSeats: z.array(z.string().min(1).max(10)).min(1).max(11),
    returnSeats: z.array(z.string().min(1).max(10)).max(11).nullable(),
  })).mutation(async ({ ctx, input }) => {
    const result = await rescheduleWithNumberedSeats(input, ctx.user.id, true);
    try { await writeAudit(ctx.user.id, "booking.reschedule", "booking", input.bookingId, {
      newOutboundDepartureId: input.newOutboundDepartureId, newReturnDepartureId: input.newReturnDepartureId,
    }); } catch (error) { console.warn("[admin.reschedule] Audit write failed after committed reschedule", error instanceof Error ? error.name : "unknown"); }
    return result;
  }),
  payments: adminProcedure.query(async () => { await reconcilePendingRefunds(); return adminPayments(); }),
  recentBookings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select({ id: bookings.id, bookingNumber: bookings.bookingNumber, status: bookings.status,
      contactFirstName: bookings.contactFirstName, contactLastName: bookings.contactLastName,
      createdAt: bookings.createdAt }).from(bookings).orderBy(desc(bookings.createdAt)).limit(5);
  }),
  support: router({
    list: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: supportTickets.id, userId: supportTickets.userId, subject: supportTickets.subject,
        message: supportTickets.message, status: supportTickets.status, createdAt: supportTickets.createdAt,
        customerName: users.name, customerEmail: users.email,
      }).from(supportTickets).innerJoin(users, eq(users.id, supportTickets.userId))
        .orderBy(desc(supportTickets.createdAt));
    }),
    get: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [ticket] = await db.select({
        id: supportTickets.id, userId: supportTickets.userId, subject: supportTickets.subject,
        message: supportTickets.message, status: supportTickets.status, createdAt: supportTickets.createdAt,
        customerName: users.name, customerEmail: users.email, customerPhone: users.phone,
      }).from(supportTickets).innerJoin(users, eq(users.id, supportTickets.userId))
        .where(eq(supportTickets.id, input.id)).limit(1);
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Support ticket not found." });
      return ticket;
    }),
    updateStatus: adminProcedure.input(z.object({
      id: z.number().int().positive(), status: z.enum(["open", "closed"]),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [ticket] = await db.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.id, input.id)).limit(1);
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Support ticket not found." });
      await db.update(supportTickets).set({ status: input.status }).where(eq(supportTickets.id, input.id));
      await writeAudit(ctx.user.id, `support.${input.status}`, "supportTicket", input.id);
      return { ok: true } as const;
    }),
  }),
  supportTickets: adminProcedure.query(() => adminSupportTickets()),
  resolveSupport: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(supportTickets).set({ status: "closed" }).where(eq(supportTickets.id, input.id));
    await writeAudit(ctx.user.id, "support.close", "supportTicket", input.id);
    return { ok: true };
  }),
  upcomingDepartures: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const upcoming = await db.select().from(departures)
      .where(and(gte(departures.departAt, new Date()), inArray(departures.status, ["scheduled", "boarding", "delayed"])))
      .orderBy(asc(departures.departAt)).limit(8);
    return Promise.all(upcoming.map(tripDetail));
  }),
  schedule: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const next = await db.select().from(departures).where(gte(departures.departAt, new Date(Date.now() - 86_400_000)))
      .orderBy(asc(departures.departAt)).limit(60);
    const [allRoutes, allCities, allVehicles, allDrivers] = await Promise.all([
      db.select().from(routes), db.select().from(cities), db.select().from(vehicles), db.select().from(driverProfiles),
    ]);
    const routeById = new Map(allRoutes.map(row => [row.id, row]));
    const cityById = new Map(allCities.map(row => [row.id, row.name]));
    const vehicleById = new Map(allVehicles.map(row => [row.id, row.code]));
    const driverById = new Map(allDrivers.map(row => [row.id, row.fullName]));
    return next.map(dep => {
      const route = routeById.get(dep.routeId);
      return { departure: dep,
        routeLabel: route ? `${cityById.get(route.originCityId) ?? "Unknown"} → ${cityById.get(route.destinationCityId) ?? "Unknown"}` : "Route unavailable",
        vehicleCode: dep.vehicleId ? vehicleById.get(dep.vehicleId) ?? null : null,
        driverName: dep.driverId ? driverById.get(dep.driverId) ?? null : null,
        editable: dep.departAt > new Date() && dep.status === "scheduled" && dep.seatsSold === 0 && dep.seatsHeld === 0,
      };
    });
  }),
  updateDeparture: adminProcedure.input(z.object({ id: z.number().int().positive(), routeId: z.number().int().positive(),
    vehicleId: z.number().int().positive(), driverId: z.number().int().positive(), departAt: z.string(), arriveAt: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const start = new Date(input.departAt);
      const end = new Date(input.arriveAt);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start <= new Date() || end <= start) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a future departure and valid arrival time." });
      }
      const [route] = await db.select({ active: routes.isActive }).from(routes).where(eq(routes.id, input.routeId)).limit(1);
      if (!route?.active) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active route." });
      const vehicle = await assertVehicleAssignable(input.vehicleId, start, end, input.id);
      try { await assertDriverAssignable(input.driverId, start, end, input.id); }
      catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Driver unavailable" }); }
      await db.transaction(async tx => {
        const [assignedVehicle] = await tx.select({ capacity: vehicles.capacity }).from(vehicles)
          .where(eq(vehicles.id, vehicle.id)).limit(1).for("update");
        const [dep] = await tx.select().from(departures).where(eq(departures.id, input.id)).limit(1).for("update");
        if (!dep) throw new TRPCError({ code: "NOT_FOUND" });
        if (dep.status !== "scheduled" || dep.departAt <= new Date() || dep.seatsSold || dep.seatsHeld) {
          throw new TRPCError({ code: "CONFLICT", message: "Only future, empty scheduled departures can be edited. Handle occupied trips through customer support." });
        }
        if (!assignedVehicle || assignedVehicle.capacity !== vehicle.capacity) {
          throw new TRPCError({ code: "CONFLICT", message: "Vehicle changed; reload the schedule." });
        }
        await tx.update(departures).set({ routeId: input.routeId, vehicleId: input.vehicleId, driverId: input.driverId,
          departAt: start, arriveAt: end, capacity: vehicle.capacity }).where(eq(departures.id, input.id));
      });
      await writeAudit(ctx.user.id, "departure.edit", "departure", input.id);
      return { ok: true };
    }),
  cancelDeparture: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.transaction(async tx => {
      const [dep] = await tx.select().from(departures).where(eq(departures.id, input.id)).limit(1).for("update");
      if (!dep) throw new TRPCError({ code: "NOT_FOUND" });
      if (dep.status !== "scheduled" || dep.seatsSold || dep.seatsHeld) {
        throw new TRPCError({ code: "CONFLICT", message: "This trip has passengers or is in progress; resolve bookings and refunds before canceling it." });
      }
      await tx.update(departures).set({ status: "canceled" }).where(eq(departures.id, input.id));
    });
    await writeAudit(ctx.user.id, "departure.cancel", "departure", input.id);
    return { ok: true };
  }),
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
        code: z.string().trim().min(2).max(16),
        vin: z.string().trim().max(32).optional(),
        make: z.string().trim().min(1).max(64),
        model: z.string().trim().min(1).max(64),
        year: z.number().int().min(1990).max(new Date().getFullYear() + 2),
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
        const prev = await db.transaction(async tx => {
          const [existing] = await tx.select().from(vehicles).where(eq(vehicles.id, input.id!)).limit(1).for("update");
          if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
          if (existing.capacity !== input.capacity) {
            const assigned = await tx.select().from(departures).where(eq(departures.vehicleId, existing.id))
              .orderBy(departures.id).for("update");
            let retune: number[];
            try { retune = planVehicleCapacityRetune(assigned, input.capacity, new Date()); }
            catch (error) { throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "A booked or active trip cannot lose its seats." }); }
            for (const departureId of retune) await tx.update(departures).set({ capacity: input.capacity }).where(eq(departures.id, departureId));
          }
          await tx.update(vehicles).set({
            code: input.code, vin: input.vin ?? null, make: input.make, model: input.model,
            year: input.year, capacity: input.capacity, currentMileage: input.currentMileage,
            status: input.status, assignedDriverId: input.assignedDriverId === undefined ? existing.assignedDriverId : input.assignedDriverId,
            notes: input.notes === undefined ? existing.notes : input.notes,
            registrationExpiresAt: input.registrationExpiresAt === undefined ? existing.registrationExpiresAt : input.registrationExpiresAt ? new Date(input.registrationExpiresAt) : null,
            insuranceExpiresAt: input.insuranceExpiresAt === undefined ? existing.insuranceExpiresAt : input.insuranceExpiresAt ? new Date(input.insuranceExpiresAt) : null,
            inspectionExpiresAt: input.inspectionExpiresAt === undefined ? existing.inspectionExpiresAt : input.inspectionExpiresAt ? new Date(input.inspectionExpiresAt) : null,
          }).where(eq(vehicles.id, input.id!));
          return existing;
        });
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
        vehicleId: z.number().int().positive(),
        type: z.string().trim().min(2).max(80),
        notes: z.string().trim().min(3).max(5000),
        mileage: z.number().int().min(0).optional(),
        performedAt: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(maintenanceLogs).values({
        vehicleId: input.vehicleId,
        type: input.type,
        notes: input.notes,
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
  routeStops: adminProcedure
    .input(z.object({ routeId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(routeStops).where(eq(routeStops.routeId, input.routeId));
      const allLocations = await db.select().from(locations);
      const locationMap = new Map(allLocations.map(location => [location.id, location]));
      return rows.sort((a, b) => a.stopOrder - b.stopOrder).map(stop => ({ ...stop, location: locationMap.get(stop.locationId) ?? null }));
    }),
  saveRouteStop: adminProcedure
    .input(z.object({
      id: z.number().int().positive().optional(), routeId: z.number().int().positive(),
      locationId: z.number().int().positive(), stopOrder: z.number().int().min(1).max(20),
      pickupAllowed: z.boolean(), dropoffAllowed: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [route] = await db.select({ id: routes.id }).from(routes).where(eq(routes.id, input.routeId)).limit(1);
      const [location] = await db.select({ id: locations.id }).from(locations).where(eq(locations.id, input.locationId)).limit(1);
      if (!route || !location) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an existing route and location." });
      const values = { routeId: input.routeId, locationId: input.locationId, stopOrder: input.stopOrder, pickupAllowed: input.pickupAllowed, dropoffAllowed: input.dropoffAllowed };
      try {
        if (input.id) await db.update(routeStops).set(values).where(eq(routeStops.id, input.id));
        else await db.insert(routeStops).values(values);
      } catch (error) {
        if (String(error).toLowerCase().includes("duplicate")) throw new TRPCError({ code: "CONFLICT", message: "That stop order is already used on this route." });
        throw error;
      }
      await writeAudit(ctx.user.id, input.id ? "route.stop.update" : "route.stop.create", "routeStop", input.id ?? input.routeId, values);
      return { ok: true };
    }),
  deleteRouteStop: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(routeStops).where(eq(routeStops.id, input.id));
      await writeAudit(ctx.user.id, "route.stop.delete", "routeStop", input.id);
      return { ok: true };
    }),
  saveRoute: adminProcedure
    .input(
      z.object({
        id: z.number().optional(),
        originCityId: z.number().int().positive(),
        destinationCityId: z.number().int().positive(),
        pickupLocationId: z.number().int().positive(),
        dropoffLocationId: z.number().int().positive(),
        estimatedMinutes: z.number().int().min(1).max(2880),
        standardFareCents: z.number().int().min(0),
        memberFareCents: z.number().int().min(0),
        frontFareCents: z.number().int().min(0),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.originCityId === input.destinationCityId) throw new TRPCError({ code: "BAD_REQUEST", message: "Origin and destination must be different." });
      const [origin, destination, pickup, dropoff] = await Promise.all([
        db.select({ id: cities.id }).from(cities).where(eq(cities.id, input.originCityId)).limit(1).then(rows => rows[0]),
        db.select({ id: cities.id }).from(cities).where(eq(cities.id, input.destinationCityId)).limit(1).then(rows => rows[0]),
        db.select({ cityId: locations.cityId }).from(locations).where(eq(locations.id, input.pickupLocationId)).limit(1).then(rows => rows[0]),
        db.select({ cityId: locations.cityId }).from(locations).where(eq(locations.id, input.dropoffLocationId)).limit(1).then(rows => rows[0]),
      ]);
      if (!origin || !destination || pickup?.cityId !== origin.id || dropoff?.cityId !== destination.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pickup and drop-off must belong to the selected origin and destination cities." });
      }
      const { id, ...rest } = input;
      if (id) {
        await db.transaction(async tx => {
          const [existing] = await tx.select().from(routes).where(eq(routes.id, id)).limit(1).for("update");
          if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Route not found" });
          if (changesBookedItinerary(existing, rest)) {
            const [used] = await tx.select({ id: departures.id }).from(departures).where(eq(departures.routeId, id)).limit(1);
            if (used) throw new TRPCError({ code: "CONFLICT", message: "This route already has departures. Create a new route for different cities, stops, or journey times; existing tickets must keep their itinerary." });
          }
          await tx.update(routes).set(rest).where(eq(routes.id, id));
        });
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
      if (!Number.isFinite(departAt.getTime()) || !Number.isFinite(arriveAt.getTime()) || departAt <= new Date() || arriveAt <= departAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a future departure and an arrival after departure." });
      }
      const [route] = await db.select({ active: routes.isActive }).from(routes).where(eq(routes.id, input.routeId)).limit(1);
      if (!route?.active) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active route." });
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
      const vehicle = await assertVehicleAssignable(input.vehicleId, dep.departAt, dep.arriveAt, dep.id);
      try { await assertDriverAssignable(input.driverId, dep.departAt, dep.arriveAt, dep.id); }
      catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Driver unavailable" }); }
      await db.transaction(async tx => {
        const [assignedVehicle] = await tx.select({ capacity: vehicles.capacity, status: vehicles.status }).from(vehicles)
          .where(eq(vehicles.id, input.vehicleId)).limit(1).for("update");
        if (!assignedVehicle || assignedVehicle.capacity !== vehicle.capacity || ["maintenance", "out_of_service"].includes(assignedVehicle.status)) {
          throw new TRPCError({ code: "CONFLICT", message: "Vehicle capacity changed; reload dispatch and try again." });
        }
        const [assignedDriver] = await tx.select({ status: driverProfiles.status }).from(driverProfiles)
          .where(eq(driverProfiles.id, input.driverId)).limit(1).for("update");
        if (assignedDriver?.status !== "active") throw new TRPCError({ code: "CONFLICT", message: "This driver is not active." });
        const [current] = await tx.select().from(departures).where(eq(departures.id, dep.id)).limit(1).for("update");
        if (!current) throw new TRPCError({ code: "NOT_FOUND" });
        if (current.departAt <= new Date() || !["scheduled", "boarding", "delayed"].includes(current.status)) {
          throw new TRPCError({ code: "CONFLICT", message: "Only future scheduled or delayed trips can be reassigned." });
        }
        const assignments = await tx.select({ id: departures.id, vehicleId: departures.vehicleId,
          driverId: departures.driverId, departAt: departures.departAt, arriveAt: departures.arriveAt })
          .from(departures).where(and(or(eq(departures.vehicleId, input.vehicleId), eq(departures.driverId, input.driverId)),
            inArray(departures.status, ["scheduled", "boarding", "delayed"]))).for("update");
        if (assignments.some(trip => trip.id !== current.id && trip.departAt < current.arriveAt && trip.arriveAt > current.departAt)) {
          throw new TRPCError({ code: "CONFLICT", message: "This vehicle or driver is already assigned to an overlapping departure." });
        }
        if (current.capacity !== vehicle.capacity && (current.seatsSold > 0 || current.seatsHeld > 0 || current.status !== "scheduled")) {
          throw new TRPCError({ code: "CONFLICT", message: "An occupied or active departure cannot be assigned to a vehicle with a different number of seats." });
        }
        await tx.update(departures).set({ vehicleId: input.vehicleId, driverId: input.driverId, capacity: vehicle.capacity })
          .where(eq(departures.id, dep.id));
      });
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
    .input(z.object({ bookingId: z.number().int().positive(), reason: z.string().trim().min(3).max(255) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
      if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
      if (booking.status !== "confirmed") throw new TRPCError({ code: "BAD_REQUEST", message: "Only confirmed bookings can be refunded." });
      if (!booking.stripePaymentIntentId || !stripeEnabled()) throw new TRPCError({ code: "BAD_REQUEST", message: "No Stripe payment is available for an automatic refund. Contact support for manual review." });
      const [pay] = await db.select().from(payments).where(eq(payments.bookingId, booking.id)).limit(1);
      if (!pay || pay.status !== "succeeded") throw new TRPCError({ code: "BAD_REQUEST", message: "No successful ticket payment is available for a refund." });
      const intent = await beginBookingRefund({ bookingId: booking.id, paymentId: pay.id,
        paymentIntentId: booking.stripePaymentIntentId, reason: input.reason, adminUserId: ctx.user.id });
      let refundStatus: "pending" | "succeeded" | "failed";
      try { refundStatus = await submitRefundIntent(intent.intentId); }
      catch (error) {
        console.warn("[admin.refund] Durable refund intent will be reconciled", error instanceof Error ? error.name : "unknown");
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Trip canceled. Refund request saved for automatic retry; review its status in Payments." });
      }
      if (booking.userId !== null) await notify({
        userId: booking.userId,
        templateKey: TEMPLATES.refund,
        title: refundStatus === "failed" ? "Refund needs staff review" : "Refund requested",
        body: `The refund request for booking ${booking.bookingNumber} is ${refundStatus === "succeeded" ? "confirmed" : refundStatus === "failed" ? "unsuccessful; please contact support" : "processing"}.`,
      });
      try { await writeAudit(ctx.user.id, "booking.refund", "booking", booking.id, { reason: input.reason, refundStatus }); }
      catch (error) { console.warn("[admin.refund] Secondary audit could not be stored", error instanceof Error ? error.name : "unknown"); }
      return { ok: true, refundStatus };
    }),
  runReminders: adminProcedure.mutation(async () => {
    const { runReminders } = await import("../services/reminders");
    return runReminders();
  }),
});
