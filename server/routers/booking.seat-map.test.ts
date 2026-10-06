import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const seatAvailabilityMock = vi.hoisted(() => vi.fn());
vi.mock("../services/seat-inventory", () => ({ getSeatAvailability: seatAvailabilityMock }));

import { bookingRouter } from "./booking";

const guest = bookingRouter.createCaller({
  req: { ip: "203.0.113.42" } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
  user: null,
});

describe("public booking.getSeatMap", () => {
  it("returns only seat identity, type, state and price to an unauthenticated guest", async () => {
    seatAvailabilityMock.mockResolvedValueOnce([{
      seatNumber: "1A", seatType: "standard", status: "held", priceCents: 15000,
      passengerName: "Private Name", bookingId: 99,
    }]);
    const result = await guest.getSeatMap({ departureId: 7 });
    expect(seatAvailabilityMock).toHaveBeenCalledWith(7);
    expect(result).toEqual([{ seatNumber: "1A", seatType: "standard", status: "held", priceCents: 15000 }]);
  });

  it("rejects non-positive departure IDs before querying seat assignments", async () => {
    seatAvailabilityMock.mockClear();
    await expect(guest.getSeatMap({ departureId: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(seatAvailabilityMock).not.toHaveBeenCalled();
  });
});
