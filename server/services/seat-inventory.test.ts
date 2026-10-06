import { describe, expect, it } from "vitest";
import { getSeatAvailability, seatStatusForBooking } from "./seat-inventory";

const now = new Date("2026-10-06T12:00:00.000Z");

describe("per-seat booking status", () => {
  it("treats a confirmed paid booking as taken", () => {
    expect(seatStatusForBooking("confirmed", null, now)).toBe("taken");
  });

  it("holds a seat only while its pending payment hold has not expired", () => {
    expect(seatStatusForBooking("pending_payment", new Date("2026-10-06T12:01:00.000Z"), now)).toBe("held");
    expect(seatStatusForBooking("pending_payment", new Date("2026-10-06T12:00:00.000Z"), now)).toBe("available");
    expect(seatStatusForBooking("pending_payment", new Date("2026-10-06T11:59:00.000Z"), now)).toBe("available");
    expect(seatStatusForBooking("pending_payment", null, now)).toBe("available");
  });

  it("releases canceled and refunded bookings in the read-only availability view", () => {
    expect(seatStatusForBooking("canceled", null, now)).toBe("available");
    expect(seatStatusForBooking("refunded", null, now)).toBe("available");
  });

  it("rejects malformed departure IDs before touching the database", async () => {
    await expect(getSeatAvailability(0)).rejects.toThrow("Invalid departure ID");
    await expect(getSeatAvailability(1.5)).rejects.toThrow("Invalid departure ID");
  });
});
