import { describe, expect, it } from "vitest";
import { getSeatLayout } from "./seat-layout";
import { seatFareCents, validateSeatSelections, type SeatSelection } from "./pricing";
import { validateNumberedSeats } from "./seat-selection";

const fares = { standardFareCents: 15000, memberFareCents: 10000, frontFareCents: 20000 };
const makePassenger = (seatNumber: string): SeatSelection & { seatNumber: string } => ({
  firstName: "Test", lastName: seatNumber, outboundSeatType: seatNumber === "Front" ? "front" : "standard",
  returnSeatType: null, isMemberTraveler: false, seatNumber,
});
const availability = getSeatLayout(11).map(seat => ({
  seatNumber: seat.seatNumber, seatType: seat.seatType, status: "available" as const,
  priceCents: seatFareCents(fares, seat.seatType, false),
}));

describe("eleven-passenger van booking", () => {
  it("accepts all eleven real passenger positions with only one front seat and no driver sale", () => {
    const people = availability.map(seat => makePassenger(seat.seatNumber));
    expect(() => validateSeatSelections(people, false, false, null)).not.toThrow();
    expect(() => validateNumberedSeats(availability, people, "outbound")).not.toThrow();
    expect(availability).toHaveLength(11);
    expect(availability.find(seat => seat.seatNumber === "3M")?.priceCents).toBe(15000);
    expect(availability.find(seat => seat.seatNumber === "Front")?.priceCents).toBe(20000);
    expect(availability.some(seat => seat.seatNumber.toLowerCase() === "driver")).toBe(false);
    expect(() => validateSeatSelections([...people, makePassenger("2A")], false, false, null)).toThrow("between 1 and 11");
  });

  it("rejects a duplicate, unavailable or wrongly priced 3M center seat", () => {
    const center = makePassenger("3M");
    expect(() => validateNumberedSeats(availability, [center, center], "outbound")).toThrow("more than once");
    expect(() => validateNumberedSeats(availability.map(seat => seat.seatNumber === "3M" ? { ...seat, status: "held" as const } : seat), [center], "outbound")).toThrow("no longer available");
    expect(() => validateNumberedSeats(availability, [{ ...center, outboundSeatType: "front" }], "outbound")).toThrow("fare type");
    expect(() => validateNumberedSeats(availability, [makePassenger("Driver")], "outbound")).toThrow("not in this vehicle");
  });
});
