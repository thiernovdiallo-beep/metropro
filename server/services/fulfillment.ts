import { eq, sql } from "drizzle-orm";
import { bookings, memberships, passengers, payments, refunds, tickets, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { affectedRows, insertId } from "../lib/mysql";
import { TEMPLATES, notify } from "./notifications";
import { makeQrToken } from "./tickets";

export type TicketFulfillmentResult = "confirmed" | "already_confirmed" | "unavailable" | "missing";

export async function fulfillTicketPayment(opts: {
  bookingId: number;
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  amountCents?: number | null;
  receiptUrl?: string | null;
}): Promise<TicketFulfillmentResult> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  // A locked booking row serializes Checkout and PaymentIntent webhooks with
  // payment failure and the hold-expiry worker. Either both legs commit or none do.
  const result = await db.transaction(async tx => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, opts.bookingId)).limit(1).for("update");
    if (!booking) return { state: "missing" as const, booking: null };
    if (booking.status === "confirmed") return { state: "already_confirmed" as const, booking };
    if (booking.status !== "pending_payment") return { state: "unavailable" as const, booking };

    const convert = async (departureId: number, count: number, frontCount: number) => {
      const updated = await tx.execute(sql`
        UPDATE departures
        SET seatsHeld = seatsHeld - ${count},
            frontSeatsHeld = frontSeatsHeld - ${frontCount},
            seatsSold = seatsSold + ${count},
            frontSeatsSold = frontSeatsSold + ${frontCount}
        WHERE id = ${departureId} AND seatsHeld >= ${count} AND frontSeatsHeld >= ${frontCount}
      `);
      if (!affectedRows(updated)) throw new Error("Paid ticket needs manual review: selected seat hold is unavailable");
    };
    await convert(booking.outboundDepartureId, booking.passengerCount, booking.outboundFrontSeats);
    if (booking.returnDepartureId) {
      await convert(booking.returnDepartureId, booking.passengerCount, booking.returnFrontSeats);
    }

    const pax = await tx.select().from(passengers).where(eq(passengers.bookingId, booking.id));
    if (pax.length !== booking.passengerCount) throw new Error("Passenger records do not match the paid booking");
    const existing = await tx.select().from(tickets).where(eq(tickets.bookingId, booking.id));
    const keys = new Set(existing.map(t => `${t.passengerId}:${t.departureId}`));
    for (const passenger of pax) {
      const legs = [booking.outboundDepartureId, booking.returnDepartureId].filter((id): id is number => Boolean(id));
      for (const departureId of legs) {
        const key = `${passenger.id}:${departureId}`;
        if (keys.has(key)) continue;
        await tx.insert(tickets).values({
          passengerId: passenger.id,
          bookingId: booking.id,
          departureId,
          qrToken: makeQrToken(),
          seatType: departureId === booking.outboundDepartureId
            ? passenger.outboundSeatType
            : passenger.returnSeatType ?? "standard",
          status: "booked",
        });
        keys.add(key);
      }
    }

    const paidCents = opts.amountCents ?? booking.amountCents;
    const paymentIntentId = opts.paymentIntentId ?? booking.stripePaymentIntentId;
    const checkoutSessionId = opts.checkoutSessionId ?? booking.stripeCheckoutSessionId;
    await tx.update(bookings).set({
      status: "confirmed",
      stripePaymentIntentId: paymentIntentId,
      stripeCheckoutSessionId: checkoutSessionId,
      holdExpiresAt: null,
      amountCents: paidCents,
    }).where(eq(bookings.id, booking.id));
    const [recorded] = await tx.select().from(payments).where(eq(payments.bookingId, booking.id)).limit(1);
    if (!recorded) {
      await tx.insert(payments).values({
        userId: booking.userId,
        bookingId: booking.id,
        kind: "ticket",
        amountCents: paidCents,
        currency: "usd",
        status: "succeeded",
        stripePaymentIntentId: paymentIntentId,
        stripeCheckoutSessionId: checkoutSessionId,
        receiptUrl: opts.receiptUrl ?? null,
      });
    }
    return { state: "confirmed" as const, booking };
  });

  if (result.state !== "confirmed" || !result.booking) return result.state;
  const booking = result.booking;
  if (booking.userId !== null) {
    await notify({
      userId: booking.userId,
      templateKey: TEMPLATES.booking_confirmation,
      title: "Booking confirmed",
      body: `Your Metro Pro booking ${booking.bookingNumber} is confirmed. Your digital ticket is ready.`,
      payload: { bookingId: booking.id, bookingNumber: booking.bookingNumber },
    });
    await notify({
      userId: booking.userId,
      templateKey: TEMPLATES.payment_confirmation,
      title: "Payment received",
      body: `We received payment for booking ${booking.bookingNumber}.`,
      payload: { bookingId: booking.id },
    });
  }
  return "confirmed";
}

export async function failTicketPayment(bookingId: number) {
  const db = await getDb();
  if (!db) return;
  await db.transaction(async tx => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1).for("update");
    if (!booking || booking.status !== "pending_payment") return;
    const release = async (departureId: number, count: number, frontCount: number) => {
      await tx.execute(sql`
        UPDATE departures
        SET seatsHeld = GREATEST(seatsHeld - ${count}, 0),
            frontSeatsHeld = GREATEST(frontSeatsHeld - ${frontCount}, 0)
        WHERE id = ${departureId}
      `);
    };
    await release(booking.outboundDepartureId, booking.passengerCount, booking.outboundFrontSeats);
    if (booking.returnDepartureId) await release(booking.returnDepartureId, booking.passengerCount, booking.returnFrontSeats);
    await tx.update(bookings).set({ status: "canceled", holdExpiresAt: null }).where(eq(bookings.id, booking.id));
  });
}

export async function recordLatePaymentRefund(opts: {
  bookingId: number;
  paymentIntentId: string;
  checkoutSessionId?: string | null;
  refundId: string;
  refundedCents: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const booking = await db.transaction(async tx => {
    const [current] = await tx.select().from(bookings).where(eq(bookings.id, opts.bookingId)).limit(1).for("update");
    if (!current || current.status === "refunded") return null;
    if (current.status !== "canceled") throw new Error("Cannot mark a confirmed booking as an expired-hold refund");
    const [existingPayment] = await tx.select().from(payments).where(eq(payments.bookingId, current.id)).limit(1);
    let paymentId = existingPayment?.id;
    if (existingPayment) {
      await tx.update(payments).set({ status: "refunded", stripePaymentIntentId: opts.paymentIntentId })
        .where(eq(payments.id, existingPayment.id));
    } else {
      const result = await tx.insert(payments).values({
        userId: current.userId,
        bookingId: current.id,
        kind: "ticket",
        amountCents: opts.refundedCents,
        currency: "usd",
        status: "refunded",
        stripePaymentIntentId: opts.paymentIntentId,
        stripeCheckoutSessionId: opts.checkoutSessionId ?? current.stripeCheckoutSessionId,
      });
      paymentId = insertId(result);
    }
    await tx.insert(refunds).values({
      paymentId: paymentId!,
      bookingId: current.id,
      amountCents: opts.refundedCents,
      reason: "payment_after_hold_expired",
      stripeRefundId: opts.refundId,
    });
    await tx.update(bookings).set({
      status: "refunded",
      stripePaymentIntentId: opts.paymentIntentId,
      amountCents: opts.refundedCents,
      holdExpiresAt: null,
    }).where(eq(bookings.id, current.id));
    return current;
  });
  if (booking && booking.userId !== null) await notify({
    userId: booking.userId,
    templateKey: TEMPLATES.refund,
    title: "Refund processing — selected seats expired",
    body: `Booking ${booking.bookingNumber} could not be confirmed because its seat hold expired. Your payment refund is processing. Please book another departure.`,
    payload: { bookingId: booking.id },
  });
}

export async function upsertMembershipFromSubscription(opts: {
  userId: number;
  subscriptionId: string;
  status: "incomplete" | "active" | "past_due" | "canceled" | "unpaid";
  priceId?: string | null;
  periodEnd?: Date | null;
  priceCents: number;
  checkoutSessionId?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [existing] = await db.select().from(memberships).where(eq(memberships.stripeSubscriptionId, opts.subscriptionId)).limit(1);

  if (existing) {
    await db.update(memberships).set({
      status: opts.status,
      stripePriceId: opts.priceId ?? existing.stripePriceId,
      currentPeriodEnd: opts.periodEnd ?? existing.currentPeriodEnd,
      priceCentsSnapshot: opts.priceCents || existing.priceCentsSnapshot,
    }).where(eq(memberships.id, existing.id));
  } else {
    await db.insert(memberships).values({
      userId: opts.userId,
      stripeSubscriptionId: opts.subscriptionId,
      stripePriceId: opts.priceId ?? null,
      status: opts.status,
      currentPeriodEnd: opts.periodEnd ?? null,
      freeReschedulesRemaining: 1,
      priceCentsSnapshot: opts.priceCents,
    });
  }

  if (opts.status === "active" && opts.checkoutSessionId) {
    const [existingPay] = await db.select().from(payments).where(eq(payments.stripeCheckoutSessionId, opts.checkoutSessionId)).limit(1);
    if (!existingPay) {
      await db.insert(payments).values({
        userId: opts.userId,
        kind: "membership",
        amountCents: opts.priceCents,
        currency: "usd",
        status: "succeeded",
        stripeCheckoutSessionId: opts.checkoutSessionId,
      });
    }
  }

  if (opts.status === "active") {
    await notify({
      userId: opts.userId,
      templateKey: TEMPLATES.membership_renewal,
      title: "Metro Pro Member",
      body: "Your Metro Pro Member subscription is active. Your own regular seat is $100; the front seat remains $200.",
    });
  }
  if (opts.status === "past_due" || opts.status === "unpaid") {
    await notify({
      userId: opts.userId,
      templateKey: TEMPLATES.membership_payment_failed,
      title: "Membership payment failed",
      body: "We could not renew your Metro Pro Member subscription. Update your payment method to keep member fares.",
    });
  }
}

export async function setStripeCustomer(userId: number, stripeCustomerId: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ stripeCustomerId }).where(eq(users.id, userId));
}
