import { beforeEach, describe, expect, it, vi } from "vitest";
import { bookings, departures, passengers, payments, tickets } from "../../drizzle/schema";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), notify: vi.fn() }));
vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("./notifications", () => ({ TEMPLATES: { booking_confirmation: "booking_confirmation", payment_confirmation: "payment_confirmation" }, notify: mocks.notify }));
import { failTicketPayment, fulfillTicketPayment } from "./fulfillment";

type Row = Record<string, any>;
function testStore() {
  const booking: Row = { id: 91, bookingNumber: "MPTEST91", status: "pending_payment", userId: null,
    outboundDepartureId: 31, returnDepartureId: null, passengerCount: 2, outboundFrontSeats: 0, returnFrontSeats: 0,
    amountCents: 30000, stripeCheckoutSessionId: "cs_test", stripePaymentIntentId: null,
    holdExpiresAt: new Date(Date.now() + 30 * 60_000) };
  const people: Row[] = [
    { id: 1, bookingId: 91, departureId: 31, seatNumber: "2A", outboundSeatType: "standard", returnSeatType: null },
    { id: 2, bookingId: 91, departureId: 31, seatNumber: "2B", outboundSeatType: "standard", returnSeatType: null },
  ];
  const issued: Row[] = [];
  const recorded: Row[] = [{ id: 71, bookingId: 91, status: "pending", amountCents: 30000, stripePaymentIntentId: null,
    stripeCheckoutSessionId: "cs_test", receiptUrl: null }];
  let holdConversions = 0;
  let holdReleases = 0;
  function rows(table: unknown): Row[] {
    if (table === bookings) return [booking];
    if (table === departures) return [{ id: booking.outboundDepartureId }];
    if (table === passengers) return people;
    if (table === tickets) return issued;
    if (table === payments) return recorded;
    throw new Error("Unexpected table in fulfillment test");
  }
  const tx = {
    select: () => ({ from: (table: unknown) => ({ where: () => {
      const found = rows(table);
      const query = { limit: () => query, for: async () => found.slice(0, 1),
        then: (resolve: (found: Row[]) => unknown) => Promise.resolve(found).then(resolve) };
      return query;
    } }) }),
    execute: async (query: { queryChunks?: unknown[] }) => {
      // The service uses one atomic conditional UPDATE for paid conversion and a
      // distinct UPDATE for terminal failure release. No SQL is sent to MySQL.
      const sqlText = JSON.stringify(query.queryChunks ?? []);
      if (sqlText.includes("seatsSold")) holdConversions += 1;
      else holdReleases += 1;
      return { affectedRows: 1 };
    },
    update: (table: unknown) => ({ set: (changes: Row) => ({ where: async () => { for (const row of rows(table)) Object.assign(row, changes); } }) }),
    insert: (table: unknown) => ({ values: async (value: Row) => {
      if (table === tickets) issued.push({ id: issued.length + 1, ...value });
      else if (table === payments) recorded.push({ id: recorded.length + 71, ...value });
      else throw new Error("Unexpected insert in fulfillment test");
      return { insertId: issued.length };
    } }),
  };
  mocks.getDb.mockResolvedValue({ transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx) });
  return { booking, people, issued, recorded, get holdConversions() { return holdConversions; }, get holdReleases() { return holdReleases; } };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("paid ticket and numbered-seat lifecycle", () => {
  it("confirms exactly one booking, records one succeeded payment and issues two distinct real QR tickets", async () => {
    const store = testStore();
    const result = await fulfillTicketPayment({ bookingId: 91, paymentIntentId: "pi_test", amountCents: 30000 });
    expect(result).toBe("confirmed");
    expect(store.booking.status).toBe("confirmed");
    expect(store.booking.holdExpiresAt).toBeNull();
    expect(store.recorded).toHaveLength(1);
    expect(store.recorded[0].status).toBe("succeeded");
    expect(store.recorded[0].stripePaymentIntentId).toBe("pi_test");
    expect(store.issued).toHaveLength(2);
    expect(store.issued.map(ticket => ticket.passengerId).sort()).toEqual([1, 2]);
    expect(new Set(store.issued.map(ticket => ticket.qrToken)).size).toBe(2);
    expect(store.issued.every(ticket => ticket.departureId === 31 && ticket.status === "booked")).toBe(true);
    expect(store.holdConversions).toBe(1);
    expect(mocks.notify).not.toHaveBeenCalled(); // A guest has no app-notification recipient.
  });
  it("does not duplicate tickets, conversion or payments when Checkout and PaymentIntent webhooks both arrive", async () => {
    const store = testStore();
    expect(await fulfillTicketPayment({ bookingId: 91, checkoutSessionId: "cs_test", amountCents: 30000 })).toBe("confirmed");
    expect(await fulfillTicketPayment({ bookingId: 91, paymentIntentId: "pi_test", receiptUrl: "https://pay.stripe.com/receipts/test" })).toBe("already_confirmed");
    expect(store.issued).toHaveLength(2);
    expect(store.recorded).toHaveLength(1);
    expect(store.recorded[0].stripePaymentIntentId).toBe("pi_test");
    expect(store.recorded[0].receiptUrl).toBe("https://pay.stripe.com/receipts/test");
    expect(store.holdConversions).toBe(1);
    store.booking.status = "refunded";
    expect(await fulfillTicketPayment({ bookingId: 91, paymentIntentId: "pi_test" })).toBe("already_refunded");
    expect(store.issued).toHaveLength(2);
  });
  it("marks a terminally failed unpaid checkout failed and releases its selected seat numbers", async () => {
    const store = testStore();
    await failTicketPayment(91);
    expect(store.booking.status).toBe("canceled");
    expect(store.recorded[0].status).toBe("failed");
    expect(store.people.every(person => person.seatNumber === null && person.departureId === null)).toBe(true);
    expect(store.holdReleases).toBe(1);
    expect(await fulfillTicketPayment({ bookingId: 91, paymentIntentId: "pi_too_late" })).toBe("unavailable");
    expect(store.issued).toHaveLength(0);
  });
  it("rejects a paid event after the hold deadline even if the expiry worker has not run", async () => {
    const store = testStore();
    store.booking.holdExpiresAt = new Date(Date.now() - 1000);
    expect(await fulfillTicketPayment({ bookingId: 91, paymentIntentId: "pi_late" })).toBe("unavailable");
    expect(store.booking.status).toBe("canceled");
    expect(store.recorded[0].status).toBe("failed");
    expect(store.holdReleases).toBe(1);
    expect(store.issued).toHaveLength(0);
    expect(store.people.every(person => person.seatNumber === null)).toBe(true);
  });
});
