import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const tokens = Object.fromEntries(
  [...stylesheet.matchAll(/^\s*(--[\w-]+):\s*(#[0-9a-fA-F]{6});/gm)]
    .map(([, name, value]) => [name, value.toUpperCase()])
);

describe("MetroPro Transit Corp. visual identity", () => {
  it("uses the official navy, orange-red, and light UI theme", () => {
    expect(tokens).toMatchObject({
      "--metro-ink": "#172033",
      "--primary": "#F04424",
      "--metro-blue": "#0D2B55",
      "--metro-blue-dark": "#092044",
      "--metro-green": "#15803D",
      "--accent": "#0D2B55",
      "--background": "#F3F5F8",
      "--card": "#FFFFFF",
      "--foreground": "#172033",
      "--muted-foreground": "#64748B",
      "--border": "#E2E8F0",
      "--metro-success": "#15803D",
      "--metro-warning": "#F59E0B",
      "--metro-error": "#DC2626",
    });
  });

  it("keeps available seats green, selected seats navy, and held seats amber", () => {
    expect(tokens["--metro-selected"]).toBe("#0D2B55");
    expect(stylesheet).toContain(".metro-seat--selected { border-color: var(--metro-selected)");
    expect(stylesheet).toContain(".metro-seat--available { border-color: var(--metro-green)");
    expect(stylesheet).toContain(".metro-seat--held { border-color: var(--metro-warning)");
    expect(stylesheet).toContain(".metro-seat--taken { border-color: #94A3B8");
    expect(stylesheet).toContain(".metro-status--success { border-color: var(--metro-success)");
    expect(stylesheet).toContain(".metro-status--pending { border-color: var(--metro-warning)");
    expect(stylesheet).toContain(".metro-status--error { border-color: var(--metro-error)");
  });
});
