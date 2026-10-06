import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(), getSettings: vi.fn(), getStripe: vi.fn(),
  fulfill: vi.fn(), fail: vi.fn(), beginLate: vi.fn(), submitRefund: vi.fn(), setCustomer: vi.fn(), upsertMember: vi.fn(),
}));
vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("../services/policies", () => ({ getSettings: mocks.getSettings }));
vi.mock("./client", () => ({ getStripe: mocks.getStripe }));
vi.mock("../services/fulfillment", () => ({
  fulfillTicketPayment: mocks.fulfill, failTicketPayment: mocks.fail,
  setStripeCustomer: mocks.setCustomer, upsertMembershipFromSubscription: mocks.upsertMember,
}));
vi.mock("../services/refund-lifecycle", () => ({ beginLatePaymentRefund: mocks.beginLate, submitRefundIntent: mocks.submitRefund }));
vi.mock("../services/notifications", () => ({ TEMPLATES: { refund: "refund" }, notify: vi.fn() }));
import { handleStripeWebhookRequest } from "./webhook";

const oldSecret = process.env.STRIPE_WEBHOOK_SECRET;
afterAll(() => { if (oldSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = oldSecret; });
let currentEvent: Stripe.Event;
let processed: Set<string>;
const refundCreate = vi.fn();
const chargeRetrieve = vi.fn();
function event(id: string, type: string, data: Record<string, unknown>) {
  return { id, type, data: { object: data } } as unknown as Stripe.Event;
}
async function deliver() {
  let code = 200;
  let body: unknown;
  const res = { status(n: number) { code = n; return this; }, send(value: unknown) { body = value; return this; },
    json(value: unknown) { body = value; return this; } } as unknown as Response;
  await handleStripeWebhookRequest({ headers: { "stripe-signature": "test_signature" }, body: Buffer.from("test") } as unknown as Request, res);
  return { code, body };
}

beforeEach(() => {
  vi.clearAllMocks();
  processed = new Set();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_unit_test";
  mocks.getSettings.mockResolvedValue({ membershipPriceCents: 2500 });
  mocks.fulfill.mockResolvedValue("confirmed");
  mocks.beginLate.mockResolvedValue({ intentId: 1, bookingNumber: "TEST", userId: null });
  mocks.submitRefund.mockResolvedValue("succeeded");
  mocks.getDb.mockImplementation(async () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => processed.has(currentEvent.id) ? [{ eventId: currentEvent.id }] : [] }) }) }),
    insert: () => ({ values: (value: { eventId: string }) => ({ onDuplicateKeyUpdate: async () => { processed.add(value.eventId); } }) }),
  }));
  mocks.getStripe.mockReturnValue({ webhooks: { constructEvent: () => currentEvent },
    refunds: { create: refundCreate }, charges: { retrieve: chargeRetrieve } });
  chargeRetrieve.mockResolvedValue({ receipt_url: "https://pay.stripe.com/receipts/charge_1" });
  refundCreate.mockResolvedValue({ id: "re_test", status: "succeeded", amount: 15000 });
});

describe("signed Stripe ticket webhook handling", () => {
  it("fulfills one paid Checkout event and ignores an exact duplicate event", async () => {
    currentEvent = event("evt_paid", "checkout.session.completed", { id: "cs_test", mode: "payment", payment_status: "paid",
      payment_intent: "pi_test", amount_total: 15000, metadata: { booking_id: "91" } });
    expect((await deliver()).code).toBe(200);
    expect((await deliver()).code).toBe(200);
    expect(mocks.fulfill).toHaveBeenCalledTimes(1);
    expect(mocks.fulfill).toHaveBeenCalledWith({ bookingId: 91, paymentIntentId: "pi_test", checkoutSessionId: "cs_test", amountCents: 15000, receiptUrl: null });
  });
  it("handles a separate succeeded PaymentIntent once and stores an authentic receipt", async () => {
    currentEvent = event("evt_intent", "payment_intent.succeeded", { id: "pi_test", amount_received: 15000,
      latest_charge: "ch_test", metadata: { booking_id: "91" } });
    expect((await deliver()).code).toBe(200);
    expect(chargeRetrieve).toHaveBeenCalledWith("ch_test");
    expect(mocks.fulfill).toHaveBeenCalledWith({ bookingId: 91, paymentIntentId: "pi_test", amountCents: 15000,
      receiptUrl: "https://pay.stripe.com/receipts/charge_1" });
  });
  it("keeps a still-open checkout hold after a declined card, then releases it when Checkout expires", async () => {
    currentEvent = event("evt_decline", "payment_intent.payment_failed", { id: "pi_test", metadata: { booking_id: "91" } });
    expect((await deliver()).code).toBe(200);
    expect(mocks.fail).not.toHaveBeenCalled();
    currentEvent = event("evt_expired", "checkout.session.expired", { id: "cs_test", metadata: { booking_id: "91" } });
    expect((await deliver()).code).toBe(200);
    expect(mocks.fail).toHaveBeenCalledTimes(1);
    expect(mocks.fail).toHaveBeenCalledWith(91);
  });
  it("does not issue another refund for a paid webhook arriving after the booking was already refunded", async () => {
    mocks.fulfill.mockResolvedValue("already_refunded");
    currentEvent = event("evt_late", "checkout.session.completed", { id: "cs_test", mode: "payment", payment_status: "paid",
      payment_intent: "pi_test", amount_total: 15000, metadata: { booking_id: "91" } });
    expect((await deliver()).code).toBe(200);
    expect(refundCreate).not.toHaveBeenCalled();
    expect(mocks.beginLate).not.toHaveBeenCalled();
  });
  it("persists a late captured payment before refunding and acknowledges an immediate failed refund for staff review", async () => {
    mocks.fulfill.mockResolvedValue("unavailable");
    mocks.submitRefund.mockResolvedValue("failed");
    currentEvent = event("evt_late_refund_failed", "checkout.session.completed", { id: "cs_test", mode: "payment",
      payment_status: "paid", payment_intent: "pi_test", amount_total: 15000, metadata: { booking_id: "91" } });
    expect((await deliver()).code).toBe(200);
    expect(mocks.beginLate).toHaveBeenCalledWith({ bookingId: 91, paymentIntentId: "pi_test",
      checkoutSessionId: "cs_test", amountCents: 15000 });
    expect(mocks.submitRefund).toHaveBeenCalledWith(1);
    expect(processed.has("evt_late_refund_failed")).toBe(true);
  });
  it("returns an error to Stripe when the database is unavailable, rather than acknowledging and losing the event", async () => {
    mocks.getDb.mockResolvedValue(null);
    currentEvent = event("evt_retry", "checkout.session.expired", { metadata: { booking_id: "91" } });
    const result = await deliver();
    expect(result.code).toBe(400);
    expect(processed.has("evt_retry")).toBe(false);
  });
});
