import { COOKIE_NAME } from "@shared/const";
import { eq, sql } from "drizzle-orm";
import { memberCredentials } from "../drizzle/schema";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { accountRouter } from "./routers/account";
import { adminRouter } from "./routers/admin";
import { bookingRouter } from "./routers/booking";
import { driverRouter } from "./routers/driver";
import { memberAuthRouter } from "./routers/member-auth";
import { publicRouter } from "./routers/public";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      if (ctx.user?.openId.startsWith("local_")) {
        const db = await getDb();
        if (!db) throw new Error("Could not end member sessions");
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
  public: publicRouter,
  booking: bookingRouter,
  account: accountRouter,
  driver: driverRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
