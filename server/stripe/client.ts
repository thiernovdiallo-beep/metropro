import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!_stripe) {
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
