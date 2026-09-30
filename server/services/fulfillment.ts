import { eq } from "drizzle-orm";
import {
  bookings,
  memberships,
  passengers,
  payments,
  tickets,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { convertHoldsToSold, releaseHolds } from "./inventory";
import { TEMPLATES, notify } from "./notifications";
import { makeQrToken } from "./tickets";

export async function fulfillTicketPayment(opts: {
  bookingId: number;
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  amountCents?: number | null;
  receiptUrl?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, opts.bookingId)).limit(1);
  if (!booking) return;
  if (booking.status === "confirmed") return;

  const pax = await db.select().from(passengers).where(eq(passengers.bookingId, booking.id));
  const existingTickets = await db.select().from(tickets).where(eq(tickets.bookingId, booking.id));
  if (existingTickets.length === 0) {
    const legs = [booking.outboundDepartureId, booking.returnDepartureId].filter(
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
    }
  }

  await convertHoldsToSold(booking.outboundDepartureId, booking.passengerCount);
  if (booking.returnDepartureId) {
    await convertHoldsToSold(booking.returnDepartureId, booking.passengerCount);
  }

  await db
    .update(bookings)
    .set({
      status: "confirmed",
      stripePaymentIntentId: opts.paymentIntentId ?? booking.stripePaymentIntentId,
      stripeCheckoutSessionId: opts.checkoutSessionId ?? booking.stripeCheckoutSessionId,
      holdExpiresAt: null,
      amountCents: opts.amountCents ?? booking.amountCents,
    })
    .where(eq(bookings.id, booking.id));

  await db.insert(payments).values({
    userId: booking.userId,
    bookingId: booking.id,
    kind: "ticket",
    amountCents: opts.amountCents ?? booking.amountCents,
    currency: "usd",
    status: "succeeded",
    stripePaymentIntentId: opts.paymentIntentId ?? null,
    stripeCheckoutSessionId: opts.checkoutSessionId ?? null,
    receiptUrl: opts.receiptUrl ?? null,
  });

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

export async function failTicketPayment(bookingId: number) {
  const db = await getDb();
  if (!db) return;
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking || booking.status !== "pending_payment") return;
  await releaseHolds(booking.outboundDepartureId, booking.passengerCount);
  if (booking.returnDepartureId) {
    await releaseHolds(booking.returnDepartureId, booking.passengerCount);
  }
  await db
    .update(bookings)
    .set({ status: "canceled", holdExpiresAt: null })
    .where(eq(bookings.id, booking.id));
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
  const [existing] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.stripeSubscriptionId, opts.subscriptionId))
    .limit(1);

  if (existing) {
    await db
      .update(memberships)
      .set({
        status: opts.status,
        stripePriceId: opts.priceId ?? existing.stripePriceId,
        currentPeriodEnd: opts.periodEnd ?? existing.currentPeriodEnd,
        priceCentsSnapshot: opts.priceCents || existing.priceCentsSnapshot,
      })
      .where(eq(memberships.id, existing.id));
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
    const [existingPay] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripeCheckoutSessionId, opts.checkoutSessionId))
      .limit(1);
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
      body: "Your Metro Pro Member subscription is active. Member fare $125 applies at checkout.",
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
