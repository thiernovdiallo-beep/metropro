export function genuineStripeReceiptUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "pay.stripe.com" && url.pathname.startsWith("/receipts/") ? url.toString() : null;
  } catch { return null; }
}
