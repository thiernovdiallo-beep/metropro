export const TICKET_PRODUCT_NAME = "Metro Pro Ticket";
export const MEMBERSHIP_PRODUCT_NAME = "Metro Pro Member";

export function ticketLineItem(amountCents: number, quantity: number, description: string) {
  return {
    quantity,
    price_data: {
      currency: "usd" as const,
      unit_amount: amountCents,
      product_data: {
        name: TICKET_PRODUCT_NAME,
        description,
      },
    },
  };
}

export function membershipPriceData(amountCents: number) {
  return {
    currency: "usd" as const,
    unit_amount: amountCents,
    recurring: { interval: "month" as const },
    product_data: {
      name: MEMBERSHIP_PRODUCT_NAME,
      description:
        "Member fare, priority booking, member promotions, one free eligible reschedule, early access to new departures.",
    },
  };
}
