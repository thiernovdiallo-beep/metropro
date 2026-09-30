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

export function formatTime(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatDate(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatDateLong(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function isoDate(value = new Date()) {
  const d = new Date(value);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function occupancyLabel(pct: number) {
  if (pct >= 100) return "Sold Out";
  if (pct >= 90) return "90%";
  if (pct >= 80) return "80%";
  if (pct >= 70) return "70%";
  return `${pct}%`;
}
