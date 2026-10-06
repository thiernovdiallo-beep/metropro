import { TRPCError } from "@trpc/server";
import { FIRST_PARTY_HEADER } from "@shared/const";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  bookings,
  cities,
  departures,
  locations,
  memberships,
  memberCredentials,
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
import { hasGuestAccess } from "../services/guest-access";
import { approvedCheckoutOrigin } from "../services/checkout-origin";
import { getDeparture, inventoryTransaction, lockDepartureInventory } from "../services/inventory";
import { rescheduleWithNumberedSeats } from "../services/rescheduling";
import { beginBookingRefund, reconcilePendingRefunds, submitRefundIntent } from "../services/refund-lifecycle";
import { getMemberProfileStatus, saveMemberIdPhoto } from "../services/member-profile";
import { normalizeMemberEmail } from "../services/member-auth";
import { TEMPLATES, notify } from "../services/notifications";
import { canSelfServeChange, getSettings } from "../services/policies";
import { seatNumberForTicket } from "../services/ticket-seat";
import { getStripe, stripeEnabled } from "../stripe/client";
import { membershipPriceData } from "../stripe/products";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

async function hydrateBooking(booking: typeof bookings.$inferSelect) {
  const db = await getDb();
  if (!db) return { booking, passengers: [], tickets: [], outbound: null, returnTrip: null };
  const pax = await db.select().from(passengers).where(eq(passengers.bookingId, booking.id));
  const tix = await db.select().from(tickets).where(and(eq(tickets.bookingId, booking.id), ne(tickets.status, "voided")));
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
  booking: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await reconcilePendingRefunds();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [booking] = await db.select().from(bookings)
        .where(and(eq(bookings.id, input.id), eq(bookings.userId, ctx.user.id))).limit(1);
      if (!booking) throw new TRPCError({ code: "NOT_FOUND" });
      const detail = await hydrateBooking(booking);
      const settings = await getSettings();
      const canCancel = booking.status === "confirmed" && Boolean(detail.outbound && canSelfServeChange(detail.outbound.departAt, settings.cancelCutoffHours));
      const [refund] = await db.select({ status: refunds.status, failureReason: refunds.failureReason, amountCents: refunds.amountCents })
        .from(refunds).where(eq(refunds.bookingId, booking.id)).orderBy(desc(refunds.createdAt)).limit(1);
      return { ...detail, canCancel, refund: refund ?? null };
    }),
  overview: protectedProcedure.query(async ({ ctx }) => {
    await reconcilePendingRefunds();
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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
    const memberProfile = await getMemberProfileStatus(ctx.user.id);
    const unreadRows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, ctx.user.id), eq(notifications.channel, "in_app")));
    const unread = unreadRows.filter(n => !n.readAt).length;
    return { upcoming, previous, membership, memberFareEligible: Boolean(membership && memberProfile.complete), unread };
  }),
  memberProfile: protectedProcedure.query(async ({ ctx }) => getMemberProfileStatus(ctx.user.id)),
  uploadMemberId: protectedProcedure
    .input(z.object({ base64: z.string().min(1).max(2_800_000) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await saveMemberIdPhoto(ctx.user.id, input.base64);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "ID upload failed" });
      }
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
  ticketByToken: publicProcedure
    .input(z.object({ token: z.string().min(1).max(48), accessToken: z.string().max(128).optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [ticket] = await db.select().from(tickets).where(eq(tickets.qrToken, input.token)).limit(1);
      if (!ticket) return null;
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, ticket.bookingId)).limit(1);
      if (!booking) return null;
      const owner = Boolean(ctx.user && (booking.userId === ctx.user.id || ctx.user.role === "admin"));
      if (!owner && !hasGuestAccess(booking, input.accessToken)) {
        throw new TRPCError({ code: "NOT_FOUND" });
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
          amountCents: booking.amountCents,
          status: booking.status,
          fareType: booking.fareType,
        },
        passenger,
        seatNumber: seatNumberForTicket(ticket, passenger),
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
  membershipInvoices: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !stripeEnabled()) return [];
    const subscriptions = await db.select({ stripeId: memberships.stripeSubscriptionId })
      .from(memberships).where(eq(memberships.userId, ctx.user.id));
    const pages = await Promise.all(subscriptions.filter((row): row is { stripeId: string } => Boolean(row.stripeId)).map(async ({ stripeId }) =>
      getStripe().invoices.list({ subscription: stripeId, limit: 100 })
    ));
    return pages.flatMap(page => page.data)
      .filter(invoice => invoice.status === "paid" && invoice.amount_paid > 0)
      .map(invoice => ({
        id: invoice.id,
        amountCents: invoice.amount_paid,
        currency: invoice.currency,
        paidAt: new Date(invoice.status_transitions.paid_at
          ? invoice.status_transitions.paid_at * 1000 : invoice.created * 1000),
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? null,
      }))
      .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
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
        name: z.string().trim().min(3).max(160).refine(value => value.split(/\s+/).length >= 2, "Enter your first and last name"),
        phone: z.string().trim().min(7).max(32).refine(value => value.replace(/\D/g, "").length >= 7, "Enter a valid phone number"),
        email: z.string().trim().email().max(320),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const email = normalizeMemberEmail(input.email);
      const [collision] = await db.select({ id: users.id }).from(users)
        .where(and(sql`LOWER(${users.email}) = ${email}`, ne(users.id, ctx.user.id))).limit(1);
      if (collision) throw new TRPCError({ code: "CONFLICT", message: "This email is already used by another account." });
      const [credential] = await db.select({ id: memberCredentials.id }).from(memberCredentials)
        .where(eq(memberCredentials.userId, ctx.user.id)).limit(1);
      try {
        await db.transaction(async tx => {
          if (credential) await tx.update(memberCredentials).set({ emailNormalized: email })
            .where(eq(memberCredentials.id, credential.id));
          await tx.update(users).set({ name: input.name, phone: input.phone, email })
            .where(eq(users.id, ctx.user.id));
        });
      } catch (error) {
        if (error instanceof Error && /duplicate|unique|1062/i.test(error.message)) {
          throw new TRPCError({ code: "CONFLICT", message: "This email is already used by another account." });
        }
        throw error;
      }
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
      const [pay] = booking.stripePaymentIntentId ? await db.select().from(payments)
        .where(eq(payments.bookingId, booking.id)).limit(1) : [null];
      if (booking.stripePaymentIntentId && (!stripeEnabled() || !pay || pay.status !== "succeeded")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This payment needs a support review before it can be refunded." });
      }
      let refundStatus: "pending" | "succeeded" | "failed" | null = null;
      if (booking.stripePaymentIntentId && pay) {
        const intent = await beginBookingRefund({ bookingId: booking.id, paymentId: pay.id,
          paymentIntentId: booking.stripePaymentIntentId, reason: "customer_cancel" });
        try { refundStatus = await submitRefundIntent(intent.intentId); }
        catch (error) {
          console.warn("[cancel] Durable refund intent will be reconciled", error instanceof Error ? error.name : "unknown");
          throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Trip canceled. Your refund request is saved for automatic retry; please check your booking or contact support." });
        }
      } else {
        await inventoryTransaction(db, async tx => {
          const [current] = await tx.select().from(bookings).where(eq(bookings.id, booking.id)).limit(1).for("update");
          if (current?.status !== "confirmed") throw new TRPCError({ code: "BAD_REQUEST", message: "Booking is already canceled or refunded." });
          await lockDepartureInventory(tx, [current.outboundDepartureId, current.returnDepartureId]);
          const restore = (id: number, front: number) => tx.execute(sql`
            UPDATE departures SET seatsSold = GREATEST(seatsSold - ${current.passengerCount}, 0),
              frontSeatsSold = GREATEST(frontSeatsSold - ${front}, 0) WHERE id = ${id}`);
          await restore(current.outboundDepartureId, current.outboundFrontSeats);
          if (current.returnDepartureId) await restore(current.returnDepartureId, current.returnFrontSeats);
          await tx.update(passengers).set({ departureId: null, seatNumber: null, returnDepartureId: null, returnSeatNumber: null })
            .where(eq(passengers.bookingId, current.id));
          await tx.update(tickets).set({ status: "voided" }).where(eq(tickets.bookingId, current.id));
          await tx.update(bookings).set({ status: "canceled" }).where(eq(bookings.id, current.id));
        });
      }
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
          title: refundStatus === "failed" ? "Refund needs staff review" : "Refund requested",
          body: refundStatus === "failed" ? `The refund for booking ${booking.bookingNumber} failed. Please contact support.`
            : `Your refund request for booking ${booking.bookingNumber} is ${refundStatus === "succeeded" ? "confirmed by Stripe" : "processing"}.`,
        });
      }
      return { ok: true };
    }),
  reschedule: protectedProcedure
    .input(z.object({
      bookingId: z.number().int().positive(),
      newOutboundDepartureId: z.number().int().positive(),
      newReturnDepartureId: z.number().int().positive().nullable(),
      outboundSeats: z.array(z.string().min(1).max(10)).min(1).max(11),
      returnSeats: z.array(z.string().min(1).max(10)).max(11).nullable(),
    }))
    .mutation(({ ctx, input }) => rescheduleWithNumberedSeats(input, ctx.user.id)),
  startMembershipCheckout: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const origin = approvedCheckoutOrigin(input.origin, ctx.req.headers.origin,
        ctx.req.headers["sec-fetch-site"], ctx.req.get(FIRST_PARTY_HEADER));
      const profile = await getMemberProfileStatus(ctx.user.id);
      if (!profile.complete) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Complete your name, email, phone and ID photo before joining." });
      }
      if (await getActiveMembership(ctx.user.id)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Your membership is already active. Manage it in your account." });
      }
      if (!stripeEnabled()) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payments are not configured" });
      }
      const settings = await getSettings();
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: profile.email,
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
            customer_email: profile.email,
            customer_name: profile.name,
          },
        },
        metadata: {
          user_id: String(ctx.user.id),
          customer_email: profile.email,
          customer_name: profile.name,
          kind: "membership",
        },
      });
      return { checkoutUrl: session.url };
    }),
  billingPortal: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const origin = approvedCheckoutOrigin(input.origin, ctx.req.headers.origin,
        ctx.req.headers["sec-fetch-site"], ctx.req.get(FIRST_PARTY_HEADER));
      if (!ctx.user.stripeCustomerId || !stripeEnabled()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No payment methods on file yet.",
        });
      }
      const session = await getStripe().billingPortal.sessions.create({
        customer: ctx.user.stripeCustomerId,
        return_url: `${origin}/account/payments`,
      });
      return { url: session.url };
    }),
});
