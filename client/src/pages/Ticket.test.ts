import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Ticket from "./Ticket";

const mock = vi.hoisted(() => ({ token: "invalid", loading: false, error: null as Error | null, data: null as unknown }));

vi.mock("@/components/Brand", async () => {
  const { createElement } = await import("react");
  return { PageShell: ({ children }: { children: React.ReactNode }) => createElement("div", null, children) };
});
vi.mock("wouter", async () => {
  const { createElement } = await import("react");
  return {
    useRoute: () => [Boolean(mock.token), { token: mock.token }],
    useSearch: () => "",
    Link: ({ children, href, ...props }: { children?: React.ReactNode; href: string; className?: string }) => createElement("a", { href, ...props }, children),
  };
});
vi.mock("@/lib/trpc", () => ({ trpc: { account: { ticketByToken: { useQuery: () => ({ data: mock.data, isLoading: mock.loading, error: mock.error }) } } } }));

beforeEach(() => { mock.token = "invalid"; mock.loading = false; mock.error = null; mock.data = null; });

describe("private digital ticket states", () => {
  it("shows a privacy-safe unavailable message after an invalid ticket lookup completes", () => {
    const html = renderToStaticMarkup(createElement(Ticket));
    expect(html).toContain("This ticket is unavailable");
    expect(html).not.toContain("Loading Metro Pro");
    expect(html).not.toContain("qrToken");
  });

  it("shows loading only while the ticket query is genuinely pending", () => {
    mock.loading = true;
    const html = renderToStaticMarkup(createElement(Ticket));
    expect(html).toContain("Loading Metro Pro");
    expect(html).not.toContain("This ticket is unavailable");
  });

  it("shows a missing-link state when no ticket token was supplied", () => {
    mock.token = "";
    const html = renderToStaticMarkup(createElement(Ticket));
    expect(html).toContain("Ticket link missing");
    expect(html).toContain("Back to home");
  });
});
