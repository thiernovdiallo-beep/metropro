import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PageShell, SiteHeader } from "./Brand";

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: null, isAuthenticated: false, logout: vi.fn() }) }));
vi.mock("wouter", async () => {
  const { createElement } = await import("react");
  return {
    Link: ({ href, children, ...props }: { href: string; children?: React.ReactNode; className?: string }) => createElement("a", { href, ...props }, children),
    useLocation: () => ["/", vi.fn()],
  };
});

describe("Metro Pro shell landmarks", () => {
  it("does not nest a second main landmark around pages that provide one", () => {
    const html = renderToStaticMarkup(createElement(PageShell, null, createElement("main", null, "Trip details")));
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain("Trip details");
  });

  it("provides a main landmark when a page only supplies sections", () => {
    const html = renderToStaticMarkup(createElement(PageShell, null, createElement("section", null, "Book your trip")));
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain("Book your trip");
  });
});

describe("Metro Pro global header", () => {
  it("preserves the centered navigation, its order, logo, right actions and mobile toggle while underlining the active item", () => {
    const html = renderToStaticMarkup(createElement(SiteHeader));
    const desktopNav = html.match(/<nav class="hidden items-center gap-1 lg:flex lg:justify-self-center"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    expect(desktopNav).toBeDefined();
    expect([...desktopNav!.matchAll(/<span[^>]*>(Home|Routes|Schedules|About|Contact)<\/span>/g)].map(match => match[1]))
      .toEqual(["Home", "Routes", "Schedules", "About", "Contact"]);
    const activeLinks = [...desktopNav!.matchAll(/<a[^>]*aria-current="page"[^>]*>([\s\S]*?)<\/a>/g)];
    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0][1]).toContain("Home");
    expect(activeLinks[0][1]).toMatch(/\sborder-primary(?:\s|")/);
    expect(desktopNav).toContain("border-transparent group-hover:border-primary");
    expect(html).toContain("container flex min-h-16 items-center justify-between gap-3 py-2 lg:grid lg:min-h-20 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]");
    expect(html).toContain('src="/logo.png"');
    expect(html).toContain('alt="Metro Pro"');
    expect(html.match(/src="\/logo\.png"/g)).toHaveLength(1);
    expect(html).not.toContain('font-serif text-lg tracking-tight text-primary">METRO');
    expect(html).toContain('class="ml-auto hidden items-center gap-2 lg:ml-0 lg:flex lg:justify-self-end"');
    expect(html).toContain("Sign In");
    expect(html).toContain("Book Now");
    expect(html).toContain('aria-controls="metro-mobile-navigation" aria-expanded="false"');
  });
});
