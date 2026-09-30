import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  bookings,
  cities,
  departures,
  locations,
  memberships,
  notifications,
  passengers,
  payments,
  refunds,
  routes,
  savedPassengers,
  supportTickets,
  tickets,
  users,
} from "../../drizzle/schema";
import { getActiveMembership, getDb, writeAudit } from "../db";
import { getDeparture, restoreSoldSeats } from "../services/inventory";
import { TEMPLATES, notify } from "../services/notifications";
import { canSelfServeChange, getSettings } from "../services/policies";
import { getStripe, stripeEnabled } from "../stripe/client";
import { membershipPriceData } from "../stripe/products";
import { protectedProcedure, router } from "../_core/trpc";

async function hydrateBooking(booking: typeof bookings.$inferSelect) {
  const db = await getDb();
  if (!db) return { booking, passengers: [], tickets: [], outbound: null, returnTrip: null };
  const pax = await db.select().from(passengers).where(eq(passengers.bookingId, booking.id));
  const tix = await db.select().from(tickets).where(eq(tickets.bookingId, booking.id));
  const outbound = await tripCard(booking.outboundDepartureId);
  const returnTrip = booking.returnDepartureId
    ? await tripCard(booking.returnDepartureId)
    : null;
  return { booking, passengers: pax, tickets: tix, outbound, returnTrip };
}

async function tripCard(departureId: number) {
  const db = await getDb();
  if (!db) return null;
  const [dep] = await db.select().from(departures).where(eq(departures.id, departureId)).limit(1);
  if (!dep) return null;
  const [route] = await db.select().from(routes).where(eq(routes.id, dep.routeId)).limit(1);
  if (!route) return null;
  const [origin] = await db.select().from(cities).where(eq(cities.id, route.originCityId)).limit(1);
  const [destination] = await db
    .select()
    .from(cities)
    .where(eq(cities.id, route.destinationCityId))
    .limit(1);
  const [pickup] = await db.select().from(locations).where(eq(locations.id, route.pickupLocationId)).limit(1);
  const [dropoff] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, route.dropoffLocationId))
    .limit(1);
  return { ...dep, origin, destination, pickup, dropoff, route };
}

export const accountRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { upcoming: [], previous: [], membership: null, unread: 0 };
    const all = await db
      .select()
      .from(bookings)
      .where(eq(bookings.userId, ctx.user.id))
      .orderBy(desc(bookings.createdAt));
    const now = new Date();
    const hydrated = await Promise.all(all.map(hydrateBooking));
    const upcoming = hydrated.filter(
      h =>
        h.booking.status === "confirmed" &&
        h.outbound &&
        h.outbound.departAt >= now
    );
    const previous = hydrated.filter(
      h =>
        h.booking.status !== "pending_payment" &&
        (!h.outbound || h.outbound.departAt < now || h.booking.status !== "confirmed")
    );
    const membership = await getActiveMembership(ctx.user.id);
    const unreadRows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, ctx.user.id), eq(notifications.channel, "in_app")));
    const unread = unreadRows.filter(n => !n.readAt).length;
    return { upcoming, previous, membership, unread };
  }),
  tickets: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const mine = await db.select().from(bookings).where(eq(bookings.userId, ctx.user.id));
    const result = [];
    for (const b of mine) {
      if (b.status !== "confirmed") continue;
      result.push(await hydrateBooking(b));
    }
    return result;
  }),
  ticketByToken: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [ticket] = await db.select().from(tickets).where(eq(tickets.qrToken, input.token)).limit(1);
      if (!ticket) return null;
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, ticket.bookingId)).limit(1);
      if (!booking) return null;
      if (booking.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [passenger] = await db
        .select()
        .from(passengers)
        .where(eq(passengers.id, ticket.passengerId))
        .limit(1);
      const trip = await tripCard(ticket.departureId);
      return {
        ticket,
        booking: {
          id: booking.id,
          bookingNumber: booking.bookingNumber,
          passengerCount: booking.passengerCount,
          status: booking.status,
          fareType: booking.fareType,
        },
        passenger,
        trip,
      };
    }),
  receipts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(payments)
      .where(eq(payments.userId, ctx.user.id))
      .orderBy(desc(payments.createdAt));
  }),
  notifications: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, ctx.user.id), eq(notifications.channel, "in_app")))
      .orderBy(desc(notifications.sentAt));
  }),
  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: true };
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)));
      return { ok: true };
    }),
  savedPassengers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(savedPassengers).where(eq(savedPassengers.userId, ctx.user.id));
  }),
  savePassenger: protectedProcedure
    .input(z.object({ firstName: z.string().min(1), lastName: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(savedPassengers).values({
        userId: ctx.user.id,
        firstName: input.firstName,
        lastName: input.lastName,
      });
      return { ok: true };
    }),
  deleteSavedPassenger: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: true };
      await db
        .delete(savedPassengers)
        .where(and(eq(savedPassengers.id, input.id), eq(savedPassengers.userId, ctx.user.id)));
      return { ok: true };
    }),
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(users)
        .set({
          name: input.name ?? ctx.user.name,
          phone: input.phone ?? ctx.user.phone,
          email: input.email ?? ctx.user.email,
        })
        .where(eq(users.id, ctx.user.id));
      return { ok: true };
    }),
  support: protectedProcedure
    .input(z.object({ subject: z.string().min(3), message: z.string().min(5) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(supportTickets).values({
        userId: ctx.user.id,
        subject: input.subject,
        message: input.message,
      });
      return { ok: true };
    }),
  cancelBooking: protectedProcedure
    .input(z.object({ bookingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
      if (!booking || booking.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (booking.status !== "confirmed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Booking cannot be canceled" });
      }
      const dep = await getDeparture(booking.outboundDepartureId);
      const settings = await getSettings();
      if (!dep || !canSelfServeChange(dep.departAt, settings.cancelCutoffHours)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This trip is past the free cancellation window. Contact support.",
        });
      }
      if (booking.stripePaymentIntentId && stripeEnabled()) {
        const stripe = getStripe();
        const refund = await stripe.refunds.create({
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
            reason: "customer_cancel",
            stripeRefundId: refund.id,
          });
          await db.update(payments).set({ status: "refunded" }).where(eq(payments.id, pay.id));
        }
      }
      await restoreSoldSeats(booking.outboundDepartureId, booking.passengerCount);
      if (booking.returnDepartureId) {
        await restoreSoldSeats(booking.returnDepartureId, booking.passengerCount);
      }
      await db
        .update(bookings)
        .set({ status: booking.stripePaymentIntentId ? "refunded" : "canceled" })
        .where(eq(bookings.id, booking.id));
      await db.update(tickets).set({ status: "voided" }).where(eq(tickets.bookingId, booking.id));
      await notify({
        userId: ctx.user.id,
        templateKey: TEMPLATES.trip_cancellation,
        title: "Trip canceled",
        body: `Booking ${booking.bookingNumber} was canceled.`,
      });
      if (booking.stripePaymentIntentId) {
        await notify({
          userId: ctx.user.id,
          templateKey: TEMPLATES.refund,
          title: "Refund issued",
          body: `A refund for booking ${booking.bookingNumber} is processing.`,
        });
      }
      return { ok: true };
    }),
  reschedule: protectedProcedure
    .input(
      z.object({
        bookingId: z.number(),
        newOutboundDepartureId: z.number(),
        newReturnDepartureId: z.number().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
      if (!booking || booking.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      const dep = await getDeparture(booking.outboundDepartureId);
      const settings = await getSettings();
      if (!dep || !canSelfServeChange(dep.departAt, settings.cancelCutoffHours)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This trip is not eligible for self-serve reschedule.",
        });
      }
      const membership = await getActiveMembership(ctx.user.id);
      const useFree = Boolean(membership && membership.freeReschedulesRemaining > 0);
      const { holdSeats, convertHoldsToSold } = await import("../services/inventory");
      const { assertBookable } = await import("../services/inventory");
      await assertBookable(input.newOutboundDepartureId, booking.passengerCount, Boolean(membership));
      if (input.newReturnDepartureId) {
        await assertBookable(input.newReturnDepartureId, booking.passengerCount, Boolean(membership));
      }
      let heldOut = false;
      let heldRet = false;
      try {
        await holdSeats(input.newOutboundDepartureId, booking.passengerCount);
        heldOut = true;
        await convertHoldsToSold(input.newOutboundDepartureId, booking.passengerCount);
        if (input.newReturnDepartureId) {
          await holdSeats(input.newReturnDepartureId, booking.passengerCount);
          heldRet = true;
          await convertHoldsToSold(input.newReturnDepartureId, booking.passengerCount);
        }
      } catch (error) {
        if (heldOut) {
          await restoreSoldSeats(input.newOutboundDepartureId, booking.passengerCount);
        }
        if (heldRet && input.newReturnDepartureId) {
          await restoreSoldSeats(input.newReturnDepartureId, booking.passengerCount);
        }
        throw new TRPCError({
          code: "CONFLICT",
          message: error instanceof Error ? error.message : "SOLD OUT",
        });
      }
      await restoreSoldSeats(booking.outboundDepartureId, booking.passengerCount);
      if (booking.returnDepartureId) {
        await restoreSoldSeats(booking.returnDepartureId, booking.passengerCount);
      }
      await db
        .update(bookings)
        .set({
          outboundDepartureId: input.newOutboundDepartureId,
          returnDepartureId: input.newReturnDepartureId,
          usedFreeReschedule: useFree || booking.usedFreeReschedule,
        })
        .where(eq(bookings.id, booking.id));
      await db.delete(tickets).where(eq(tickets.bookingId, booking.id));
      const pax = await db.select().from(passengers).where(eq(passengers.bookingId, booking.id));
      const { makeQrToken } = await import("../services/tickets");
      const legs = [input.newOutboundDepartureId, input.newReturnDepartureId].filter(
        (id): id is number => Boolean(id)
      );
      for (const passenger of pax) {
        for (const departureId of legs) {
          await db.insert(tickets).values({
            passengerId: passenger.id,
            bookingId: booking.id,
            departureId,
            qrToken: makeQrToken(),
            status: "booked",
          });
        }
        await db.update(passengers).set({ status: "booked" }).where(eq(passengers.id, passenger.id));
      }
      if (useFree && membership) {
        await db
          .update(memberships)
          .set({ freeReschedulesRemaining: Math.max(0, membership.freeReschedulesRemaining - 1) })
          .where(eq(memberships.id, membership.id));
      }
      await notify({
        userId: ctx.user.id,
        templateKey: TEMPLATES.booking_reschedule,
        title: "Trip rescheduled",
        body: `Booking ${booking.bookingNumber} was moved to a new departure.`,
      });
      return { ok: true };
    }),
  startMembershipCheckout: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      if (!stripeEnabled()) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payments are not configured" });
      }
      const settings = await getSettings();
      const stripe = getStripe();
      const origin = input.origin.replace(/\/$/, "");
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: ctx.user.email ?? undefined,
        allow_promotion_codes: true,
        success_url: `${origin}/account/membership?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/membership`,
        line_items: [
          {
            quantity: 1,
            price_data: membershipPriceData(settings.membershipPriceCents),
          },
        ],
        subscription_data: {
          metadata: {
            user_id: String(ctx.user.id),
            customer_email: ctx.user.email ?? "",
            customer_name: ctx.user.name ?? "",
          },
        },
        metadata: {
          user_id: String(ctx.user.id),
          customer_email: ctx.user.email ?? "",
          customer_name: ctx.user.name ?? "",
          kind: "membership",
        },
      });
      return { checkoutUrl: session.url };
    }),
  billingPortal: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.stripeCustomerId || !stripeEnabled()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No payment methods on file yet.",
        });
      }
      const session = await getStripe().billingPortal.sessions.create({
        customer: ctx.user.stripeCustomerId,
        return_url: `${input.origin.replace(/\/$/, "")}/account/payments`,
      });
      return { url: session.url };
    }),
});
