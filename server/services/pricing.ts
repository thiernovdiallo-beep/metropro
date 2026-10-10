export type SeatType = "standard" | "front";
export type SeatSelection = {
  firstName: string;
  lastName: string;
  outboundSeatType: SeatType;
  returnSeatType: SeatType | null;
  isMemberTraveler: boolean;
};

type FareRoute = {
  standardFareCents: number;
  memberFareCents: number;
  frontFareCents: number;
};

export type FareSegment = {
  segmentOrder: number;
  fromLocationId: number;
  toLocationId: number;
  capacity: number;
  seatsSold: number;
  seatsHeld: number;
};

type PassengerStopSelection = {
  outboundPickupLocationId?: number;
  outboundDropoffLocationId?: number;
  returnPickupLocationId?: number;
  returnDropoffLocationId?: number;
};

export function frontCount(passengers: SeatSelection[], leg: "outbound" | "return") {
  return passengers.filter(p => (leg === "outbound" ? p.outboundSeatType : p.returnSeatType) === "front").length;
}

function normalizeName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function validateSeatSelections(
  passengers: SeatSelection[],
  hasReturn: boolean,
  hasActiveMembership: boolean,
  memberName: string | null
) {
  if (!passengers.length || passengers.length > 11) throw new Error("Select between 1 and 11 passengers.");
  if (frontCount(passengers, "outbound") > 1 || frontCount(passengers, "return") > 1) {
    throw new Error("Only one front passenger seat is available per departure.");
  }
  if (passengers.some(p => !p.firstName.trim() || !p.lastName.trim())) {
    throw new Error("Enter each passenger's first and last name.");
  }
  if (passengers.some(p => hasReturn ? !p.returnSeatType : p.returnSeatType !== null)) {
    throw new Error("Select a seat type for each booked trip.");
  }
  const memberTravelers = passengers.filter(p => p.isMemberTraveler);
  if (memberTravelers.length > 1) throw new Error("Only the member's own regular-seat ticket qualifies for the member fare.");
  if (memberTravelers.length) {
    if (!hasActiveMembership) throw new Error("An active membership is required for the member fare.");
    if (!memberName || normalizeName(`${memberTravelers[0].firstName} ${memberTravelers[0].lastName}`) !== normalizeName(memberName)) {
      throw new Error("The member passenger's name must match the signed-in member's profile name.");
    }
  }
}

export function seatFareCents(route: FareRoute, type: SeatType, isMemberTraveler: boolean) {
  // The front seat is always full-price, even for a traveling member.
  if (type === "front") return route.frontFareCents;
  return isMemberTraveler ? route.memberFareCents : route.standardFareCents;
}

export function legFareCents(route: FareRoute, passengers: SeatSelection[], leg: "outbound" | "return") {
  return passengers.reduce((sum, passenger) => {
    const seat = leg === "outbound" ? passenger.outboundSeatType : passenger.returnSeatType;
    return sum + (seat ? seatFareCents(route, seat, passenger.isMemberTraveler) : 0);
  }, 0);
}

/**
 * Dynamic availability multiplier for one route segment.
 * The first half of capacity remains at the configured fare; the price rises
 * only as a segment becomes constrained. Rounding happens at the segment level
 * so a multi-stop fare is deterministic and never loses a cent.
 */
export function segmentAvailabilityMultiplier(segment: Pick<FareSegment, "capacity" | "seatsSold" | "seatsHeld">) {
  if (segment.capacity <= 0) return 1;
  const remaining = Math.max(0, segment.capacity - segment.seatsSold - segment.seatsHeld);
  const ratio = remaining / segment.capacity;
  if (ratio <= 0.25) return 1.25;
  if (ratio <= 0.5) return 1.1;
  return 1;
}

function fareStopOrder(segments: readonly FareSegment[]) {
  const order = new Map<number, number>();
  for (const segment of segments) {
    order.set(segment.fromLocationId, segment.segmentOrder);
    order.set(segment.toLocationId, segment.segmentOrder + 1);
  }
  return order;
}

export function passengerFareCents(
  route: FareRoute & { pickupLocationId: number; dropoffLocationId: number },
  segments: readonly FareSegment[] | undefined,
  passenger: SeatSelection & PassengerStopSelection,
  leg: "outbound" | "return",
) {
  const seat = leg === "outbound" ? passenger.outboundSeatType : passenger.returnSeatType;
  if (!seat) return 0;
  const configuredFare = seatFareCents(route, seat, passenger.isMemberTraveler);
  if (!segments?.length) return configuredFare;

  const pickup = leg === "outbound" ? passenger.outboundPickupLocationId : passenger.returnPickupLocationId;
  const dropoff = leg === "outbound" ? passenger.outboundDropoffLocationId : passenger.returnDropoffLocationId;
  const first = pickup ?? route.pickupLocationId;
  const last = dropoff ?? route.dropoffLocationId;
  const order = fareStopOrder(segments);
  const fromOrder = order.get(first);
  const toOrder = order.get(last);
  if (fromOrder == null || toOrder == null || fromOrder >= toOrder) return configuredFare;

  const totalSegments = segments.length;
  const traveled = segments.filter(segment => segment.segmentOrder >= fromOrder && segment.segmentOrder < toOrder);
  return traveled.reduce((total, segment) => {
    const baseSegmentFare = configuredFare / totalSegments;
    return total + Math.round(baseSegmentFare * segmentAvailabilityMultiplier(segment));
  }, 0);
}

export function dynamicLegFareCents(
  route: FareRoute & { pickupLocationId: number; dropoffLocationId: number },
  segments: readonly FareSegment[] | undefined,
  passengers: (SeatSelection & PassengerStopSelection)[],
  leg: "outbound" | "return",
) {
  return passengers.reduce((sum, passenger) => {
    return sum + passengerFareCents(route, segments, passenger, leg);
  }, 0);
}

export function allocatePaidAcrossLegs(paidCents: number, outboundQuotedCents: number, returnQuotedCents: number) {
  if (!returnQuotedCents) return { outboundCents: paidCents, returnCents: 0 };
  const totalQuoted = outboundQuotedCents + returnQuotedCents;
  const outboundCents = totalQuoted > 0
    ? Math.round(paidCents * outboundQuotedCents / totalQuoted)
    : Math.round(paidCents / 2);
  return { outboundCents, returnCents: paidCents - outboundCents };
}
