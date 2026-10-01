import { describe, expect, it } from "vitest";
import {
  assertStrongPassword,
  hashMemberPassword,
  normalizeMemberEmail,
  verifyMemberPassword,
} from "./services/member-auth";
import { assertMemberAuthOrigin } from "./services/checkout-origin";

describe("local member credentials", () => {
  it("normalizes login email consistently and rejects short passwords", () => {
    expect(normalizeMemberEmail("  MEMBER@Example.COM  ")).toBe("member@example.com");
    expect(() => assertStrongPassword("short")).toThrow();
  });

  it("uses unique salted hashes and verifies only the matching password", async () => {
    const password = "River-Copper-Member-2026";
    const first = await hashMemberPassword(password);
    const second = await hashMemberPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyMemberPassword(password, first)).toBe(true);
    expect(await verifyMemberPassword("wrong-password", first)).toBe(false);
    expect(await verifyMemberPassword(password, "unrecognized-format")).toBe(false);
  });

  it("accepts only this project's trusted app origin for browser credential mutations", () => {
    const preview = "https://8328-ip1nxp76g4ol7r5z117o1-dd2b4445.us1.manus.computer";
    expect(assertMemberAuthOrigin(preview)).toBe(preview);
    expect(() => assertMemberAuthOrigin("https://not-metro.example")).toThrow();
    expect(() => assertMemberAuthOrigin(undefined)).toThrow();
  });
});
