import { describe, expect, it } from "vitest";
import { genuineStripeReceiptUrl } from "./stripeReceipt";

describe("customer payment receipt links", () => {
  it("offers real Stripe charge receipts", () => {
    expect(genuineStripeReceiptUrl("https://pay.stripe.com/receipts/acct_123/abc"))
      .toBe("https://pay.stripe.com/receipts/acct_123/abc");
  });
  it("does not mislabel a completed Checkout or unsafe URL as a receipt", () => {
    expect(genuineStripeReceiptUrl("https://checkout.stripe.com/c/pay/cs_test_123")).toBeNull();
    expect(genuineStripeReceiptUrl("https://pay.stripe.com.evil.example/receipts/x")).toBeNull();
    expect(genuineStripeReceiptUrl("http://pay.stripe.com/receipts/x")).toBeNull();
    expect(genuineStripeReceiptUrl(null)).toBeNull();
  });
});
