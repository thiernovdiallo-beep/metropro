import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { memberCredentials, memberIdPhotos, passwordResetTokens, users } from "../../drizzle/schema";
import { COOKIE_NAME, FIRST_PARTY_HEADER } from "@shared/const";
import { getDb } from "../db";
import { insertId } from "../lib/mysql";
import { assertMemberAuthOrigin } from "../services/checkout-origin";
import {
  delayUnknownMemberPassword,
  assertStrongPassword,
  hashMemberPassword,
  normalizeMemberEmail,
  verifyMemberPassword,
} from "../services/member-auth";
import { encryptMemberIdImage } from "../services/member-profile";
import { getSessionCookieOptions } from "../_core/cookies";
import { publicProcedure, router } from "../_core/trpc";
import { sdk } from "../_core/sdk";
import { createPasswordResetToken, PASSWORD_RESET_MS, passwordResetTokenHash, throttlePasswordReset } from "../services/password-reset";
import { TEMPLATES, notify } from "../services/notifications";
import { withAdminHashSlot } from "../services/admin-throttle";

const LOCAL_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const INVALID_LOGIN = "Could not sign in. Check your credentials or try again later.";

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(12).max(128);
const RESET_SUCCESS = "If an account exists for that email, we sent password reset instructions.";
const INVALID_RESET = "This password reset link is invalid, expired, or has already been used.";

async function issueMemberSession(ctx: { req: Parameters<typeof getSessionCookieOptions>[0]; res: { cookie: (name: string, value: string, options: ReturnType<typeof getSessionCookieOptions> & { maxAge: number }) => unknown } }, openId: string, name: string, memberSessionVersion: number) {
  const sessionToken = await sdk.createSessionToken(openId, { name, expiresInMs: LOCAL_SESSION_MS, memberSessionVersion });
  ctx.res.cookie(COOKIE_NAME, sessionToken, {
    ...getSessionCookieOptions(ctx.req),
    maxAge: LOCAL_SESSION_MS,
  });
  // Like Preview's existing OAuth fallback, a short-lived JS-accessible token
  // lets the embedded app sign in when third-party cookies are blocked.
  return sessionToken;
}

export const memberAuthRouter = router({
  requestReset: publicProcedure
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ ctx, input }) => {
      const origin = assertMemberAuthOrigin(ctx.req.headers.origin, ctx.req.headers["sec-fetch-site"], ctx.req.get(FIRST_PARTY_HEADER));
      const email = normalizeMemberEmail(input.email);
      const source = ctx.req.ip ?? ctx.req.socket?.remoteAddress ?? "unknown";
      throttlePasswordReset(`source:${source}`);
      throttlePasswordReset(`email:${email}`);
      const db = await getDb();
      if (!db) return { success: true, message: RESET_SUCCESS } as const;
      const [user] = await db.select({ id: users.id, email: users.email, role: users.role })
        .from(users).where(sql`LOWER(${users.email}) = ${email}`).limit(1);
      if (!user || user.role !== "customer" || !user.email) return { success: true, message: RESET_SUCCESS } as const;
      const [credential] = await db.select({ id: memberCredentials.id }).from(memberCredentials)
        .where(eq(memberCredentials.userId, user.id)).limit(1);
      if (!credential) return { success: true, message: RESET_SUCCESS } as const;
      const { token, hash } = createPasswordResetToken();
      await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + PASSWORD_RESET_MS) });
      const resetLink = `${origin}/reset-password#token=${encodeURIComponent(token)}`;
      // Placeholder delivery: notify() currently creates an in-app notification only.
      // Replace this with a real email provider before production launch.
      try {
        await notify({ userId: user.id, templateKey: TEMPLATES.password_reset_requested,
          title: "Reset your Metro Pro password", body: `Use this one-time link within 24 hours: ${resetLink}`,
          payload: { resetLink, expiresAt: new Date(Date.now() + PASSWORD_RESET_MS).toISOString() } });
      } catch (error) {
        // Do not turn delivery/storage differences into account enumeration.
        console.warn("[password-reset] placeholder notification unavailable", error instanceof Error ? error.name : "unknown");
      }
      return { success: true, message: RESET_SUCCESS } as const;
    }),
  verifyToken: publicProcedure
    .input(z.object({ token: z.string().min(1).max(128) }))
    .query(async ({ input }) => {
      const hash = passwordResetTokenHash(input.token);
      if (!hash) return { valid: false } as const;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [candidate] = await db.select({ id: passwordResetTokens.id }).from(passwordResetTokens)
        .where(and(eq(passwordResetTokens.tokenHash, hash), isNull(passwordResetTokens.consumedAt), gt(passwordResetTokens.expiresAt, new Date()))).limit(1);
      return { valid: Boolean(candidate) } as const;
    }),
  resetPassword: publicProcedure
    .input(z.object({ token: z.string().min(1).max(128), newPassword: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      assertMemberAuthOrigin(ctx.req.headers.origin, ctx.req.headers["sec-fetch-site"], ctx.req.get(FIRST_PARTY_HEADER));
      const hash = passwordResetTokenHash(input.token);
      if (!hash) throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_RESET });
      try { assertStrongPassword(input.newPassword); } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Choose a stronger password." }); }
      const passwordHash = await withAdminHashSlot(() => hashMemberPassword(input.newPassword));
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.transaction(async tx => {
        const [token] = await tx.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, hash)).limit(1).for("update");
        if (!token || token.consumedAt || token.expiresAt <= new Date()) throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_RESET });
        const [user] = await tx.select().from(users).where(eq(users.id, token.userId)).limit(1).for("update");
        const [credential] = await tx.select().from(memberCredentials).where(eq(memberCredentials.userId, token.userId)).limit(1).for("update");
        if (!user || user.role !== "customer" || !credential || !user.email || credential.emailNormalized !== normalizeMemberEmail(user.email)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_RESET });
        }
        await tx.update(memberCredentials).set({ passwordHash, sessionVersion: sql`${memberCredentials.sessionVersion} + 1`, failedAttempts: 0, lockedUntil: null }).where(eq(memberCredentials.id, credential.id));
        await tx.update(passwordResetTokens).set({ consumedAt: new Date() }).where(eq(passwordResetTokens.id, token.id));
      });
      return { success: true } as const;
    }),
  register: publicProcedure
    .input(z.object({
      name: z.string().trim().min(3).max(160).refine(value => value.split(/\s+/).length >= 2, "Enter your first and last name"),
      email: emailSchema,
      phone: z.string().trim().min(7).max(32).refine(value => value.replace(/\D/g, "").length >= 7, "Enter a valid phone number"),
      password: passwordSchema,
      confirmPassword: z.string(),
      idPhotoBase64: z.string().min(1).max(2_800_000),
    }).refine(input => input.password === input.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" }))
    .mutation(async ({ ctx, input }) => {
      assertMemberAuthOrigin(ctx.req.headers.origin, ctx.req.headers["sec-fetch-site"], ctx.req.get(FIRST_PARTY_HEADER));
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account setup is unavailable" });
      const email = normalizeMemberEmail(input.email);
      const [existing] = await db.select({ id: users.id }).from(users)
        .where(sql`LOWER(${users.email}) = ${email}`).limit(1);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "This email is already associated with an account. Sign in instead." });
      }
      let image: ReturnType<typeof encryptMemberIdImage>;
      try {
        image = encryptMemberIdImage(input.idPhotoBase64);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Choose a valid ID image" });
      }
      let passwordHash: string;
      try {
        passwordHash = await hashMemberPassword(input.password);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Choose a stronger password" });
      }
      const openId = `local_${randomUUID().replaceAll("-", "")}`;
      let userId: number;
      try {
        userId = await db.transaction(async tx => {
          const inserted = await tx.insert(users).values({
            openId,
            name: input.name,
            email,
            phone: input.phone,
            loginMethod: "password",
            role: "customer",
          });
          const id = insertId(inserted);
          await tx.insert(memberCredentials).values({ userId: id, emailNormalized: email, passwordHash });
          await tx.insert(memberIdPhotos).values({ userId: id, ...image });
          return id;
        });
      } catch (error) {
        if (error instanceof Error && /duplicate|unique|1062/i.test(error.message)) {
          throw new TRPCError({ code: "CONFLICT", message: "This email is already associated with an account. Sign in instead." });
        }
        throw error;
      }
      const sessionToken = await issueMemberSession(ctx, openId, input.name, 0);
      return { sessionToken, userId };
    }),
  signIn: publicProcedure
    .input(z.object({ email: emailSchema, password: z.string().min(1).max(256) }))
    .mutation(async ({ ctx, input }) => {
      assertMemberAuthOrigin(ctx.req.headers.origin, ctx.req.headers["sec-fetch-site"], ctx.req.get(FIRST_PARTY_HEADER));
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Sign-in is unavailable" });
      const email = normalizeMemberEmail(input.email);
      const [credential] = await db.select().from(memberCredentials)
        .where(eq(memberCredentials.emailNormalized, email)).limit(1);
      if (!credential) {
        await delayUnknownMemberPassword(input.password);
        throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_LOGIN });
      }
      if (credential.lockedUntil && credential.lockedUntil.getTime() > Date.now()) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_LOGIN });
      }
      if (!await verifyMemberPassword(input.password, credential.passwordHash)) {
        await db.transaction(async tx => {
          // Compute the threshold from the locked, current row. Concurrent bad
          // guesses cannot all read the same stale failedAttempts counter.
          const [fresh] = await tx.select().from(memberCredentials)
            .where(eq(memberCredentials.id, credential.id)).limit(1).for("update");
          if (!fresh || (fresh.lockedUntil && fresh.lockedUntil.getTime() > Date.now())) return;
          const previous = fresh.lockedUntil ? 0 : fresh.failedAttempts;
          const nextAttempts = previous + 1;
          await tx.update(memberCredentials).set({
            failedAttempts: nextAttempts,
            lockedUntil: nextAttempts >= 5 ? new Date(Date.now() + LOCK_MS) : null,
          }).where(eq(memberCredentials.id, credential.id));
        });
        throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_LOGIN });
      }
      const [user] = await db.select().from(users).where(eq(users.id, credential.userId)).limit(1);
      if (!user || !user.openId.startsWith("local_")) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_LOGIN });
      }
      const stillUnlocked = await db.transaction(async tx => {
        const [fresh] = await tx.select().from(memberCredentials)
          .where(eq(memberCredentials.id, credential.id)).limit(1).for("update");
        if (!fresh || (fresh.lockedUntil && fresh.lockedUntil.getTime() > Date.now())) return false;
        await tx.update(memberCredentials).set({ failedAttempts: 0, lockedUntil: null })
          .where(eq(memberCredentials.id, credential.id));
        return true;
      });
      if (!stillUnlocked) throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_LOGIN });
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
      const sessionToken = await issueMemberSession(ctx, user.openId, user.name ?? "", credential.sessionVersion);
      return { sessionToken, userId: user.id };
    }),
});
