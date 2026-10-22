import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const tokens = Object.fromEntries(
  [...stylesheet.matchAll(/^\s*(--[\w-]+):\s*(#[0-9a-fA-F]{6});/gm)]
    .map(([, name, value]) => [name, value.toUpperCase()])
);

describe("MetroPro Transit Corp. visual identity", () => {
  it("uses the official MetroPro navy, orange-red, and white palette", () => {
    expect(tokens).toMatchObject({
      "--metro-ink": "#0B2B55",
      "--metro-navy": "#0B2B55",
      "--metro-navy-dark": "#071D3B",
      "--metro-orange": "#EF4B23",
      "--primary": "#EF4B23",
      "--accent": "#0B2B55",
      "--background": "#F6F8FB",
      "--card": "#FFFFFF",
      "--foreground": "#0B2B55",
      "--muted-foreground": "#52677F",
      "--border": "#D4DDE8",
      "--metro-success": "#0B2B55",
      "--metro-warning": "#D7652B",
      "--metro-error": "#B52F16",
    });
  });

  it("keeps available and selected seats navy, with orange-red action states", () => {
    expect(tokens["--metro-selected"]).toBe("#0B2B55");
    expect(stylesheet).toContain(".metro-seat--selected { border-color: var(--metro-selected)");
    expect(stylesheet).toContain(".metro-seat--available { border-color: var(--metro-available)");
    expect(stylesheet).toContain(".metro-seat--held { border-color: var(--metro-warning)");
    expect(stylesheet).toContain(".metro-seat--taken { border-color: #7C8EA5");
    expect(stylesheet).toContain(".metro-status--success { border-color: var(--metro-success)");
    expect(stylesheet).toContain(".metro-status--pending { border-color: var(--metro-warning)");
    expect(stylesheet).toContain(".metro-status--error { border-color: var(--metro-error)");
  });
});
