import { describe, expect, it } from "vitest";
import { validateNumberedSeats } from "./seat-selection";
import type { SeatAvailability } from "./seat-inventory";

const seats: SeatAvailability[] = [
  { seatNumber: "1A", seatType: "standard", status: "available", priceCents: 15000 },
  { seatNumber: "2A", seatType: "standard", status: "held", priceCents: 15000 },
  { seatNumber: "3A", seatType: "standard", status: "taken", priceCents: 15000 },
  { seatNumber: "Front", seatType: "front", status: "available", priceCents: 20000 },
];
const passenger = (seatNumber?: string, returnSeatNumber?: string) => ({
  firstName: "Test", lastName: "Traveler", outboundSeatType: "standard" as const,
  returnSeatType: "front" as const, isMemberTraveler: false, seatNumber, returnSeatNumber,
});

describe("numbered seat validation", () => {
  it("permits chosen available seats alongside legacy unnumbered passengers", () => {
    expect(() => validateNumberedSeats(seats, [passenger("1A"), passenger()], "outbound")).not.toThrow();
    expect(() => validateNumberedSeats(seats, [passenger(undefined, "Front")], "return")).not.toThrow();
  });
  it("rejects seats outside the layout and duplicate choices", () => {
    expect(() => validateNumberedSeats(seats, [passenger("9Z")], "outbound")).toThrow(/not in this vehicle/);
    expect(() => validateNumberedSeats(seats, [passenger("1A"), passenger("1A")], "outbound")).toThrow(/more than once/);
  });
  it("rejects seat types that do not match the fare paid for each leg", () => {
    expect(() => validateNumberedSeats(seats, [passenger("Front")], "outbound")).toThrow(/fare type/);
    expect(() => validateNumberedSeats(seats, [passenger(undefined, "1A")], "return")).toThrow(/fare type/);
  });
  it("rejects active holds and taken seats", () => {
    expect(() => validateNumberedSeats(seats, [passenger("2A")], "outbound")).toThrow(/no longer available/);
    expect(() => validateNumberedSeats(seats, [passenger("3A")], "outbound")).toThrow(/no longer available/);
  });
});
