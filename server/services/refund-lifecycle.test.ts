import { beforeEach, describe, expect, it, vi } from "vitest";
import { bookings, departures, passengers, payments, refunds, tickets, users } from "../../drizzle/schema";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), create: vi.fn(), retrieve: vi.fn(), list: vi.fn(), notify: vi.fn() }));
vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("../stripe/client", () => ({ getStripe: () => ({ refunds: {
  create: mocks.create, retrieve: mocks.retrieve, list: mocks.list,
} }), stripeEnabled: () => true }));
vi.mock("./notifications", () => ({ notify: mocks.notify, TEMPLATES: { refund: "refund" } }));
import { beginBookingRefund, beginLatePaymentRefund, normalizedRefundStatus,
  reconcilePendingRefunds, submitRefundIntent } from "./refund-lifecycle";

function store() {
  const refundRows: Record<string, any>[] = [];
  const payment: Record<string, any> = { id: 2, bookingId: 3, amountCents: 30000, status: "succeeded", stripePaymentIntentId: "pi_test" };
  const booking: Record<string, any> = { id: 3, bookingNumber: "TEST-BOOKING", userId: 5, status: "confirmed",
    stripePaymentIntentId: "pi_test", outboundDepartureId: 31, returnDepartureId: null, passengerCount: 2,
    outboundFrontSeats: 0, returnFrontSeats: 0 };
  const people: Record<string, any>[] = [{ id: 11, bookingId: 3, departureId: 31, seatNumber: "2A" }];
  const issued: Record<string, any>[] = [{ id: 7, bookingId: 3, status: "booked" }];
  const manager = { id: 9, role: "admin" };
  const rows = (table: unknown) => table === refunds ? refundRows : table === payments ? [payment]
    : table === bookings ? [booking] : table === users ? [manager] : table === passengers ? people
    : table === tickets ? issued : table === departures ? [{ id: 31 }] : [];
  const tx = {
    select: () => ({ from: (table: unknown) => {
      const found = rows(table);
      const query = { where: () => query, orderBy: () => query, limit: () => query,
        for: async () => found.slice(0, 1), then: (resolve: (result: unknown) => unknown) => Promise.resolve(found).then(resolve) };
      return query;
    } }),
    insert: (table: unknown) => ({ values: async (value: Record<string, any>) => {
      if (table !== refunds) throw new Error("Unexpected insert in refund test");
      refundRows.push({ id: refundRows.length + 1, createdAt: new Date(), updatedAt: new Date(),
        stripeRefundId: null, failureReason: null, ...value });
      return { insertId: refundRows.length };
    } }),
    update: (table: unknown) => ({ set: (changes: Record<string, any>) => ({ where: async () => {
      for (const row of rows(table)) Object.assign(row, changes);
    } }) }),
    execute: vi.fn().mockResolvedValue({ affectedRows: 1 }),
  };
  const db = { select: tx.select, insert: tx.insert, update: tx.update,
    transaction: vi.fn(async (callback: (arg: typeof tx) => Promise<unknown>) => callback(tx)) };
  mocks.getDb.mockResolvedValue(db);
  return { refundRows, payment, booking, people, issued, tx, db };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ id: "re_test", status: "succeeded", amount: 30000, failure_reason: null });
  mocks.list.mockResolvedValue({ data: [] });
});
describe("durable Stripe refund finality", () => {
  it("normalizes provider statuses without treating asynchronous processing as complete", () => {
    expect(normalizedRefundStatus("succeeded")).toBe("succeeded");
    expect(normalizedRefundStatus("pending")).toBe("pending");
    expect(normalizedRefundStatus("requires_action")).toBe("pending");
    expect(normalizedRefundStatus("failed")).toBe("failed");
    expect(normalizedRefundStatus("canceled")).toBe("failed");
  });
  it("voids travel and persists intent before invoking Stripe, then finalizes a successful refund", async () => {
    const state = store();
    const intent = await beginBookingRefund({ bookingId: 3, paymentId: 2, paymentIntentId: "pi_test", reason: "synthetic" });
    expect(state.booking.status).toBe("canceled");
    expect(state.payment.status).toBe("succeeded");
    expect(state.refundRows[0].status).toBe("pending");
    expect(state.refundRows[0].stripeRefundId).toBeNull();
    expect(state.people[0].seatNumber).toBeNull();
    expect(state.issued[0].status).toBe("voided");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(await submitRefundIntent(intent.intentId)).toBe("succeeded");
    expect(state.booking.status).toBe("refunded");
    expect(state.payment.status).toBe("refunded");
    expect(state.refundRows[0].stripeRefundId).toBe("re_test");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { metropro_refund_id: "1", booking_id: "3" },
    }), { idempotencyKey: "metropro-booking-refund-3" });
  });
  it("leaves a charged, canceled booking pending until Stripe actually returns money", async () => {
    const state = store();
    const intent = await beginBookingRefund({ bookingId: 3, paymentId: 2, paymentIntentId: "pi_test", reason: "synthetic" });
    mocks.create.mockResolvedValue({ id: "re_test", status: "pending", amount: 30000 });
    expect(await submitRefundIntent(intent.intentId)).toBe("pending");
    expect(state.refundRows[0].status).toBe("pending");
    expect(state.payment.status).toBe("succeeded");
    expect(state.booking.status).toBe("canceled");
  });
  it("recovers Stripe success after a post-provider database failure using the pre-committed intent metadata", async () => {
    const state = store();
    const intent = await beginBookingRefund({ bookingId: 3, paymentId: 2, paymentIntentId: "pi_test", reason: "synthetic" });
    state.db.transaction.mockRejectedValueOnce(new Error("DB temporarily unavailable after Stripe accepted refund"));
    await expect(submitRefundIntent(intent.intentId)).rejects.toThrow(/after Stripe/);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(state.booking.status).toBe("canceled");
    expect(state.refundRows[0].status).toBe("pending");
    expect(state.refundRows[0].stripeRefundId).toBeNull();
    mocks.list.mockResolvedValue({ data: [{ id: "re_test", amount: 30000, status: "succeeded", metadata: { metropro_refund_id: "1" } }] });
    expect(await reconcilePendingRefunds(true)).toBe(1);
    expect(state.refundRows[0].stripeRefundId).toBe("re_test");
    expect(state.payment.status).toBe("refunded");
    expect(state.booking.status).toBe("refunded");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("records an immediate failed late refund as a captured payment and alerts staff", async () => {
    const state = store();
    state.booking.status = "canceled";
    state.payment.status = "failed";
    const intent = await beginLatePaymentRefund({ bookingId: 3, paymentIntentId: "pi_test", amountCents: 30000 });
    expect(state.payment.status).toBe("succeeded");
    expect(state.refundRows[0].status).toBe("pending");
    mocks.create.mockResolvedValue({ id: "re_failed", status: "failed", amount: 30000, failure_reason: "expired_or_canceled_card" });
    expect(await submitRefundIntent(intent.intentId)).toBe("failed");
    expect(state.refundRows[0].status).toBe("failed");
    expect(state.refundRows[0].failureReason).toBe("expired_or_canceled_card");
    expect(state.booking.status).toBe("canceled");
    expect(state.payment.status).toBe("succeeded");
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, title: expect.stringMatching(/Refund failed/) }));
  });
});
