import { describe, expect, it } from "vitest";
import { dynamicLegFareCents, passengerFareCents, segmentAvailabilityMultiplier, type FareSegment } from "./pricing";

const route = {
  standardFareCents: 15_000,
  memberFareCents: 10_000,
  frontFareCents: 20_000,
  pickupLocationId: 1,
  dropoffLocationId: 5,
};

const segments: FareSegment[] = [
  { segmentOrder: 0, fromLocationId: 1, toLocationId: 2, capacity: 11, seatsSold: 0, seatsHeld: 0 },
  { segmentOrder: 1, fromLocationId: 2, toLocationId: 3, capacity: 11, seatsSold: 0, seatsHeld: 0 },
  { segmentOrder: 2, fromLocationId: 3, toLocationId: 4, capacity: 11, seatsSold: 0, seatsHeld: 0 },
  { segmentOrder: 3, fromLocationId: 4, toLocationId: 5, capacity: 11, seatsSold: 0, seatsHeld: 0 },
];

describe("dynamic segment pricing", () => {
  it("keeps a full-route direct fare equal to the configured route fare", () => {
    expect(passengerFareCents(route, segments, {
      firstName: "A", lastName: "R", outboundSeatType: "standard", returnSeatType: null, isMemberTraveler: false,
    }, "outbound")).toBe(15_000);
  });

  it("charges only the traveled segments for an intermediate-stop journey", () => {
    expect(passengerFareCents(route, segments, {
      firstName: "A", lastName: "R", outboundSeatType: "standard", returnSeatType: null,
      isMemberTraveler: false, outboundPickupLocationId: 2, outboundDropoffLocationId: 4,
    }, "outbound")).toBe(7_500);
  });

  it("applies the availability multiplier per traveled segment", () => {
    const constrained = segments.map(segment => ({ ...segment, seatsSold: 8 }));
    expect(dynamicLegFareCents(route, constrained, [{
      firstName: "A", lastName: "R", outboundSeatType: "standard", returnSeatType: null,
      isMemberTraveler: false, outboundPickupLocationId: 2, outboundDropoffLocationId: 4,
    }], "outbound")).toBe(8_250);
  });

  it("uses the documented 1.0, 1.1, and 1.25 pricing tiers", () => {
    expect(segmentAvailabilityMultiplier({ capacity: 11, seatsSold: 0, seatsHeld: 0 })).toBe(1);
    expect(segmentAvailabilityMultiplier({ capacity: 11, seatsSold: 6, seatsHeld: 0 })).toBe(1.1);
    expect(segmentAvailabilityMultiplier({ capacity: 11, seatsSold: 9, seatsHeld: 0 })).toBe(1.25);
  });
});
