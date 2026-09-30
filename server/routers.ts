import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { accountRouter } from "./routers/account";
import { adminRouter } from "./routers/admin";
import { bookingRouter } from "./routers/booking";
import { driverRouter } from "./routers/driver";
import { publicRouter } from "./routers/public";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  public: publicRouter,
  booking: bookingRouter,
  account: accountRouter,
  driver: driverRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
