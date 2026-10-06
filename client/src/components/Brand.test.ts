import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PageShell } from "./Brand";

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
