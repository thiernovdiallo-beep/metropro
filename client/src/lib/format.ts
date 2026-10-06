const SERVICE_TIME_ZONE = "America/New_York";

export function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function moneyExact(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function asTripDate(value: Date | string) {
  // A YYYY-MM-DD search date is a local calendar day, not midnight UTC; noon
  // UTC keeps that day intact when formatting in Eastern Time.
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
}

export function formatTime(value: Date | string) {
  return asTripDate(value).toLocaleTimeString("en-US", {
    timeZone: SERVICE_TIME_ZONE, hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

export function formatDate(value: Date | string) {
  return asTripDate(value).toLocaleDateString("en-US", {
    timeZone: SERVICE_TIME_ZONE, weekday: "short", month: "short", day: "numeric",
  });
}

export function formatDateLong(value: Date | string) {
  return asTripDate(value).toLocaleDateString("en-US", {
    timeZone: SERVICE_TIME_ZONE, weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

const formClock = new Intl.DateTimeFormat("en-US", {
  timeZone: SERVICE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function serviceDateTimeInput(value: Date | string) {
  const parts = Object.fromEntries(formClock.formatToParts(asTripDate(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function parseServiceDateTimeInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const wallClock = new Date(`${value}:00.000Z`);
  if (!Number.isFinite(wallClock.getTime()) || wallClock.toISOString().slice(0, 16) !== value) return null;
  // New York is UTC-4 or UTC-5. Check the rendered wall clock to reject the
  // nonexistent spring-forward hour and choose the earlier fall-back hour.
  for (const hours of [4, 5]) {
    const candidate = new Date(wallClock.getTime() + hours * 3_600_000);
    if (serviceDateTimeInput(candidate) === value) return candidate;
  }
  return null;
}

export function isoDate(value = new Date()) {
  return serviceDateTimeInput(value).slice(0, 10);
}

export function occupancyLabel(pct: number) {
  if (pct >= 100) return "Sold Out";
  if (pct >= 90) return "90%";
  if (pct >= 80) return "80%";
  if (pct >= 70) return "70%";
  return `${pct}%`;
}
