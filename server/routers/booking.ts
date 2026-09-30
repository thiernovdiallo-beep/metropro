import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  bookings,
  cities,
  departures,
  locations,
  passengers,
  routes,
  tickets,
} from "../../drizzle/schema";
import { getActiveMembership, getDb } from "../db";
import { assertBookable, holdSeats, releaseHolds } from "../services/inventory";
import { getSettings } from "../services/policies";
import { makeBookingNumber } from "../services/tickets";
import { getStripe, stripeEnabled } from "../stripe/client";
import { ticketLineItem } from "../stripe/products";
import { protectedProcedure, router } from "../_core/trpc";
import { insertId } from "../lib/mysql";

const passengerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export const bookingRouter = router({
  quote: protectedProcedure
    .input(
      z.object({
        outboundDepartureId: z.number(),
        returnDepartureId: z.number().nullable(),
        passengerCount: z.number().int().min(1).max(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const membership = await getActiveMembership(ctx.user.id);
      const isMember = Boolean(membership);
      const outbound = await loadPricedDeparture(input.outboundDepartureId);
      if (!outbound) throw new TRPCError({ code: "NOT_FOUND", message: "Departure not found" });
      const fare = isMember ? outbound.route.memberFareCents : outbound.route.standardFareCents;
      let amount = fare * input.passengerCount;
      let ret = null;
      if (input.returnDepartureId) {
        ret = await loadPricedDeparture(input.returnDepartureId);
        if (!ret) throw new TRPCError({ code: "NOT_FOUND", message: "Return departure not found" });
        amount += (isMember ? ret.route.memberFareCents : ret.route.standardFareCents) * input.passengerCount;
      }
      return {
        isMember,
        fareType: isMember ? "member" : "standard",
        unitOutboundCents: isMember ? outbound.route.memberFareCents : outbound.route.standardFareCents,
        unitReturnCents: ret
          ? isMember
            ? ret.route.memberFareCents
            : ret.route.standardFareCents
          : null,
        amountCents: amount,
        outbound,
        returnTrip: ret,
      };
    }),
  createCheckout: protectedProcedure
    .input(
      z.object({
        origin: z.string().url(),
        outboundDepartureId: z.number(),
        returnDepartureId: z.number().nullable(),
        passengerCount: z.number().int().min(1).max(10),
        contactFirstName: z.string().min(1),
        contactLastName: z.string().min(1),
        contactPhone: z.string().min(7),
        contactEmail: z.string().email(),
        emergencyName: z.string().optional(),
        emergencyPhone: z.string().optional(),
        passengers: z.array(passengerSchema).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.passengers.length !== input.passengerCount) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Passenger count mismatch" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const settings = await getSettings();
      if (settings.emergencyContactRequired && (!input.emergencyName || !input.emergencyPhone)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Emergency contact is required" });
      }
      const membership = await getActiveMembership(ctx.user.id);
      const isMember = Boolean(membership);
      const outbound = await loadPricedDeparture(input.outboundDepartureId);
      if (!outbound) throw new TRPCError({ code: "NOT_FOUND" });
      const ret = input.returnDepartureId ? await loadPricedDeparture(input.returnDepartureId) : null;
      if (input.returnDepartureId && !ret) throw new TRPCError({ code: "NOT_FOUND" });

      if (ret && outbound.route.destinationCityId !== ret.route.originCityId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Return must reverse the outbound route" });
      }

      try {
        await assertBookable(input.outboundDepartureId, input.passengerCount, isMember);
        if (input.returnDepartureId) {
          await assertBookable(input.returnDepartureId, input.passengerCount, isMember);
        }
      } catch (error) {
        throw new TRPCError({
          code: "CONFLICT",
          message: error instanceof Error ? error.message : "SOLD OUT",
        });
      }

      let outboundHeld = false;
      let returnHeld = false;
      try {
        await holdSeats(input.outboundDepartureId, input.passengerCount);
        outboundHeld = true;
        if (input.returnDepartureId) {
          await holdSeats(input.returnDepartureId, input.passengerCount);
          returnHeld = true;
        }
      } catch (error) {
        if (outboundHeld) await releaseHolds(input.outboundDepartureId, input.passengerCount);
        if (returnHeld && input.returnDepartureId) {
          await releaseHolds(input.returnDepartureId, input.passengerCount);
        }
        throw new TRPCError({
          code: "CONFLICT",
          message: error instanceof Error ? error.message : "SOLD OUT",
        });
      }

      const unitOut = isMember ? outbound.route.memberFareCents : outbound.route.standardFareCents;
      const unitRet = ret
        ? isMember
          ? ret.route.memberFareCents
          : ret.route.standardFareCents
        : 0;
      const amountCents = unitOut * input.passengerCount + unitRet * input.passengerCount;
      const holdExpiresAt = new Date(Date.now() + settings.holdMinutes * 60 * 1000);
      const bookingNumber = makeBookingNumber();

      const insertResult = await db.insert(bookings).values({
        bookingNumber,
        userId: ctx.user.id,
        outboundDepartureId: input.outboundDepartureId,
        returnDepartureId: input.returnDepartureId,
        tripType: input.returnDepartureId ? "round_trip" : "one_way",
        passengerCount: input.passengerCount,
        fareType: isMember ? "member" : "standard",
        amountCents,
        status: "pending_payment",
        contactFirstName: input.contactFirstName,
        contactLastName: input.contactLastName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        emergencyName: input.emergencyName ?? null,
        emergencyPhone: input.emergencyPhone ?? null,
        holdExpiresAt,
      });
      const bookingId = insertId(insertResult);

      for (const p of input.passengers) {
        await db.insert(passengers).values({
          bookingId,
          firstName: p.firstName,
          lastName: p.lastName,
          status: "booked",
        });
      }

      if (!stripeEnabled()) {
        await releaseHolds(input.outboundDepartureId, input.passengerCount);
        if (input.returnDepartureId) await releaseHolds(input.returnDepartureId, input.passengerCount);
        await db.update(bookings).set({ status: "canceled", holdExpiresAt: null }).where(eq(bookings.id, bookingId));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Payments are not configured",
        });
      }

      const origin = input.origin.replace(/\/$/, "");
      const stripe = getStripe();
      const lineItems = [
        ticketLineItem(
          unitOut,
          input.passengerCount,
          `${outbound.origin.name} → ${outbound.destination.name}`
        ),
      ];
      if (ret && unitRet) {
        lineItems.push(
          ticketLineItem(
            unitRet,
            input.passengerCount,
            `${ret.origin.name} → ${ret.destination.name}`
          )
        );
      }
      let session;
      try {
        session = await stripe.checkout.sessions.create({
          mode: "payment",
          customer_email: input.contactEmail,
          client_reference_id: String(bookingId),
          allow_promotion_codes: true,
          success_url: `${origin}/confirmation?booking=${bookingNumber}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/checkout?canceled=1`,
          line_items: lineItems,
          payment_intent_data: {
            metadata: {
              user_id: String(ctx.user.id),
              booking_id: String(bookingId),
            },
          },
          metadata: {
            user_id: String(ctx.user.id),
            customer_email: input.contactEmail,
            customer_name: `${input.contactFirstName} ${input.contactLastName}`,
            booking_id: String(bookingId),
          },
        });
      } catch (error) {
        await releaseHolds(input.outboundDepartureId, input.passengerCount);
        if (input.returnDepartureId) await releaseHolds(input.returnDepartureId, input.passengerCount);
        await db.update(bookings).set({ status: "canceled", holdExpiresAt: null }).where(eq(bookings.id, bookingId));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Checkout failed",
        });
      }

      await db
        .update(bookings)
        .set({ stripeCheckoutSessionId: session.id })
        .where(eq(bookings.id, bookingId));

      return { checkoutUrl: session.url, bookingNumber, bookingId };
    }),
  getByNumber: protectedProcedure
    .input(z.object({ bookingNumber: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [booking] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.bookingNumber, input.bookingNumber))
        .limit(1);
      if (!booking) return null;
      if (booking.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const pax = await db.select().from(passengers).where(eq(passengers.bookingId, booking.id));
      const tix = await db.select().from(tickets).where(eq(tickets.bookingId, booking.id));
      return { booking, passengers: pax, tickets: tix };
    }),
});

async function loadPricedDeparture(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [dep] = await db.select().from(departures).where(eq(departures.id, id)).limit(1);
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
  return { ...dep, route, origin, destination, pickup, dropoff };
}
