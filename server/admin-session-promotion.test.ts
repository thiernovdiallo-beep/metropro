import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "@shared/const";
import type { User } from "../drizzle/schema";
import { sdk } from "./_core/sdk";

const mock = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("./db", () => ({
  getUserByOpenId: async () => mock.user,
  upsertUser: async () => undefined,
}));

function request(token: string) {
  return { headers: { cookie: `${COOKIE_NAME}=${token}` }, path: "/api/trpc/admin.kpis" } as Request;
}

function admin(openId: string, adminEnabledAt: Date | null) {
  return { id: 42, openId, role: "admin", adminEnabledAt, name: "Test administrator", email: "test-admin@example.invalid" } as User;
}

beforeEach(() => { mock.user = null; });

describe("OAuth administrator promotion", () => {
  it("rejects an old customer session and accepts only one signed after the role grant", async () => {
    const openId = "google-test-promotion";
    const oldToken = await sdk.createSessionToken(openId, { name: "Test administrator" });
    const oldSession = await sdk.verifySession(oldToken);
    expect(oldSession?.issuedAtMs).toBeTypeOf("number");
    mock.user = admin(openId, new Date(oldSession!.issuedAtMs! + 1));
    await expect(sdk.authenticateRequest(request(oldToken))).rejects.toThrow(/Sign in again/);

    await new Promise(resolve => setTimeout(resolve, 12));
    const freshToken = await sdk.createSessionToken(openId, { name: "Test administrator" });
    await expect(sdk.authenticateRequest(request(freshToken))).resolves.toMatchObject({ id: 42, role: "admin" });
  });

  it("preserves the original administrator's valid existing OAuth session", async () => {
    const openId = "apple-original-admin-test";
    const token = await sdk.createSessionToken(openId, { name: "Original administrator" });
    mock.user = admin(openId, null);
    await expect(sdk.authenticateRequest(request(token))).resolves.toMatchObject({ id: 42, role: "admin" });
  });
});
