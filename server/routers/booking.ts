import { TRPCError } from "@trpc/server";
import { FIRST_PARTY_HEADER } from "@shared/const";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { bookings, cities, departures, locations, passengers, payments, refunds, routeStops, routes, tickets } from "../../drizzle/schema";
import { getActiveMembership, getDb } from "../db";
import { createGuestAccess, hasGuestAccess } from "../services/guest-access";
import { approvedCheckoutOrigin } from "../services/checkout-origin";
import { assertBookable, expireStaleHolds, holdSeatsInTransaction, releaseHoldsInTransaction } from "../services/inventory";
import { getMemberProfileStatus } from "../services/member-profile";
import { frontCount, legFareCents, seatFareCents, validateSeatSelections, type SeatSelection } from "../services/pricing";
import { getSettings } from "../services/policies";
import { getSeatAvailability } from "../services/seat-inventory";
import { validateNumberedSeats } from "../services/seat-selection";
import { reconcilePendingRefunds } from "../services/refund-lifecycle";
import { throttleSeatMap } from "../services/seat-map-rate-limit";
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
  seatNumber: z.string().trim().min(1).max(10).optional(),
  returnSeatNumber: z.string().trim().min(1).max(10).optional(),
  outboundPickupLocationId: z.number().int().positive().optional(),
  outboundDropoffLocationId: z.number().int().positive().optional(),
  returnPickupLocationId: z.number().int().positive().optional(),
  returnDropoffLocationId: z.number().int().positive().optional(),
  isMemberTraveler: z.boolean(),
});

const selectionInput = z.object({
  outboundDepartureId: z.number().int().positive(),
  returnDepartureId: z.number().int().positive().nullable(),
  passengerCount: z.number().int().min(1).max(11),
  passengers: z.array(passengerSchema).min(1).max(11),
});

type DepartureDetails = NonNullable<Awaited<ReturnType<typeof loadPricedDeparture>>>;
type NumberedSelection = SeatSelection & {
  seatNumber?: string;
  returnSeatNumber?: string;
  outboundPickupLocationId?: number;
  outboundDropoffLocationId?: number;
  returnPickupLocationId?: number;
  returnDropoffLocationId?: number;
};

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

export function requireReversedRoute(outbound: DepartureDetails, ret: DepartureDetails | null) {
  if (ret && (outbound.route.destinationCityId !== ret.route.originCityId || outbound.route.originCityId !== ret.route.destinationCityId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Return must reverse the outbound route" });
  }
  if (ret && ret.departAt <= outbound.arriveAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Return must depart after the outbound trip arrives" });
  }
}

async function validateStopSelections(departure: DepartureDetails, passengersForLeg: NumberedSelection[], leg: "outbound" | "return") {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const stops = await db.select().from(routeStops).where(eq(routeStops.routeId, departure.route.id));
  const ordered = [
    { id: departure.route.pickupLocationId, order: 0, pickupAllowed: true, dropoffAllowed: true },
    ...stops.sort((a, b) => a.stopOrder - b.stopOrder).map(stop => ({ id: stop.locationId, order: stop.stopOrder, pickupAllowed: stop.pickupAllowed, dropoffAllowed: stop.dropoffAllowed })),
    { id: departure.route.dropoffLocationId, order: stops.length + 1, pickupAllowed: true, dropoffAllowed: true },
  ];
  const orderByLocation = new Map(ordered.map(item => [item.id, item.order]));
  const permissions = new Map(ordered.map(item => [item.id, item]));
  for (const passenger of passengersForLeg) {
    const pickup = leg === "outbound" ? passenger.outboundPickupLocationId : passenger.returnPickupLocationId;
    const dropoff = leg === "outbound" ? passenger.outboundDropoffLocationId : passenger.returnDropoffLocationId;
    if (pickup == null && dropoff == null) continue;
    if (pickup == null || dropoff == null || !orderByLocation.has(pickup) || !orderByLocation.has(dropoff) || !permissions.get(pickup)?.pickupAllowed || !permissions.get(dropoff)?.dropoffAllowed || orderByLocation.get(pickup)! >= orderByLocation.get(dropoff)!) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `${leg === "outbound" ? "Outbound" : "Return"} pickup and drop-off must be valid stops in travel order.` });
    }
  }
}

export function lineItemsForLeg(departure: DepartureDetails, selections: NumberedSelection[], leg: "outbound" | "return") {
  const rows = new Map<string, { unit: number; description: string; count: number; numberedSeats: [number, string][] }>();
  for (const [index, p] of selections.entries()) {
    const seat = leg === "outbound" ? p.outboundSeatType : p.returnSeatType;
    if (!seat) continue;
    const unit = seatFareCents(departure.route, seat, p.isMemberTraveler);
    const label = seat === "front" ? "Front passenger seat" : p.isMemberTraveler ? "Member regular seat" : "Regular seat";
    const description = `${departure.origin.name} → ${departure.destination.name} · ${label}`;
    const key = `${unit}:${description}`;
    const seatNumber = leg === "outbound" ? p.seatNumber : p.returnSeatNumber;
    const found = rows.get(key);
    if (found) {
      found.count += 1;
      if (seatNumber) found.numberedSeats.push([index + 1, seatNumber]);
    } else rows.set(key, { unit, description, count: 1, numberedSeats: seatNumber ? [[index + 1, seatNumber]] : [] });
  }
  return [...rows.values()].map(row => {
    const item = ticketLineItem(row.unit, row.count, row.description);
    if (!row.numberedSeats.length) return item;
    // Keep one Stripe line item per price + fare description; seat numbers are annotations, not prices.
    return {
      ...item,
      price_data: {
        ...item.price_data,
        product_data: {
          ...item.price_data.product_data,
          description: `${row.description} · Selected seats: ${row.numberedSeats.map(([, number]) => number).join(", ")}`,
          metadata: { leg, departure_id: String(departure.id), passenger_seats: JSON.stringify(row.numberedSeats) },
        },
      },
    };
  });
}

export const bookingRouter = router({
  getSeatMap: publicProcedure
    .input(z.object({ departureId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const clientKey = ctx.user
        ? `user:${ctx.user.id}`
        : `guest:${ctx.req.ip ?? ctx.req.socket?.remoteAddress ?? "unknown"}`;
      throttleSeatMap(clientKey);
      try {
        const seats = await getSeatAvailability(input.departureId);
        // Explicitly select public fields, even if the service gains internal data later.
        return seats.map(({ seatNumber, seatType, status, priceCents }) => ({
          seatNumber, seatType, status, priceCents,
        }));
      } catch (error) {
        if (error instanceof Error && error.message === "Departure not found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Departure not found" });
        }
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "The seat map is temporarily unavailable. Please retry." });
      }
    }),
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
      await validateStopSelections(outbound, input.passengers, "outbound");
      if (ret) await validateStopSelections(ret, input.passengers, "return");
      const outFront = frontCount(input.passengers, "outbound");
      const retFront = frontCount(input.passengers, "return");
      try {
        await assertBookable(input.outboundDepartureId, input.passengerCount, isMember, outFront);
        if (ret) await assertBookable(ret.id, input.passengerCount, isMember, retFront);
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Selected seats are sold out" });
      }
      if (input.passengers.some(person => person.seatNumber || person.returnSeatNumber)) {
        try {
          validateNumberedSeats(await getSeatAvailability(outbound.id), input.passengers, "outbound");
          if (ret) validateNumberedSeats(await getSeatAvailability(ret.id), input.passengers, "return");
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Seats cannot be checked right now. Please retry." });
        }
      }
      const selectedLocationIds = input.passengers.flatMap(p => [p.outboundPickupLocationId, p.outboundDropoffLocationId, p.returnPickupLocationId, p.returnDropoffLocationId].filter((id): id is number => id != null));
      const selectedLocations = selectedLocationIds.length ? await db.select().from(locations) : [];
      const selectedLocationMap = new Map(selectedLocations.map(location => [location.id, location]));
      const outboundBreakdown = input.passengers.map(p => ({
        name: `${p.firstName} ${p.lastName}`,
        seatNumber: p.seatNumber ?? null,
        seatType: p.outboundSeatType,
        amountCents: seatFareCents(outbound.route, p.outboundSeatType, p.isMemberTraveler),
        memberFareApplied: p.isMemberTraveler && p.outboundSeatType === "standard",
        pickupLabel: p.outboundPickupLocationId ? selectedLocationMap.get(p.outboundPickupLocationId)?.label ?? null : null,
        dropoffLabel: p.outboundDropoffLocationId ? selectedLocationMap.get(p.outboundDropoffLocationId)?.label ?? null : null,
      }));
      const returnBreakdown = ret ? input.passengers.map(p => ({
        name: `${p.firstName} ${p.lastName}`,
        seatNumber: p.returnSeatNumber ?? null,
        seatType: p.returnSeatType,
        amountCents: seatFareCents(ret.route, p.returnSeatType!, p.isMemberTraveler),
        memberFareApplied: p.isMemberTraveler && p.returnSeatType === "standard",
        pickupLabel: p.returnPickupLocationId ? selectedLocationMap.get(p.returnPickupLocationId)?.label ?? null : null,
        dropoffLabel: p.returnDropoffLocationId ? selectedLocationMap.get(p.returnDropoffLocationId)?.label ?? null : null,
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
      await validateStopSelections(outbound, input.passengers, "outbound");
      if (ret) await validateStopSelections(ret, input.passengers, "return");
      if (!ret && input.passengers.some(p => p.returnSeatNumber)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Return seats require a return departure." });
      }
      // Seat maps disregard expired pending holds. Clear their unique seat rows
      // before taking a new hold so the database agrees with public availability.
      await expireStaleHolds();
      const outFront = frontCount(input.passengers, "outbound");
      const retFront = frontCount(input.passengers, "return");
      try {
        await assertBookable(outbound.id, input.passengerCount, isMember, outFront);
        if (ret) await assertBookable(ret.id, input.passengerCount, isMember, retFront);
      } catch (error) {
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
      const hasSeatNumbers = input.passengers.some(p => p.seatNumber || p.returnSeatNumber);
      const passengerSeatMetadata: Record<string, string> = {};
      input.passengers.forEach((p, index) => {
        if (p.seatNumber) passengerSeatMetadata[`passenger_${index + 1}_outbound_seat`] = p.seatNumber;
        if (p.returnSeatNumber) passengerSeatMetadata[`passenger_${index + 1}_return_seat`] = p.returnSeatNumber;
      });
      let bookingId: number | null = null;
      let sessionId: string | null = null;
      try {
        bookingId = await db.transaction(async tx => {
          // Lock departure rows in stable order even for legacy quantity bookings.
          // Conditional counter updates and passenger rows now commit together.
          const ids = [outbound.id, ...(ret ? [ret.id] : [])].sort((a, b) => a - b);
          for (const id of ids) {
            await tx.select({ id: departures.id }).from(departures).where(eq(departures.id, id)).for("update");
          }
          if (hasSeatNumbers) {
            // Separate outbound/return indexes cannot prevent cross-leg conflicts.
            validateNumberedSeats(await getSeatAvailability(outbound.id, tx), input.passengers, "outbound");
            if (ret) validateNumberedSeats(await getSeatAvailability(ret.id, tx), input.passengers, "return");
          }
          try {
            await holdSeatsInTransaction(tx, outbound.id, input.passengerCount, outFront);
            if (ret) await holdSeatsInTransaction(tx, ret.id, input.passengerCount, retFront);
          } catch (error) {
            throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Selected seats are sold out" });
          }
          const insertResult = await tx.insert(bookings).values({
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
          const insertedBookingId = insertId(insertResult);
          for (const p of input.passengers) {
            await tx.insert(passengers).values({
              bookingId: insertedBookingId,
              firstName: p.firstName,
              lastName: p.lastName,
              outboundSeatType: p.outboundSeatType,
              returnSeatType: p.returnSeatType,
              departureId: p.seatNumber ? outbound.id : null,
              seatNumber: p.seatNumber ?? null,
              outboundPickupLocationId: p.outboundPickupLocationId ?? null,
              outboundDropoffLocationId: p.outboundDropoffLocationId ?? null,
              returnDepartureId: p.returnSeatNumber ? ret!.id : null,
              returnSeatNumber: p.returnSeatNumber ?? null,
              returnPickupLocationId: p.returnPickupLocationId ?? null,
              returnDropoffLocationId: p.returnDropoffLocationId ?? null,
              status: "booked",
            });
          }
          return insertedBookingId;
        });
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
          payment_intent_data: { metadata: { ...(ctx.user ? { user_id: String(ctx.user.id) } : {}), booking_id: String(bookingId), ...passengerSeatMetadata } },
          metadata: {
            ...(ctx.user ? { user_id: String(ctx.user.id) } : {}),
            customer_email: input.contactEmail,
            customer_name: `${input.contactFirstName} ${input.contactLastName}`,
            booking_id: String(bookingId),
            // The webhook uses booking_id to load authoritative passenger/seat assignments from MySQL.
            ...passengerSeatMetadata,
          },
        });
        sessionId = session.id;
        if (!session.url) throw new Error("Stripe Checkout did not provide a secure payment URL");
        await db.transaction(async tx => {
          await tx.update(bookings).set({ stripeCheckoutSessionId: session.id }).where(eq(bookings.id, bookingId!));
          await tx.insert(payments).values({ userId: ctx.user?.id ?? null, bookingId,
            kind: "ticket", amountCents, currency: "usd", status: "pending", stripeCheckoutSessionId: session.id });
        });
        return { checkoutUrl: session.url, bookingNumber, bookingId, guestAccessToken: guestAccess?.token ?? null,
          checkoutExpiresAt: new Date(checkoutExpiresAt * 1000),
          holdExpiresAt: new Date((checkoutExpiresAt + 5 * 60) * 1000) };
      } catch (error) {
        if (bookingId) {
          await db.transaction(async tx => {
            const [current] = await tx.select().from(bookings).where(eq(bookings.id, bookingId!)).limit(1).for("update");
            if (!current || current.status !== "pending_payment") return;
            await releaseHoldsInTransaction(tx, outbound.id, input.passengerCount, outFront);
            if (ret) await releaseHoldsInTransaction(tx, ret.id, input.passengerCount, retFront);
            await tx.update(passengers).set({ departureId: null, seatNumber: null, outboundPickupLocationId: null, outboundDropoffLocationId: null, returnDepartureId: null, returnSeatNumber: null, returnPickupLocationId: null, returnDropoffLocationId: null })
              .where(eq(passengers.bookingId, current.id));
            await tx.update(bookings).set({ status: "canceled", holdExpiresAt: null }).where(eq(bookings.id, current.id));
            await tx.update(payments).set({ status: "failed" }).where(eq(payments.bookingId, current.id));
          });
        }
        if (sessionId) try { await getStripe().checkout.sessions.expire(sessionId); }
        catch (expireError) { console.warn("[booking.checkout] Unable to close failed test checkout", expireError instanceof Error ? expireError.name : "unknown"); }
        if (error instanceof TRPCError) throw error;
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
          throw new TRPCError({ code: "CONFLICT", message: "A selected seat was just reserved by someone else." });
        }
        console.warn("[booking.checkout] Session setup failed", error instanceof Error ? error.name : "unknown");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Checkout could not start. No charge was made; please retry or contact support." });
      }
    }),
  getByNumber: publicProcedure
    .input(z.object({ bookingNumber: z.string().min(1).max(24), accessToken: z.string().max(128).optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      let [booking] = await db.select().from(bookings).where(eq(bookings.bookingNumber, input.bookingNumber)).limit(1);
      if (!booking) return null;
      const owner = Boolean(ctx.user && (booking.userId === ctx.user.id || ctx.user.role === "admin"));
      if (!owner && !hasGuestAccess(booking, input.accessToken)) throw new TRPCError({ code: "NOT_FOUND" });
      await reconcilePendingRefunds();
      [booking] = await db.select().from(bookings).where(eq(bookings.id, booking.id)).limit(1);
      if (!booking) return null;
      const pax = await db.select().from(passengers).where(eq(passengers.bookingId, booking.id));
      const tix = await db.select().from(tickets).where(and(eq(tickets.bookingId, booking.id), ne(tickets.status, "voided")));
      const [refund] = await db.select({ status: refunds.status, amountCents: refunds.amountCents }).from(refunds)
        .where(eq(refunds.bookingId, booking.id)).limit(1);
      const toSummary = (trip: DepartureDetails | null) => trip ? {
        id: trip.id, departAt: trip.departAt, arriveAt: trip.arriveAt,
        origin: trip.origin, destination: trip.destination, pickup: trip.pickup, dropoff: trip.dropoff,
      } : null;
      const outbound = toSummary(await loadPricedDeparture(booking.outboundDepartureId));
      const returnTrip = booking.returnDepartureId ? toSummary(await loadPricedDeparture(booking.returnDepartureId)) : null;
      const { guestAccessHash: _secretHash, ...safeBooking } = booking;
      return { booking: safeBooking, passengers: pax, tickets: tix, outbound, returnTrip, refund: refund ?? null };
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
