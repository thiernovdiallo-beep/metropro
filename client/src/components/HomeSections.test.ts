import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DigitalTicketStory, PopularRoutes, TravelInformation } from "./HomeSections";

vi.mock("wouter", async () => {
  const { createElement } = await import("react");
  return { Link: ({ children, href, ...props }: { children?: React.ReactNode; href: string; className?: string }) => createElement("a", { href, ...props }, children) };
});

const render = renderToStaticMarkup;

const realRoutes = [
  { id: 1, originCityId: 1, destinationCityId: 2, origin: { name: "New York City", code: "NYC" }, destination: { name: "Columbus", code: "CMH" }, standardFareCents: 15000 },
  { id: 2, originCityId: 2, destinationCityId: 1, origin: { name: "Columbus", code: "CMH" }, destination: { name: "New York City", code: "NYC" }, standardFareCents: 15000 },
];

describe("Metro Pro homepage marketing sections", () => {
  it("renders only provided active routes, with real USD fares and executable search parameters", () => {
    const html = render(createElement(PopularRoutes, { routes: realRoutes, date: "2026-12-09" }));
    expect(html).toContain("New York City");
    expect(html).toContain("Columbus");
    expect(html).toContain("$150");
    expect(html).toContain("origin=1&amp;dest=2&amp;date=2026-12-09&amp;pax=1&amp;type=one_way");
    expect(html).toContain("origin=2&amp;dest=1&amp;date=2026-12-09&amp;pax=1&amp;type=one_way");
    expect(html.match(/View schedule/g)).toHaveLength(2);
    expect(html).not.toContain("Pittsburgh");
  });

  it("distinguishes routes that are loading, unavailable, and genuinely empty", () => {
    const props = { routes: [], date: "2026-12-09" };
    const loading = render(createElement(PopularRoutes, { ...props, loading: true }));
    expect(loading).toContain("Loading Metro Pro");
    expect(loading).not.toContain("No routes to show");
    const error = render(createElement(PopularRoutes, { ...props, error: true }));
    expect(error).toContain("Routes could not be loaded");
    expect(error).not.toContain("No routes to show");
    const empty = render(createElement(PopularRoutes, props));
    expect(empty).toContain("Current routes will appear here when schedules are available.");
  });

  it("keeps FAQs and support links inside real application sections", () => {
    const html = render(createElement(TravelInformation));
    expect(html).toContain('id="frequently-asked-questions"');
    expect(html).toContain('href="/support"');
    expect(html).toContain('href="/#trip-search"');
  });

  it("labels the ticket illustration as non-boardable and leaves actual QR tokens to confirmed tickets", () => {
    const html = render(createElement(DigitalTicketStory, { route: realRoutes[0] }));
    expect(html).toContain("New York City → Columbus");
    expect(html).toContain("not valid for boarding");
    expect(html).toContain("QR code appears on a confirmed ticket");
    expect(html).toContain("Work in Progress");
    expect(html).toContain('aria-label="Work in Progress"');
    expect(html).not.toContain("qrToken");
  });
});
