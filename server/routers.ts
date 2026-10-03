import { COOKIE_NAME, FIRST_PARTY_HEADER } from "@shared/const";
import { eq, sql } from "drizzle-orm";
import { memberCredentials } from "../drizzle/schema";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { accountRouter } from "./routers/account";
import { adminAuthRouter } from "./routers/admin-auth";
import { adminRouter } from "./routers/admin";
import { bookingRouter } from "./routers/booking";
import { driverRouter } from "./routers/driver";
import { driverAuthRouter } from "./routers/driver-auth";
import { memberAuthRouter } from "./routers/member-auth";
import { publicRouter } from "./routers/public";
import { assertMemberAuthOrigin } from "./services/checkout-origin";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      assertMemberAuthOrigin(ctx.req.headers.origin, ctx.req.headers["sec-fetch-site"], ctx.req.get(FIRST_PARTY_HEADER));
      if (ctx.user) {
        const db = await getDb();
        if (!db) throw new Error("Could not end password sessions");
        await db.update(memberCredentials)
          .set({ sessionVersion: sql`${memberCredentials.sessionVersion} + 1` })
          .where(eq(memberCredentials.userId, ctx.user.id));
      }
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  memberAuth: memberAuthRouter,
  adminAuth: adminAuthRouter,
  driverAuth: driverAuthRouter,
  public: publicRouter,
  booking: bookingRouter,
  account: accountRouter,
  driver: driverRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
