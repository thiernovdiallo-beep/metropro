import { nanoid } from "nanoid";

export function makeBookingNumber(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `MP-${y}${m}${d}-${nanoid(6).toUpperCase()}`;
}

export function makeQrToken() {
  return nanoid(24);
}
