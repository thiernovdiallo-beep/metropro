import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { COOKIE_NAME, FIRST_PARTY_HEADER } from "@shared/const";
import { driverProfiles, driverSetupInvites, memberCredentials, users } from "../../drizzle/schema";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { throttleStaffAttempt, withAdminHashSlot } from "../services/admin-throttle";
import { assertMemberAuthOrigin } from "../services/checkout-origin";
import { driverSetupTokenHash, DRIVER_SESSION_MS } from "../services/driver-auth";
import { delayUnknownMemberPassword, hashMemberPassword, normalizeMemberEmail, verifyMemberPassword } from "../services/member-auth";

const INVALID_INVITE = "This driver setup link is invalid, expired or already used. Ask your administrator for a new link.";
const INVALID_LOGIN = "Could not sign in. Check your credentials or ask the administrator for access.";

export const driverAuthRouter = router({
  completeSetup: publicProcedure.input(z.object({
    token: z.string().min(1).max(128),
    password: z.string().min(12).max(128),
    confirmPassword: z.string(),
  }).refine(input => input.password === input.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." }))
    .mutation(async ({ ctx, input }) => {
      assertMemberAuthOrigin(ctx.req.headers.origin, ctx.req.headers["sec-fetch-site"], ctx.req.get(FIRST_PARTY_HEADER));
      const hash = driverSetupTokenHash(input.token);
      if (!hash) throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_INVITE });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [candidate] = await db.select().from(driverSetupInvites).where(eq(driverSetupInvites.tokenHash, hash)).limit(1);
      if (!candidate || candidate.consumedAt || candidate.expiresAt <= new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_INVITE });
      }
      let passwordHash: string;
      try {
        passwordHash = await withAdminHashSlot(() => hashMemberPassword(input.password));
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "BAD_REQUEST", message: "Use a password of 12 to 128 characters." });
      }
      await db.transaction(async tx => {
        const [invite] = await tx.select().from(driverSetupInvites).where(eq(driverSetupInvites.id, candidate.id)).limit(1).for("update");
        if (!invite || invite.consumedAt || invite.expiresAt <= new Date()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_INVITE });
        }
        const [user] = await tx.select().from(users).where(eq(users.id, invite.userId)).limit(1).for("update");
        const [profile] = await tx.select().from(driverProfiles).where(eq(driverProfiles.userId, invite.userId)).limit(1);
        const [credential] = await tx.select({ id: memberCredentials.id }).from(memberCredentials)
          .where(eq(memberCredentials.userId, invite.userId)).limit(1);
        if (!user || !user.email || user.role !== "driver" || !profile || profile.status !== "active" || credential) {
          throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_INVITE });
        }
        await tx.insert(memberCredentials).values({
          userId: user.id, emailNormalized: normalizeMemberEmail(user.email), passwordHash,
        });
        await tx.update(driverSetupInvites).set({ consumedAt: new Date() }).where(eq(driverSetupInvites.id, invite.id));
      });
      return { success: true } as const;
    }),

  signIn: publicProcedure.input(z.object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(256) }))
    .mutation(async ({ ctx, input }) => {
      assertMemberAuthOrigin(ctx.req.headers.origin, ctx.req.headers["sec-fetch-site"], ctx.req.get(FIRST_PARTY_HEADER));
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const email = normalizeMemberEmail(input.email);
      await throttleStaffAttempt(db, ctx.req.ip ?? ctx.req.socket?.remoteAddress ?? "unknown", email, "driver");
      const [credential] = await db.select().from(memberCredentials).where(eq(memberCredentials.emailNormalized, email)).limit(1);
      const [user] = credential ? await db.select().from(users).where(eq(users.id, credential.userId)).limit(1) : [null];
      const [profile] = user ? await db.select().from(driverProfiles).where(eq(driverProfiles.userId, user.id)).limit(1) : [null];
      const eligible = user?.role === "driver" && user.email && normalizeMemberEmail(user.email) === email && profile?.status === "active";
      if (!credential || !eligible || !user) {
        await withAdminHashSlot(() => delayUnknownMemberPassword(input.password));
        throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_LOGIN });
      }
      if (!await withAdminHashSlot(() => verifyMemberPassword(input.password, credential.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_LOGIN });
      }
      const version = await db.transaction(async tx => {
        const [fresh] = await tx.select().from(memberCredentials).where(eq(memberCredentials.id, credential.id)).limit(1).for("update");
        const [currentUser] = await tx.select({ role: users.role }).from(users).where(eq(users.id, user.id)).limit(1);
        const [currentProfile] = await tx.select({ status: driverProfiles.status }).from(driverProfiles)
          .where(eq(driverProfiles.userId, user.id)).limit(1);
        if (!fresh || currentUser?.role !== "driver" || currentProfile?.status !== "active") {
          throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_LOGIN });
        }
        return fresh.sessionVersion;
      });
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name ?? "", expiresInMs: DRIVER_SESSION_MS, memberSessionVersion: version,
      });
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(ctx.req), maxAge: DRIVER_SESSION_MS });
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
      return { sessionToken };
    }),
});
