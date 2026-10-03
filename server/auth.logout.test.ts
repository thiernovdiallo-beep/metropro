import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME, FIRST_PARTY_HEADER } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const ctx: TrpcContext = {
    // Clearing the cookie while logged out should never alter a real user's
    // password-session version in the shared managed database.
    user: null,
    req: {
      protocol: "https",
      headers: { origin: "https://8328-ip1nxp76g4ol7r5z117o1-dd2b4445.us1.manus.computer" },
      get: (name: string) => name === FIRST_PARTY_HEADER ? "1" : undefined,
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });

  it("rejects a cross-site logout attempt before clearing the cookie", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    ctx.req.headers.origin = "https://unrelated.example";
    await expect(appRouter.createCaller(ctx).auth.logout()).rejects.toThrow("Open Metro Pro");
    expect(clearedCookies).toHaveLength(0);
  });
});
