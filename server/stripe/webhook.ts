import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { memberships, processedStripeEvents } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  failTicketPayment,
  fulfillTicketPayment,
  recordLatePaymentRefund,
  setStripeCustomer,
  upsertMembershipFromSubscription,
} from "../services/fulfillment";
import { getSettings } from "../services/policies";
import { getStripe } from "./client";

function mapSubStatus(status: string) {
  if (status === "active" || status === "trialing") return "active" as const;
  if (status === "past_due") return "past_due" as const;
  if (status === "canceled" || status === "incomplete_expired") return "canceled" as const;
  if (status === "unpaid") return "unpaid" as const;
  return "incomplete" as const;
}

async function alreadyProcessed(eventId: string) {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db
    .select()
    .from(processedStripeEvents)
    .where(eq(processedStripeEvents.eventId, eventId))
    .limit(1);
  return Boolean(row);
}

async function markProcessed(eventId: string, type: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(processedStripeEvents)
    .values({ eventId, type, processedAt: new Date() })
    .onDuplicateKeyUpdate({ set: { type } });
}

function periodEnd(sub: Stripe.Subscription): Date | null {
  const end = (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  return end ? new Date(end * 1000) : null;
}

async function settlePaidTicket(opts: {
  bookingId: number;
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  amountCents?: number | null;
  receiptUrl?: string | null;
}) {
  const result = await fulfillTicketPayment(opts);
  if (result === "missing") throw new Error("Paid Stripe ticket has no matching booking");
  if (result !== "unavailable") return;
  if (!opts.paymentIntentId) throw new Error("Cannot refund an expired booking without a payment intent");
  const refund = await getStripe().refunds.create(
    { payment_intent: opts.paymentIntentId },
    { idempotencyKey: `metropro-expired-${opts.bookingId}-${opts.paymentIntentId}` }
  );
  if (refund.status === "failed") throw new Error("Refund failed for payment after expired seat hold");
  await recordLatePaymentRefund({
    bookingId: opts.bookingId,
    paymentIntentId: opts.paymentIntentId,
    checkoutSessionId: opts.checkoutSessionId,
    refundId: refund.id,
    refundedCents: refund.amount,
  });
}

async function handleEvent(event: Stripe.Event) {
  if (await alreadyProcessed(event.id)) return;
  const db = await getDb();
  if (!db) return;
  const settings = await getSettings();

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = Number(session.metadata?.user_id ?? 0);
      if (session.customer && userId) {
        await setStripeCustomer(userId, String(session.customer));
      }
      if (session.mode === "payment") {
        const bookingId = Number(session.metadata?.booking_id ?? session.client_reference_id);
        if (bookingId && session.payment_status === "paid") {
          await settlePaidTicket({
            bookingId,
            paymentIntentId:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id,
            checkoutSessionId: session.id,
            amountCents: session.amount_total ?? null,
            receiptUrl:
              typeof session.invoice === "string"
                ? null
                : (session as Stripe.Checkout.Session).url ?? null,
          });
        }
      }
      if (session.mode === "subscription" && userId && event.type === "checkout.session.completed") {
        const subId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subId) {
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertMembershipFromSubscription({
            userId,
            subscriptionId: sub.id,
            status: mapSubStatus(sub.status),
            priceId: sub.items.data[0]?.price.id ?? null,
            periodEnd: periodEnd(sub),
            priceCents: sub.items.data[0]?.price.unit_amount ?? settings.membershipPriceCents,
            checkoutSessionId: session.id,
          });
        }
      }
      break;
    }
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = Number(pi.metadata?.booking_id ?? 0);
      if (bookingId) {
        await settlePaidTicket({
          bookingId,
          paymentIntentId: pi.id,
          amountCents: pi.amount_received || pi.amount,
          receiptUrl: null,
        });
      }
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = Number(pi.metadata?.booking_id ?? 0);
      if (bookingId) await failTicketPayment(bookingId);
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = Number(session.metadata?.booking_id ?? session.client_reference_id);
      if (bookingId) await failTicketPayment(bookingId);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = Number(sub.metadata?.user_id ?? 0);
      let resolvedUserId = userId;
      if (!resolvedUserId) {
        const [m] = await db
          .select()
          .from(memberships)
          .where(eq(memberships.stripeSubscriptionId, sub.id))
          .limit(1);
        resolvedUserId = m?.userId ?? 0;
      }
      if (resolvedUserId) {
        await upsertMembershipFromSubscription({
          userId: resolvedUserId,
          subscriptionId: sub.id,
          status: mapSubStatus(sub.status),
          priceId: sub.items.data[0]?.price.id ?? null,
          periodEnd: periodEnd(sub),
          priceCents: sub.items.data[0]?.price.unit_amount ?? settings.membershipPriceCents,
        });
      }
      break;
    }
    default:
      break;
  }

  await markProcessed(event.id, event.type);
}

export async function handleStripeWebhookRequest(req: Request, res: Response, _next?: unknown) {
    const signature = req.headers["stripe-signature"];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!signature || !secret) {
      res.status(400).send("Missing stripe signature");
      return;
    }
    const raw = req.body as Buffer;
    try {
      const event = getStripe().webhooks.constructEvent(raw, String(signature), secret);
      await handleEvent(event);
      res.json({ received: true });
    } catch (error) {
      console.error("[Stripe webhook]", error);
      res.status(400).send("Webhook error");
    }
}

export function registerStripeWebhook(app: Express) {
  app.post("/api/stripe/webhook", handleStripeWebhookRequest);
}
