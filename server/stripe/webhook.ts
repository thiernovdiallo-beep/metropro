import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { memberships, processedStripeEvents } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  failTicketPayment,
  fulfillTicketPayment,
  setStripeCustomer,
  upsertMembershipFromSubscription,
} from "../services/fulfillment";
import { beginLatePaymentRefund, submitRefundIntent } from "../services/refund-lifecycle";
import { TEMPLATES, notify } from "../services/notifications";
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
  if (!db) throw new Error("Database unavailable while checking Stripe event deduplication");
  const [row] = await db
    .select()
    .from(processedStripeEvents)
    .where(eq(processedStripeEvents.eventId, eventId))
    .limit(1);
  return Boolean(row);
}

async function markProcessed(eventId: string, type: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable while recording Stripe event");
  await db
    .insert(processedStripeEvents)
    .values({ eventId, type, processedAt: new Date() })
    .onDuplicateKeyUpdate({ set: { type } });
}

function periodEnd(sub: Stripe.Subscription): Date | null {
  const end = sub.items.data[0]?.current_period_end ??
    (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
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
  if (!opts.amountCents || opts.amountCents <= 0) throw new Error("Captured payment amount is missing for expired booking refund");
  const intent = await beginLatePaymentRefund({ bookingId: opts.bookingId,
    paymentIntentId: opts.paymentIntentId, checkoutSessionId: opts.checkoutSessionId,
    amountCents: opts.amountCents });
  const refundStatus = await submitRefundIntent(intent.intentId);
  if (intent.userId !== null && refundStatus === "pending") {
    try { await notify({ userId: intent.userId, templateKey: TEMPLATES.refund,
      title: "Refund processing — selected seats expired",
      body: `Booking ${intent.bookingNumber} could not be confirmed because its seat hold expired. Stripe has not yet confirmed that money was returned.`,
      payload: { bookingId: opts.bookingId } }); }
    catch (error) { console.warn("[webhook] Customer notice unavailable", error instanceof Error ? error.name : "unknown"); }
  }
}

async function handleEvent(event: Stripe.Event) {
  if (await alreadyProcessed(event.id)) return;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable while processing Stripe event");
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
            // A hosted Checkout URL is not a receipt; the succeeded
            // PaymentIntent event may supply the actual charge receipt.
            receiptUrl: null,
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
        const charge = pi.latest_charge;
        let receiptUrl = charge && typeof charge !== "string" ? charge.receipt_url : null;
        if (!receiptUrl && typeof charge === "string") {
          try { receiptUrl = (await getStripe().charges.retrieve(charge)).receipt_url; }
          catch (error) { console.warn("[Stripe webhook] Charge receipt unavailable", error instanceof Error ? error.name : "unknown"); }
        }
        await settlePaidTicket({
          bookingId,
          paymentIntentId: pi.id,
          amountCents: pi.amount_received || pi.amount,
          receiptUrl,
        });
      }
      break;
    }
    case "payment_intent.payment_failed": {
      // Card decline is not terminal: the same open Checkout session allows
      // another card. Keep its booked seats until session.expired or the
      // asynchronous payment explicitly fails.
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
