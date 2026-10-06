import { MySqlDialect } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminSetupInvites, memberCredentials, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { adminAuthRouter } from "./routers/admin-auth";
import { createAdminResetToken, createAdminSetupToken } from "./services/admin-auth";
import { hashMemberPassword } from "./services/member-auth";

const mock = vi.hoisted(() => ({ db: null as unknown, afterVerify: null as (() => void) | null }));
vi.mock("./db", () => ({ getDb: async () => mock.db }));
vi.mock("./services/admin-throttle", async importOriginal => ({
  ...await importOriginal<typeof import("./services/admin-throttle")>(),
  throttleAdminAttempt: async () => undefined,
  withAdminHashSlot: async <T>(fn: () => Promise<T>) => fn(),
}));
vi.mock("./services/member-auth", async importOriginal => {
  const actual = await importOriginal<typeof import("./services/member-auth")>();
  return { ...actual, verifyMemberPassword: async (password: string, hash: string) => {
    const valid = await actual.verifyMemberPassword(password, hash);
    if (valid) mock.afterVerify?.();
    return valid;
  } };
});

const dialect = new MySqlDialect();
type Credential = { id: number; userId: number; emailNormalized: string; passwordHash: string; sessionVersion: number; failedAttempts: number; lockedUntil: Date | null };

function resetFixture(tokenHash: string, enrolled = true) {
  const admin = { id: 13, role: "admin", email: "reset-admin@example.invalid" };
  const invite = { id: 44, userId: admin.id, tokenHash, expiresAt: new Date(Date.now() + 60_000), consumedAt: null as Date | null };
  const fixture = {
    admin,
    invite,
    credential: enrolled ? { id: 55, userId: admin.id, emailNormalized: admin.email, passwordHash: "previous-hash", sessionVersion: 3, failedAttempts: 5, lockedUntil: new Date(Date.now() + 60_000) } as Credential : null as Credential | null,
    replacementCount: 0,
    extraAdmin: false,
  };
  function rowsFor(table: unknown, condition: unknown) {
    const params = condition ? dialect.sqlToQuery(condition as Parameters<typeof dialect.sqlToQuery>[0]).params : [];
    if (table === adminSetupInvites) return params.includes(invite.id) || params.includes(invite.tokenHash) ? [{ ...invite }] : [];
    if (table === users) return params.includes("admin") ? [{ ...admin }, ...(fixture.extraAdmin ? [{ id: 99, role: "admin", email: "another-admin@example.invalid" }] : [])] : params.includes(admin.id) ? [{ ...admin }] : [];
    if (table === memberCredentials) return (params.includes(admin.id) || params.includes(admin.email)) && fixture.credential ? [{ ...fixture.credential }] : [];
    return [];
  }
  const db = {
    select: () => ({ from(table: unknown) {
      let condition: unknown;
      const chain = {
        where(next: unknown) { condition = next; return chain; },
        limit() { return chain; },
        for() { return Promise.resolve(rowsFor(table, condition)); },
        then(resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve(rowsFor(table, condition)).then(resolve, reject);
        },
      };
      return chain;
    } }),
    update: (table: unknown) => ({ set(values: Record<string, unknown>) { return { async where() {
      if (table === memberCredentials && fixture.credential) {
        fixture.credential.passwordHash = values.passwordHash as string;
        fixture.credential.sessionVersion += 1; // Drizzle's SQL `sessionVersion + 1` runs here in real MySQL.
        fixture.credential.failedAttempts = values.failedAttempts as number;
        fixture.credential.lockedUntil = values.lockedUntil as null;
        fixture.replacementCount += 1;
      } else if (table === adminSetupInvites) {
        invite.consumedAt = values.consumedAt as Date;
      }
      return [{ affectedRows: 1 }];
    } }; } }),
    insert: (table: unknown) => ({ async values(values: Record<string, unknown>) {
      if (table !== memberCredentials || fixture.credential) throw new Error("Unexpected credential insertion");
      fixture.credential = { id: 56, userId: values.userId as number,
        emailNormalized: values.emailNormalized as string, passwordHash: values.passwordHash as string,
        sessionVersion: 0, failedAttempts: 0, lockedUntil: null };
      return [{ insertId: 56 }];
    } }),
    transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(db),
  };
  mock.db = db;
  return fixture;
}

function caller(origin = "https://8328-ip1nxp76g4ol7r5z117o1-dd2b4445.us1.manus.computer") {
  const req = { headers: { origin, "sec-fetch-site": "same-origin" }, get: () => undefined, ip: "127.0.0.1" } as unknown as TrpcContext["req"];
  return adminAuthRouter.createCaller({ req, res: {} as TrpcContext["res"], user: null });
}

beforeEach(() => { mock.db = null; mock.afterVerify = null; });

describe("owner-only administrator password reset", () => {
  it("replaces an existing password only with a reset token, revokes password sessions, and consumes the link", async () => {
    const { token, hash } = createAdminResetToken();
    const fixture = resetFixture(hash);
    const result = await caller().completeSetup({ token, password: "UniqueSyntheticPassphrase123!", confirmPassword: "UniqueSyntheticPassphrase123!" });
    expect(result.success).toBe(true);
    expect(fixture.credential?.passwordHash).not.toBe("previous-hash");
    expect(fixture.credential?.sessionVersion).toBe(4);
    expect(fixture.credential?.failedAttempts).toBe(0);
    expect(fixture.credential?.lockedUntil).toBeNull();
    expect(fixture.replacementCount).toBe(1);
    expect(fixture.invite.consumedAt).toBeInstanceOf(Date);
    await expect(caller().completeSetup({ token, password: "DifferentSyntheticPassword123!", confirmPassword: "DifferentSyntheticPassword123!" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fixture.replacementCount).toBe(1);
  });

  it("never lets an older initial-setup token reset an enrolled administrator", async () => {
    const { token, hash } = createAdminSetupToken();
    const fixture = resetFixture(hash);
    await expect(caller().completeSetup({ token, password: "UniqueSyntheticPassphrase123!", confirmPassword: "UniqueSyntheticPassphrase123!" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fixture.credential?.passwordHash).toBe("previous-hash");
    expect(fixture.credential?.sessionVersion).toBe(3);
    expect(fixture.invite.consumedAt).toBeNull();
  });

  it("rejects reset links without a pre-existing credential or from a foreign origin", async () => {
    const { token, hash } = createAdminResetToken();
    const fixture = resetFixture(hash, false);
    const password = "UniqueSyntheticPassphrase123!";
    await expect(caller().completeSetup({ token, password, confirmPassword: password }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller("https://unrelated.invalid").completeSetup({ token, password, confirmPassword: password }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fixture.invite.consumedAt).toBeNull();
    expect(fixture.replacementCount).toBe(0);
  });

  it("refuses to save a new password for a credential tied to a different login email", async () => {
    const { token, hash } = createAdminResetToken();
    const fixture = resetFixture(hash);
    fixture.credential!.emailNormalized = "different-account@example.invalid";
    const password = "UniqueSyntheticPassphrase123!";
    await expect(caller().completeSetup({ token, password, confirmPassword: password }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fixture.credential?.passwordHash).toBe("previous-hash");
    expect(fixture.invite.consumedAt).toBeNull();
  });

  it("rejects an old-password sign-in if a reset commits after verification but before its credential lock", async () => {
    const fixture = resetFixture(createAdminResetToken().hash);
    const oldPassword = "OldSyntheticPassword123!";
    fixture.credential!.passwordHash = await hashMemberPassword(oldPassword);
    mock.afterVerify = () => {
      fixture.credential!.passwordHash = "new-different-hash";
      fixture.credential!.sessionVersion += 1;
    };
    await expect(caller().signIn({ email: fixture.admin.email, password: oldPassword }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fixture.credential?.sessionVersion).toBe(4);
  });

  it("resets only the invited administrator even when another administrator exists", async () => {
    const { token, hash } = createAdminResetToken();
    const fixture = resetFixture(hash);
    fixture.extraAdmin = true;
    const password = "UniqueSyntheticPassphrase123!";
    await expect(caller().completeSetup({ token, password, confirmPassword: password }))
      .resolves.toEqual({ success: true });
    expect(fixture.credential?.sessionVersion).toBe(4);
    expect(fixture.invite.consumedAt).toBeInstanceOf(Date);
  });

  it("allows first-time setup for the invited admin when an unrelated admin already exists", async () => {
    const { token, hash } = createAdminSetupToken();
    const fixture = resetFixture(hash, false);
    fixture.extraAdmin = true;
    const password = "NewInvitedAdminPassphrase123!";
    await expect(caller().completeSetup({ token, password, confirmPassword: password }))
      .resolves.toEqual({ success: true });
    expect(fixture.credential?.emailNormalized).toBe(fixture.admin.email);
    expect(fixture.invite.consumedAt).toBeInstanceOf(Date);
  });

  it("rejects a setup link when its targeted user is no longer an administrator", async () => {
    const { token, hash } = createAdminSetupToken();
    const fixture = resetFixture(hash, false);
    fixture.admin.role = "customer";
    const password = "NewInvitedAdminPassphrase123!";
    await expect(caller().completeSetup({ token, password, confirmPassword: password }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fixture.invite.consumedAt).toBeNull();
  });
});
