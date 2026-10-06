import { describe, expect, it } from "vitest";
import { selectedLegIsAvailable } from "./PassengerInfo";

const seats = [
  { seatNumber: "1A", seatType: "standard" as const, status: "available" as const },
  { seatNumber: "2A", seatType: "standard" as const, status: "available" as const },
  { seatNumber: "Front", seatType: "front" as const, status: "available" as const },
];
const travelers = [
  { firstName: "One", lastName: "Traveler", outboundSeatType: "standard" as const, returnSeatType: "front" as const, seatNumber: "1A", returnSeatNumber: "Front", isMemberTraveler: true },
  { firstName: "Two", lastName: "Traveler", outboundSeatType: "standard" as const, returnSeatType: "standard" as const, seatNumber: "2A", returnSeatNumber: "2A", isMemberTraveler: false },
];

describe("PassengerInfo per-leg seat requirements", () => {
  it("requires a distinct, available, correctly typed seat for each traveler on both legs", () => {
    expect(selectedLegIsAvailable(travelers, seats, "outbound")).toBe(true);
    expect(selectedLegIsAvailable(travelers, seats, "return")).toBe(true);
    expect(selectedLegIsAvailable(travelers, undefined, "outbound")).toBe(false);
    expect(selectedLegIsAvailable([{ ...travelers[0], seatNumber: undefined }, travelers[1]], seats, "outbound")).toBe(false);
    expect(selectedLegIsAvailable([{ ...travelers[0], seatNumber: "2A" }, travelers[1]], seats, "outbound")).toBe(false);
    expect(selectedLegIsAvailable([{ ...travelers[0], returnSeatNumber: undefined }, travelers[1]], seats, "return")).toBe(false);
  });

  it("refuses an unavailable seat, a seat outside the map, and a front/regular mismatch", () => {
    const taken = seats.map(seat => seat.seatNumber === "1A" ? { ...seat, status: "taken" as const } : seat);
    const held = seats.map(seat => seat.seatNumber === "Front" ? { ...seat, status: "held" as const } : seat);
    expect(selectedLegIsAvailable(travelers, taken, "outbound")).toBe(false);
    expect(selectedLegIsAvailable(travelers, held, "return")).toBe(false);
    expect(selectedLegIsAvailable([{ ...travelers[0], seatNumber: "9Z" }, travelers[1]], seats, "outbound")).toBe(false);
    expect(selectedLegIsAvailable([{ ...travelers[0], outboundSeatType: "front" }, travelers[1]], seats, "outbound")).toBe(false);
  });
});
