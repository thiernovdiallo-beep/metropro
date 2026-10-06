import { describe, expect, it } from "vitest";
import { lineItemsForLeg } from "./booking";

type PricedDeparture = Parameters<typeof lineItemsForLeg>[0];
function metadataOf(item: ReturnType<typeof lineItemsForLeg>[number]) {
  const product = item.price_data.product_data;
  return "metadata" in product ? product.metadata : undefined;
}
const departure = {
  id: 12,
  origin: { name: "New York" },
  destination: { name: "Columbus" },
  route: { standardFareCents: 15000, memberFareCents: 10000, frontFareCents: 20000 },
} as PricedDeparture;

const selections = [
  { firstName: "One", lastName: "Traveler", seatNumber: "1A", returnSeatNumber: "3A", outboundSeatType: "standard" as const, returnSeatType: "standard" as const, isMemberTraveler: false },
  { firstName: "Two", lastName: "Traveler", seatNumber: "2A", returnSeatNumber: "4A", outboundSeatType: "standard" as const, returnSeatType: "standard" as const, isMemberTraveler: false },
  { firstName: "Three", lastName: "Traveler", seatNumber: "Front", returnSeatNumber: "Front", outboundSeatType: "front" as const, returnSeatType: "front" as const, isMemberTraveler: false },
];

describe("Stripe ticket line item seat annotations", () => {
  it("groups by fare and description while retaining each passenger's seat ordinal", () => {
    const items = lineItemsForLeg(departure, selections, "outbound");
    expect(items).toHaveLength(2);
    expect(items[0].quantity).toBe(2);
    expect(items[0].price_data.unit_amount).toBe(15000);
    expect(items[0].price_data.product_data.description).toContain("1A, 2A");
    expect(metadataOf(items[0])?.passenger_seats).toBe('[[1,"1A"],[2,"2A"]]');
    expect(metadataOf(items[0])?.departure_id).toBe("12");
    expect(items[1].quantity).toBe(1);
    expect(items[1].price_data.unit_amount).toBe(20000);
    expect(metadataOf(items[1])?.passenger_seats).toBe('[[3,"Front"]]');
    expect(metadataOf(lineItemsForLeg(departure, selections, "return")[0])?.passenger_seats).toBe('[[1,"3A"],[2,"4A"]]');
  });

  it("keeps quantity-based legacy line items unchanged if no seat number is provided", () => {
    const legacy = selections.map(({ seatNumber: _out, returnSeatNumber: _ret, ...person }) => person);
    const items = lineItemsForLeg(departure, legacy, "outbound");
    expect(items[0]).toEqual({
      quantity: 2,
      price_data: { currency: "usd", unit_amount: 15000, product_data: {
        name: "Metro Pro Ticket", description: "New York → Columbus · Regular seat",
      } },
    });
  });
});
