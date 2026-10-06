import { describe, expect, it } from "vitest";
import { restoredCheckout } from "./Checkout";

const NOW = Date.UTC(2026, 9, 6, 12);
const checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_123";
function saved(expiryMinutes: number, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ draftKey: "two-seats", checkoutUrl, bookingNumber: "MPTEST", guestAccessToken: "token",
    checkoutExpiresAt: new Date(NOW + expiryMinutes * 60_000).toISOString(),
    holdExpiresAt: new Date(NOW + (expiryMinutes + 5) * 60_000).toISOString(), ...extra });
}

describe("resumable Stripe Checkout", () => {
  it("reuses the same still-open session rather than creating a competing hold", () => {
    expect(restoredCheckout(saved(20), "two-seats", NOW)?.checkoutUrl).toBe(checkoutUrl);
    expect(restoredCheckout(saved(20), "changed-seats", NOW)).toBeNull();
  });
  it("rejects a session after Checkout expires even though its seat hold has five minutes left", () => {
    expect(restoredCheckout(saved(-1), "two-seats", NOW)).toBeNull();
    const legacy = JSON.stringify({ draftKey: "two-seats", checkoutUrl, bookingNumber: "MPTEST",
      holdExpiresAt: new Date(NOW + 4 * 60_000).toISOString() });
    expect(restoredCheckout(legacy, "two-seats", NOW)).toBeNull();
  });
  it("ignores invalid or foreign stored payment URLs", () => {
    expect(restoredCheckout(saved(20, { checkoutUrl: "https://stripe-checkout.evil.test/c/pay" }), "two-seats", NOW)).toBeNull();
    expect(restoredCheckout("not-json", "two-seats", NOW)).toBeNull();
  });
});
