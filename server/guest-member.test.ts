import { describe, expect, it } from "vitest";
import { createGuestAccess, hasGuestAccess } from "./services/guest-access";
import { approvedCheckoutOrigin } from "./services/checkout-origin";
import { decryptMemberIdImage, encryptMemberIdImage } from "./services/member-profile";

process.env.MANUS_JWT_SECRET ||= "local-test-only-platform-secret";
process.env.MANUS_PROJECT_ID ||= "local-test-only-project";

describe("guest booking access", () => {
  it("accepts only the matching 256-bit capability on a guest booking", () => {
    const first = createGuestAccess();
    const second = createGuestAccess();
    expect(first.token).not.toEqual(second.token);
    const booking = { userId: null, guestAccessHash: first.hash };
    expect(hasGuestAccess(booking, first.token)).toBe(true);
    expect(hasGuestAccess(booking, second.token)).toBe(false);
    expect(hasGuestAccess(booking, undefined)).toBe(false);
    expect(hasGuestAccess({ ...booking, userId: 99 }, first.token)).toBe(false);
  });
});

describe("Stripe return origin", () => {
  const preview = "https://8328-ip1nxp76g4ol7r5z117o1-dd2b4445.us1.manus.computer";

  it("accepts the exact project Preview and rejects client-selected or cross-origin redirects", () => {
    expect(approvedCheckoutOrigin(preview, preview)).toBe(preview);
    expect(() => approvedCheckoutOrigin("https://example.com", "https://example.com")).toThrow();
    expect(() => approvedCheckoutOrigin(preview, "https://example.com")).toThrow();
    expect(() => approvedCheckoutOrigin(`${preview}/stolen-path`, preview)).toThrow();
    expect(() => approvedCheckoutOrigin(`https://user@${new URL(preview).host}`, preview)).toThrow();
  });
});

describe("private member ID photo", () => {
  // Small real PNG byte sequence; never a real identity document.
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/uh8AAAAASUVORK5CYII=", "base64");

  it("encrypts the validated image and decrypts it without leaking plaintext", () => {
    const stored = encryptMemberIdImage(image.toString("base64"));
    expect(stored.mimeType).toBe("image/png");
    expect(stored.ciphertext).not.toContain(image.toString("base64"));
    expect(decryptMemberIdImage(stored.ciphertext)).toEqual(image);
  });

  it("rejects non-images and oversized uploads", () => {
    expect(() => encryptMemberIdImage(Buffer.from("<svg><script>alert(1)</script></svg>").toString("base64"))).toThrow();
    expect(() => encryptMemberIdImage(Buffer.alloc(2 * 1024 * 1024 + 1, 0).toString("base64"))).toThrow();
  });
});
