import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { routes, settings } from "../../drizzle/schema";

export type AppSettings = {
  standardFareCents: number;
  memberFareCents: number;
  frontFareCents: number;
  membershipPriceCents: number;
  membershipBenefits: string[];
  cancelCutoffHours: number;
  emergencyContactRequired: boolean;
  memberEarlyAccessHours: number;
  holdMinutes: number;
  reminderOffsets: { hours24: number; boardingMinutes: number };
};

export const DEFAULT_SETTINGS: AppSettings = {
  standardFareCents: 15000,
  memberFareCents: 10000,
  frontFareCents: 20000,
  membershipPriceCents: 2500,
  membershipBenefits: [
    "$100 for the member's own regular seat instead of $150 (front seat remains $200)",
    "Priority booking",
    "Member-only promotions",
    "One free eligible trip reschedule",
    "Early access to newly released departures",
  ],
  cancelCutoffHours: 24,
  emergencyContactRequired: true,
  memberEarlyAccessHours: 12,
  holdMinutes: 30,
  reminderOffsets: { hours24: 24, boardingMinutes: 30 },
};

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  if (!db) return DEFAULT_SETTINGS;
  const rows = await db.select().from(settings);
  const map = new Map(rows.map(r => [r.settingKey, r.valueJson]));
  return {
    ...DEFAULT_SETTINGS,
    ...(typeof map.get("app") === "object" && map.get("app") !== null
      ? (map.get("app") as Partial<AppSettings>)
      : {}),
  };
}

export async function saveSettings(next: AppSettings): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .insert(settings)
    .values({ settingKey: "app", valueJson: next })
    .onDuplicateKeyUpdate({ set: { valueJson: next } });
  await db.update(routes).set({
    standardFareCents: next.standardFareCents,
    memberFareCents: next.memberFareCents,
    frontFareCents: next.frontFareCents,
  });
}

export function canSelfServeChange(departAt: Date, cutoffHours: number, now = new Date()) {
  return departAt.getTime() - now.getTime() >= cutoffHours * 60 * 60 * 1000;
}
