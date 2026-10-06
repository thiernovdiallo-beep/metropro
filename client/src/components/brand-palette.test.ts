import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const tokens = Object.fromEntries(
  [...stylesheet.matchAll(/^\s*(--[\w-]+):\s*(#[0-9a-fA-F]{6});/gm)]
    .map(([, name, value]) => [name, value.toUpperCase()])
);

describe("Metro Pro visual identity", () => {
  it("retains the requested navy, blue, surface, text, border and meaningful status colors", () => {
    expect(tokens).toMatchObject({
      "--metro-ink": "#0B1F3A",
      "--primary": "#146EF5",
      "--accent": "#38BDF8",
      "--background": "#F8FAFC",
      "--card": "#FFFFFF",
      "--foreground": "#0F172A",
      "--muted-foreground": "#64748B",
      "--border": "#E2E8F0",
      "--metro-success": "#16A34A",
      "--metro-warning": "#F59E0B",
      "--metro-error": "#DC2626",
    });
  });

  it("keeps selected seats Metro Blue while reserving green, amber and red for seat states", () => {
    expect(tokens["--metro-selected"]).toBe(tokens["--primary"]);
    expect(stylesheet).toContain(".metro-seat--selected { border-color: var(--metro-selected)");
    expect(stylesheet).toContain(".metro-seat--available { border-color: var(--metro-success)");
    expect(stylesheet).toContain(".metro-seat--held { border-color: var(--metro-warning)");
    expect(stylesheet).toContain(".metro-seat--taken { border-color: var(--metro-error)");
    expect(stylesheet).toContain(".metro-status--success { border-color: var(--metro-success)");
    expect(stylesheet).toContain(".metro-status--pending { border-color: var(--metro-warning)");
    expect(stylesheet).toContain(".metro-status--error { border-color: var(--metro-error)");
  });
});
