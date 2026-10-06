import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { bookings, passengers, payments, refunds, tickets, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { insertId } from "../lib/mysql";
import { getStripe, stripeEnabled } from "../stripe/client";
import { inventoryTransaction, lockDepartureInventory } from "./inventory";
import { TEMPLATES, notify } from "./notifications";

export type RefundStatus = "pending" | "succeeded" | "failed";
export function normalizedRefundStatus(status: string | null): RefundStatus {
  if (status === "succeeded") return "succeeded";
  if (status === "failed" || status === "canceled") return "failed";
  return "pending";
}

async function alertRefundPending(intent: { intentId: number; bookingNumber: string; userId: number | null }) {
  if (intent.userId !== null) {
    try { await notify({ userId: intent.userId, templateKey: TEMPLATES.refund,
      title: "Refund request saved", body: `Trip ${intent.bookingNumber} was canceled. Your refund request is processing; Stripe has not confirmed that money was returned.`,
      payload: { refundId: intent.intentId } }); }
    catch (error) { console.warn("[refunds] Customer pending notice unavailable", error instanceof Error ? error.name : "unknown"); }
  }
  try {
    const db = await getDb();
    if (!db) return;
    const managers = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(10);
    for (const manager of managers) {
      try { await notify({ userId: manager.id, templateKey: TEMPLATES.refund,
        title: "Refund processing — monitor Stripe", body: `Booking ${intent.bookingNumber} has a pending refund request. Review Payments if it does not complete.`,
        payload: { refundId: intent.intentId } }); }
      catch (error) { console.warn("[refunds] Manager pending notice unavailable", error instanceof Error ? error.name : "unknown"); }
    }
  } catch (error) { console.warn("[refunds] Pending alert lookup unavailable", error instanceof Error ? error.name : "unknown"); }
}

/** The booking and payment remain linked to this durable refund intent before
 * any irreversible Stripe call. Pending/failed refunds never show as repaid. */
export async function beginBookingRefund(opts: {
  bookingId: number; paymentId: number; paymentIntentId: string; reason: string; adminUserId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable before refund request");
  const intent = await inventoryTransaction(db, async tx => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, opts.bookingId)).limit(1).for("update");
    if (!booking || booking.status !== "confirmed" || booking.stripePaymentIntentId !== opts.paymentIntentId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Booking is not eligible for a new refund" });
    }
    const [existing] = await tx.select({ id: refunds.id }).from(refunds).where(eq(refunds.bookingId, booking.id)).limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "Refund already requested; check Payments" });
    const [payment] = await tx.select().from(payments).where(eq(payments.id, opts.paymentId)).limit(1).for("update");
    if (!payment || payment.bookingId !== booking.id || payment.status !== "succeeded") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A successful ticket charge is required before refunding" });
    }
    await lockDepartureInventory(tx, [booking.outboundDepartureId, booking.returnDepartureId]);
    const restore = (id: number, front: number) => tx.execute(sql`
      UPDATE departures SET seatsSold = GREATEST(seatsSold - ${booking.passengerCount}, 0),
        frontSeatsSold = GREATEST(frontSeatsSold - ${front}, 0) WHERE id = ${id}`);
    await restore(booking.outboundDepartureId, booking.outboundFrontSeats);
    if (booking.returnDepartureId) await restore(booking.returnDepartureId, booking.returnFrontSeats);
    await tx.update(passengers).set({ departureId: null, seatNumber: null, returnDepartureId: null, returnSeatNumber: null })
      .where(eq(passengers.bookingId, booking.id));
    await tx.update(tickets).set({ status: "voided" }).where(eq(tickets.bookingId, booking.id));
    await tx.update(bookings).set({ status: "canceled" }).where(eq(bookings.id, booking.id));
    const created = await tx.insert(refunds).values({ paymentId: payment.id, bookingId: booking.id,
      amountCents: payment.amountCents, reason: opts.reason, adminUserId: opts.adminUserId ?? null, status: "pending" });
    return { intentId: insertId(created), bookingNumber: booking.bookingNumber, userId: booking.userId };
  });
  await alertRefundPending(intent);
  return intent;
}

/** A late captured payment has already lost its seat hold. Persist that fact
 * and a refund intent before asking Stripe to send the money back. */
export async function beginLatePaymentRefund(opts: {
  bookingId: number; paymentIntentId: string; checkoutSessionId?: string | null; amountCents: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable before late-payment refund");
  const intent = await db.transaction(async tx => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, opts.bookingId)).limit(1).for("update");
    if (!booking || booking.status !== "canceled") throw new Error("Cannot refund an unavailable booking without its canceled record");
    const [existing] = await tx.select({ id: refunds.id }).from(refunds).where(eq(refunds.bookingId, booking.id)).limit(1);
    if (existing) return { intentId: existing.id, bookingNumber: booking.bookingNumber, userId: booking.userId, created: false };
    const [payment] = await tx.select().from(payments).where(eq(payments.bookingId, booking.id)).limit(1);
    let paymentId = payment?.id;
    if (payment) await tx.update(payments).set({ status: "succeeded", amountCents: opts.amountCents,
      stripePaymentIntentId: opts.paymentIntentId,
      stripeCheckoutSessionId: opts.checkoutSessionId ?? payment.stripeCheckoutSessionId }).where(eq(payments.id, payment.id));
    else {
      const result = await tx.insert(payments).values({ bookingId: booking.id, userId: booking.userId,
        kind: "ticket", amountCents: opts.amountCents, currency: "usd", status: "succeeded",
        stripePaymentIntentId: opts.paymentIntentId, stripeCheckoutSessionId: opts.checkoutSessionId ?? booking.stripeCheckoutSessionId });
      paymentId = insertId(result);
    }
    await tx.update(bookings).set({ stripePaymentIntentId: opts.paymentIntentId,
      amountCents: opts.amountCents, holdExpiresAt: null }).where(eq(bookings.id, booking.id));
    const created = await tx.insert(refunds).values({ paymentId: paymentId!, bookingId: booking.id,
      amountCents: opts.amountCents, reason: "payment_after_hold_expired", status: "pending" });
    return { intentId: insertId(created), bookingNumber: booking.bookingNumber, userId: booking.userId, created: true };
  });
  if (intent.created) await alertRefundPending(intent);
  return intent;
}

async function alertRefundFailure(bookingNumber: string, bookingId: number | null, refundId: number) {
  const db = await getDb();
  if (!db) return;
  const managers = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(10);
  for (const manager of managers) {
    try { await notify({ userId: manager.id, templateKey: TEMPLATES.refund,
      title: "Refund failed — staff review required",
      body: `A Stripe refund for booking ${bookingNumber} failed or was incomplete. Check Payments and Stripe before contacting the customer.`,
      payload: { bookingId, refundId } }); }
    catch (error) { console.warn("[refunds] Manager notice unavailable", error instanceof Error ? error.name : "unknown"); }
  }
}

async function finalizeRefundIntent(intentId: number, result: Stripe.Refund) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable after Stripe refund; durable intent will be reconciled");
  const [intent] = await db.select().from(refunds).where(eq(refunds.id, intentId)).limit(1);
  if (!intent) throw new Error("Durable refund intent is missing");
  const stripeStatus = normalizedRefundStatus(result.status);
  const status = stripeStatus === "succeeded" && result.amount !== intent.amountCents ? "failed" : stripeStatus;
  const failureReason = status === "failed" ? (result.amount !== intent.amountCents ? "Stripe returned an incomplete refund amount" : result.failure_reason ?? "Stripe reported refund failure") : null;
  const owner = await db.transaction(async tx => {
    const [current] = await tx.select().from(refunds).where(eq(refunds.id, intentId)).limit(1).for("update");
    if (!current) throw new Error("Refund intent vanished");
    if (current.status !== "pending") return null;
    const [booking] = current.bookingId ? await tx.select().from(bookings).where(eq(bookings.id, current.bookingId)).limit(1).for("update") : [null];
    await tx.update(refunds).set({ stripeRefundId: result.id, status, failureReason }).where(eq(refunds.id, intentId));
    if (status === "succeeded") {
      await tx.update(payments).set({ status: "refunded" }).where(eq(payments.id, current.paymentId));
      if (booking?.status === "canceled") await tx.update(bookings).set({ status: "refunded" }).where(eq(bookings.id, booking.id));
    }
    return booking;
  });
  if (status === "failed" && owner) {
    await alertRefundFailure(owner.bookingNumber, owner.id, intentId);
    if (owner.userId !== null) {
      try { await notify({ userId: owner.userId, templateKey: TEMPLATES.refund,
        title: "Refund needs support review", body: `Stripe could not complete the refund for booking ${owner.bookingNumber}. Please contact Metro Pro support; your trip remains canceled.`,
        payload: { bookingId: owner.id, refundId: intentId } }); }
      catch (error) { console.warn("[refunds] Customer failure notice unavailable", error instanceof Error ? error.name : "unknown"); }
    }
  }
  if (status === "succeeded" && owner?.userId) {
    try { await notify({ userId: owner.userId, templateKey: TEMPLATES.refund,
      title: "Refund completed", body: `Stripe confirmed the refund for booking ${owner.bookingNumber}.`,
      payload: { bookingId: owner.id } }); }
    catch (error) { console.warn("[refunds] Customer notice unavailable", error instanceof Error ? error.name : "unknown"); }
  }
  return status;
}

/** Stable idempotency key + persisted refund-record metadata let the worker
 * recover even if Stripe succeeds while the response or DB commit is lost. */
export async function submitRefundIntent(intentId: number): Promise<RefundStatus> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable before Stripe refund");
  const [intent] = await db.select().from(refunds).where(eq(refunds.id, intentId)).limit(1);
  if (!intent || !intent.bookingId) throw new Error("Refund intent not found");
  if (intent.status !== "pending") return intent.status;
  const [payment] = await db.select().from(payments).where(eq(payments.id, intent.paymentId)).limit(1);
  if (!payment?.stripePaymentIntentId) throw new Error("Captured Stripe payment ID is missing from refund intent");
  const key = intent.reason === "payment_after_hold_expired"
    ? `metropro-expired-${intent.bookingId}-${payment.stripePaymentIntentId}`
    : `metropro-booking-refund-${intent.bookingId}`;
  const refund = await getStripe().refunds.create({ payment_intent: payment.stripePaymentIntentId,
    metadata: { metropro_refund_id: String(intent.id), booking_id: String(intent.bookingId) } },
    { idempotencyKey: key });
  return finalizeRefundIntent(intent.id, refund);
}

let running: Promise<number> | null = null;
let lastCheckedAt = 0;
export async function reconcilePendingRefunds(force = false): Promise<number> {
  if (!stripeEnabled()) return 0;
  if (running) return running;
  if (!force && Date.now() - lastCheckedAt < 30_000) return 0;
  running = reconcile().finally(() => { running = null; lastCheckedAt = Date.now(); });
  return running;
}

async function reconcile(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable while reconciling refunds");
  const pending = await db.select().from(refunds).where(eq(refunds.status, "pending"))
    .orderBy(asc(refunds.updatedAt)).limit(30);
  let updated = 0;
  for (const row of pending) {
    try {
      let providerRefund: Stripe.Refund | undefined;
      if (row.stripeRefundId) providerRefund = await getStripe().refunds.retrieve(row.stripeRefundId);
      else {
        const [payment] = await db.select({ stripePaymentIntentId: payments.stripePaymentIntentId })
          .from(payments).where(eq(payments.id, row.paymentId)).limit(1);
        if (payment?.stripePaymentIntentId) {
          const listed = await getStripe().refunds.list({ payment_intent: payment.stripePaymentIntentId, limit: 100 });
          providerRefund = listed.data.find(refund => refund.metadata?.metropro_refund_id === String(row.id));
        }
        // Permit the original API call to finish, then safely retry the exact
        // same idempotency key if no matching Stripe refund was discoverable.
        if (!providerRefund && Date.now() - row.createdAt.getTime() > 60_000) {
          const status = await submitRefundIntent(row.id);
          if (status !== "pending") updated += 1;
          continue;
        }
      }
      if (providerRefund) {
        const status = await finalizeRefundIntent(row.id, providerRefund);
        if (status !== "pending") updated += 1;
      }
      await db.update(refunds).set({ updatedAt: new Date() }).where(and(eq(refunds.id, row.id), eq(refunds.status, "pending")));
    } catch (error) {
      console.warn("[refunds] Provider reconciliation failed; will retry", error instanceof Error ? error.name : "unknown");
      await db.update(refunds).set({ updatedAt: new Date() }).where(and(eq(refunds.id, row.id), eq(refunds.status, "pending")));
    }
  }
  return updated;
}
