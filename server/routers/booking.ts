import { TRPCError } from "@trpc/server";
import { FIRST_PARTY_HEADER } from "@shared/const";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { bookings, cities, departures, locations, passengers, routes, tickets } from "../../drizzle/schema";
import { getActiveMembership, getDb } from "../db";
import { createGuestAccess, hasGuestAccess } from "../services/guest-access";
import { approvedCheckoutOrigin } from "../services/checkout-origin";
import { assertBookable, holdSeats, releaseHolds } from "../services/inventory";
import { getMemberProfileStatus } from "../services/member-profile";
import { frontCount, legFareCents, seatFareCents, validateSeatSelections, type SeatSelection } from "../services/pricing";
import { getSettings } from "../services/policies";
import { makeBookingNumber } from "../services/tickets";
import { getStripe, stripeEnabled } from "../stripe/client";
import { ticketLineItem } from "../stripe/products";
import { publicProcedure, router } from "../_core/trpc";
import { insertId } from "../lib/mysql";

const passengerSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  outboundSeatType: z.enum(["standard", "front"]),
  returnSeatType: z.enum(["standard", "front"]).nullable(),
  isMemberTraveler: z.boolean(),
});

const selectionInput = z.object({
  outboundDepartureId: z.number().int().positive(),
  returnDepartureId: z.number().int().positive().nullable(),
  passengerCount: z.number().int().min(1).max(10),
  passengers: z.array(passengerSchema).min(1).max(10),
});

type DepartureDetails = NonNullable<Awaited<ReturnType<typeof loadPricedDeparture>>>;

function checkedSelections(
  selections: SeatSelection[], count: number, hasReturn: boolean, activeMembership: boolean, name: string | null
) {
  if (selections.length !== count) throw new TRPCError({ code: "BAD_REQUEST", message: "Passenger count mismatch" });
  try {
    validateSeatSelections(selections, hasReturn, activeMembership, name);
  } catch (error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid seat selection" });
  }
}

function requireReversedRoute(outbound: DepartureDetails, ret: DepartureDetails | null) {
  if (ret && (outbound.route.destinationCityId !== ret.route.originCityId || outbound.route.originCityId !== ret.route.destinationCityId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Return must reverse the outbound route" });
  }
}

function lineItemsForLeg(departure: DepartureDetails, selections: SeatSelection[], leg: "outbound" | "return") {
  const rows = new Map<string, { unit: number; description: string; count: number }>();
  for (const p of selections) {
    const seat = leg === "outbound" ? p.outboundSeatType : p.returnSeatType;
    if (!seat) continue;
    const unit = seatFareCents(departure.route, seat, p.isMemberTraveler);
    const label = seat === "front" ? "Front passenger seat" : p.isMemberTraveler ? "Member regular seat" : "Regular seat";
    const description = `${departure.origin.name} → ${departure.destination.name} · ${label}`;
    const key = `${unit}:${description}`;
    const found = rows.get(key);
    if (found) found.count += 1;
    else rows.set(key, { unit, description, count: 1 });
  }
  return [...rows.values()].map(row => ticketLineItem(row.unit, row.count, row.description));
}

export const bookingRouter = router({
  quote: publicProcedure
    .input(selectionInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const membership = ctx.user ? await getActiveMembership(ctx.user.id) : null;
      const profile = membership && ctx.user ? await getMemberProfileStatus(ctx.user.id) : null;
      const isMember = Boolean(membership && profile?.complete);
      checkedSelections(input.passengers, input.passengerCount, Boolean(input.returnDepartureId), isMember, profile?.name ?? null);
      const outbound = await loadPricedDeparture(input.outboundDepartureId);
      if (!outbound) throw new TRPCError({ code: "NOT_FOUND", message: "Departure not found" });
      const ret = input.returnDepartureId ? await loadPricedDeparture(input.returnDepartureId) : null;
      if (input.returnDepartureId && !ret) throw new TRPCError({ code: "NOT_FOUND", message: "Return departure not found" });
      requireReversedRoute(outbound, ret);
      const outFront = frontCount(input.passengers, "outbound");
      const retFront = frontCount(input.passengers, "return");
      try {
        await assertBookable(input.outboundDepartureId, input.passengerCount, isMember, outFront);
        if (ret) await assertBookable(ret.id, input.passengerCount, isMember, retFront);
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Selected seats are sold out" });
      }
      const outboundBreakdown = input.passengers.map(p => ({
        name: `${p.firstName} ${p.lastName}`,
        seatType: p.outboundSeatType,
        amountCents: seatFareCents(outbound.route, p.outboundSeatType, p.isMemberTraveler),
        memberFareApplied: p.isMemberTraveler && p.outboundSeatType === "standard",
      }));
      const returnBreakdown = ret ? input.passengers.map(p => ({
        name: `${p.firstName} ${p.lastName}`,
        seatType: p.returnSeatType,
        amountCents: seatFareCents(ret.route, p.returnSeatType!, p.isMemberTraveler),
        memberFareApplied: p.isMemberTraveler && p.returnSeatType === "standard",
      })) : [];
      return {
        isMember,
        fareType: input.passengers.some(p => p.isMemberTraveler && (p.outboundSeatType === "standard" || p.returnSeatType === "standard")) ? "member" : "standard",
        outboundBreakdown,
        returnBreakdown,
        amountCents: legFareCents(outbound.route, input.passengers, "outbound") + (ret ? legFareCents(ret.route, input.passengers, "return") : 0),
        outbound,
        returnTrip: ret,
      };
    }),
  createCheckout: publicProcedure
    .input(selectionInput.extend({
      origin: z.string().url(),
      contactFirstName: z.string().min(1),
      contactLastName: z.string().min(1),
      contactPhone: z.string().min(7),
      contactEmail: z.string().email(),
      emergencyName: z.string().optional(),
      emergencyPhone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const origin = approvedCheckoutOrigin(input.origin, ctx.req.headers.origin,
        ctx.req.headers["sec-fetch-site"], ctx.req.get(FIRST_PARTY_HEADER));
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const settings = await getSettings();
      if (settings.emergencyContactRequired && (!input.emergencyName || !input.emergencyPhone)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Emergency contact is required" });
      }
      const membership = ctx.user ? await getActiveMembership(ctx.user.id) : null;
      const profile = membership && ctx.user ? await getMemberProfileStatus(ctx.user.id) : null;
      const isMember = Boolean(membership && profile?.complete);
      checkedSelections(input.passengers, input.passengerCount, Boolean(input.returnDepartureId), isMember, profile?.name ?? null);
      const outbound = await loadPricedDeparture(input.outboundDepartureId);
      if (!outbound) throw new TRPCError({ code: "NOT_FOUND", message: "Departure not found" });
      const ret = input.returnDepartureId ? await loadPricedDeparture(input.returnDepartureId) : null;
      if (input.returnDepartureId && !ret) throw new TRPCError({ code: "NOT_FOUND", message: "Return departure not found" });
      requireReversedRoute(outbound, ret);
      const outFront = frontCount(input.passengers, "outbound");
      const retFront = frontCount(input.passengers, "return");
      try {
        await assertBookable(outbound.id, input.passengerCount, isMember, outFront);
        if (ret) await assertBookable(ret.id, input.passengerCount, isMember, retFront);
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Selected seats are sold out" });
      }

      let outboundHeld = false;
      let returnHeld = false;
      try {
        await holdSeats(outbound.id, input.passengerCount, outFront);
        outboundHeld = true;
        if (ret) {
          await holdSeats(ret.id, input.passengerCount, retFront);
          returnHeld = true;
        }
      } catch (error) {
        if (outboundHeld) await releaseHolds(outbound.id, input.passengerCount, outFront);
        if (returnHeld && ret) await releaseHolds(ret.id, input.passengerCount, retFront);
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Selected seats are sold out" });
      }

      const outboundQuotedCents = legFareCents(outbound.route, input.passengers, "outbound");
      const returnQuotedCents = ret ? legFareCents(ret.route, input.passengers, "return") : 0;
      const amountCents = outboundQuotedCents + returnQuotedCents;
      const bookingNumber = makeBookingNumber();
      const guestAccess = ctx.user ? null : createGuestAccess();
      // Stripe requires at least 30 minutes. Keep seats for five more minutes
      // after Checkout expires so paid webhooks can confirm both legs safely.
      const checkoutMinutes = Math.min(1430, Math.max(30, settings.holdMinutes));
      const checkoutExpiresAt = Math.floor(Date.now() / 1000) + checkoutMinutes * 60 + 120;
      let bookingId: number | null = null;
      try {
        const insertResult = await db.insert(bookings).values({
          bookingNumber,
          userId: ctx.user?.id ?? null,
          guestAccessHash: guestAccess?.hash ?? null,
          outboundDepartureId: outbound.id,
          returnDepartureId: ret?.id ?? null,
          tripType: ret ? "round_trip" : "one_way",
          passengerCount: input.passengerCount,
          outboundFrontSeats: outFront,
          returnFrontSeats: retFront,
          fareType: input.passengers.some(p => p.isMemberTraveler && (p.outboundSeatType === "standard" || p.returnSeatType === "standard")) ? "member" : "standard",
          outboundQuotedCents,
          returnQuotedCents,
          amountCents,
          status: "pending_payment",
          contactFirstName: input.contactFirstName,
          contactLastName: input.contactLastName,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
          emergencyName: input.emergencyName ?? null,
          emergencyPhone: input.emergencyPhone ?? null,
          holdExpiresAt: new Date((checkoutExpiresAt + 5 * 60) * 1000),
        });
        bookingId = insertId(insertResult);
        for (const p of input.passengers) {
          await db.insert(passengers).values({
            bookingId,
            firstName: p.firstName,
            lastName: p.lastName,
            outboundSeatType: p.outboundSeatType,
            returnSeatType: p.returnSeatType,
            status: "booked",
          });
        }
        if (!stripeEnabled()) throw new Error("Payments are not configured");
        const session = await getStripe().checkout.sessions.create({
          mode: "payment",
          expires_at: checkoutExpiresAt,
          customer_email: input.contactEmail,
          client_reference_id: String(bookingId),
          allow_promotion_codes: true,
          success_url: `${origin}/confirmation?booking=${encodeURIComponent(bookingNumber)}${guestAccess ? `&access=${encodeURIComponent(guestAccess.token)}` : ""}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/checkout?canceled=1`,
          line_items: [
            ...lineItemsForLeg(outbound, input.passengers, "outbound"),
            ...(ret ? lineItemsForLeg(ret, input.passengers, "return") : []),
          ],
          payment_intent_data: { metadata: { ...(ctx.user ? { user_id: String(ctx.user.id) } : {}), booking_id: String(bookingId) } },
          metadata: {
            ...(ctx.user ? { user_id: String(ctx.user.id) } : {}),
            customer_email: input.contactEmail,
            customer_name: `${input.contactFirstName} ${input.contactLastName}`,
            booking_id: String(bookingId),
          },
        });
        await db.update(bookings).set({ stripeCheckoutSessionId: session.id }).where(eq(bookings.id, bookingId));
        return { checkoutUrl: session.url, bookingNumber, bookingId, guestAccessToken: guestAccess?.token ?? null };
      } catch (error) {
        await releaseHolds(outbound.id, input.passengerCount, outFront);
        if (ret) await releaseHolds(ret.id, input.passengerCount, retFront);
        if (bookingId) await db.update(bookings).set({ status: "canceled", holdExpiresAt: null }).where(eq(bookings.id, bookingId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Checkout failed" });
      }
    }),
  getByNumber: publicProcedure
    .input(z.object({ bookingNumber: z.string().min(1).max(24), accessToken: z.string().max(128).optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [booking] = await db.select().from(bookings).where(eq(bookings.bookingNumber, input.bookingNumber)).limit(1);
      if (!booking) return null;
      const owner = Boolean(ctx.user && (booking.userId === ctx.user.id || ctx.user.role === "admin"));
      if (!owner && !hasGuestAccess(booking, input.accessToken)) throw new TRPCError({ code: "NOT_FOUND" });
      const pax = await db.select().from(passengers).where(eq(passengers.bookingId, booking.id));
      const tix = await db.select().from(tickets).where(eq(tickets.bookingId, booking.id));
      const { guestAccessHash: _secretHash, ...safeBooking } = booking;
      return { booking: safeBooking, passengers: pax, tickets: tix };
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
  const [destination] = await db.select().from(cities).where(eq(cities.id, route.destinationCityId)).limit(1);
  const [pickup] = await db.select().from(locations).where(eq(locations.id, route.pickupLocationId)).limit(1);
  const [dropoff] = await db.select().from(locations).where(eq(locations.id, route.dropoffLocationId)).limit(1);
  return { ...dep, route, origin, destination, pickup, dropoff };
}
