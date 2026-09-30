import { notifications } from "../../drizzle/schema";
import { getDb } from "../db";

export type NoticeInput = {
  userId?: number | null;
  templateKey: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
};

export const TEMPLATES = {
  booking_confirmation: "booking_confirmation",
  payment_confirmation: "payment_confirmation",
  upcoming_departure: "upcoming_departure",
  reminder_24h: "reminder_24h",
  boarding_reminder: "boarding_reminder",
  trip_delay: "trip_delay",
  trip_cancellation: "trip_cancellation",
  booking_reschedule: "booking_reschedule",
  refund: "refund",
  membership_renewal: "membership_renewal",
  membership_payment_failed: "membership_payment_failed",
} as const;

export async function notify(input: NoticeInput) {
  const db = await getDb();
  if (!db) return;
  const channels = ["in_app", "email", "sms", "push"] as const;
  await db.insert(notifications).values(
    channels.map(channel => ({
      userId: input.userId ?? null,
      channel,
      templateKey: input.templateKey,
      title: input.title,
      body: input.body,
      payload: input.payload ?? null,
    }))
  );
}

export function tripReminderCopy(origin: string, destination: string, when: string) {
  return `Your Metro Pro trip from ${origin} to ${destination} departs tomorrow at ${when}.`;
}

export function boardingCopy() {
  return "Boarding for your Metro Pro trip begins in 30 minutes.";
}
