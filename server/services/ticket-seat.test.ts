import { describe, expect, it } from "vitest";
import { seatNumberForTicket } from "./ticket-seat";

const passenger = {
  departureId: 12,
  seatNumber: "2A",
  returnDepartureId: 19,
  returnSeatNumber: "2B",
};

describe("ticket physical seat", () => {
  it("matches outbound ticket to its outbound passenger assignment", () => {
    expect(seatNumberForTicket({ departureId: 12 }, passenger)).toBe("2A");
  });
  it("matches return ticket to its separate return assignment", () => {
    expect(seatNumberForTicket({ departureId: 19 }, passenger)).toBe("2B");
  });
  it("does not leak a number from a different departure", () => {
    expect(seatNumberForTicket({ departureId: 20 }, passenger)).toBeNull();
  });
  it("keeps legacy unnumbered tickets and missing passenger data safe", () => {
    expect(seatNumberForTicket({ departureId: 12 }, { ...passenger, seatNumber: null })).toBeNull();
    expect(seatNumberForTicket({ departureId: 12 }, null)).toBeNull();
  });
});
