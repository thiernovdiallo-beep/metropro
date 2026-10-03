import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { COOKIE_NAME, FIRST_PARTY_HEADER } from "@shared/const";
import { adminSetupInvites, memberCredentials, users } from "../../drizzle/schema";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { adminSetupTokenHash, ADMIN_SESSION_MS } from "../services/admin-auth";
import { throttleAdminAttempt, withAdminHashSlot } from "../services/admin-throttle";
import { assertMemberAuthOrigin } from "../services/checkout-origin";
import {
  delayUnknownMemberPassword,
  hashMemberPassword,
  normalizeMemberEmail,
  verifyMemberPassword,
} from "../services/member-auth";

const INVALID_LOGIN = "Could not sign in. Check your credentials or try again later.";
const INVALID_INVITE = "This setup link is invalid, expired, or has already been used.";

export const adminAuthRouter = router({
  completeSetup: publicProcedure
    .input(z.object({
      token: z.string().min(1).max(128),
      password: z.string().min(12).max(128),
      confirmPassword: z.string(),
    }).refine(input => input.password === input.confirmPassword, {
      path: ["confirmPassword"], message: "Passwords do not match",
    }))
    .mutation(async ({ ctx, input }) => {
      assertMemberAuthOrigin(ctx.req.headers.origin, ctx.req.headers["sec-fetch-site"], ctx.req.get(FIRST_PARTY_HEADER));
      const tokenHash = adminSetupTokenHash(input.token);
      if (!tokenHash) throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_INVITE });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Admin setup is unavailable" });
      const [candidate] = await db.select().from(adminSetupInvites)
        .where(eq(adminSetupInvites.tokenHash, tokenHash)).limit(1);
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
        const [invite] = await tx.select().from(adminSetupInvites)
          .where(eq(adminSetupInvites.id, candidate.id)).limit(1).for("update");
        if (!invite || invite.consumedAt || invite.expiresAt <= new Date()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_INVITE });
        }
        const [admin] = await tx.select().from(users)
          .where(eq(users.id, invite.userId)).limit(1).for("update");
        const [existing] = await tx.select({ id: memberCredentials.id }).from(memberCredentials)
          .where(eq(memberCredentials.userId, invite.userId)).limit(1);
        if (!admin || admin.role !== "admin" || !admin.email || existing) {
          throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_INVITE });
        }
        await tx.insert(memberCredentials).values({
          userId: admin.id,
          emailNormalized: normalizeMemberEmail(admin.email),
          passwordHash,
        });
        await tx.update(adminSetupInvites).set({ consumedAt: new Date() })
          .where(eq(adminSetupInvites.id, invite.id));
      });
      return { success: true } as const;
    }),

  signIn: publicProcedure
    .input(z.object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(256) }))
    .mutation(async ({ ctx, input }) => {
      assertMemberAuthOrigin(ctx.req.headers.origin, ctx.req.headers["sec-fetch-site"], ctx.req.get(FIRST_PARTY_HEADER));
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Admin sign-in is unavailable" });
      const email = normalizeMemberEmail(input.email);
      await throttleAdminAttempt(db, ctx.req.ip ?? ctx.req.socket?.remoteAddress ?? "unknown", email);
      const [credential] = await db.select().from(memberCredentials)
        .where(eq(memberCredentials.emailNormalized, email)).limit(1);
      if (!credential) {
        await withAdminHashSlot(() => delayUnknownMemberPassword(input.password));
        throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_LOGIN });
      }
      const [admin] = await db.select().from(users)
        .where(eq(users.id, credential.userId)).limit(1);
      if (!admin || admin.role !== "admin" || !admin.email ||
          normalizeMemberEmail(admin.email) !== email) {
        await withAdminHashSlot(() => delayUnknownMemberPassword(input.password));
        throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_LOGIN });
      }
      if (!await withAdminHashSlot(() => verifyMemberPassword(input.password, credential.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_LOGIN });
      }
      const version = await db.transaction(async tx => {
        const [fresh] = await tx.select().from(memberCredentials)
          .where(eq(memberCredentials.id, credential.id)).limit(1).for("update");
        const [currentAdmin] = await tx.select({ role: users.role }).from(users)
          .where(eq(users.id, credential.userId)).limit(1);
        if (!fresh || currentAdmin?.role !== "admin") {
          throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_LOGIN });
        }
        await tx.update(memberCredentials).set({ failedAttempts: 0, lockedUntil: null })
          .where(eq(memberCredentials.id, credential.id));
        return fresh.sessionVersion;
      });
      const token = await sdk.createSessionToken(admin.openId, {
        name: admin.name ?? "",
        expiresInMs: ADMIN_SESSION_MS,
        memberSessionVersion: version,
      });
      ctx.res.cookie(COOKIE_NAME, token, {
        ...getSessionCookieOptions(ctx.req), maxAge: ADMIN_SESSION_MS,
      });
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, admin.id));
      return { sessionToken: token };
    }),
});
