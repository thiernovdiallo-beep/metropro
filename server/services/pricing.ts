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

export function allocatePaidAcrossLegs(paidCents: number, outboundQuotedCents: number, returnQuotedCents: number) {
  if (!returnQuotedCents) return { outboundCents: paidCents, returnCents: 0 };
  const totalQuoted = outboundQuotedCents + returnQuotedCents;
  const outboundCents = totalQuoted > 0
    ? Math.round(paidCents * outboundQuotedCents / totalQuoted)
    : Math.round(paidCents / 2);
  return { outboundCents, returnCents: paidCents - outboundCents };
}
