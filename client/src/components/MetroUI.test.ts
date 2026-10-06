import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageIntro, ResourceState, StatusBadge, statusTone } from "./MetroUI";

describe("Metro Pro shared presentation primitives", () => {
  it("keeps payment, boarding and availability labels readable without relying on color", () => {
    expect(statusTone("confirmed")).toBe("success");
    expect(statusTone("pending_payment")).toBe("pending");
    expect(statusTone("out_of_service")).toBe("error");
    expect(statusTone("maintenance")).toBe("neutral");
    const markup = renderToStaticMarkup(createElement(StatusBadge, { status: "pending_payment" }));
    expect(markup).toContain("metro-status--pending");
    expect(markup).toContain("Pending Payment");
  });

  it("shows a real page title with a consistent eyebrow and description", () => {
    const markup = renderToStaticMarkup(createElement(PageIntro, { eyebrow: "Book a trip", title: "Choose your seat", description: "Pick a seat for every traveler." }));
    expect(markup).toContain("metro-eyebrow");
    expect(markup).toContain('<h1 class="metro-page-title">Choose your seat</h1>');
    expect(markup).toContain("Pick a seat for every traveler.");
  });

  it("does not present loading or an error as an empty data state", () => {
    const child = createElement("div", null, "live data");
    const loading = renderToStaticMarkup(createElement(ResourceState, { loading: true }, child));
    expect(loading).toContain('role="status"');
    expect(loading).toContain("Loading Metro Pro");
    expect(loading).not.toContain("live data");
    const error = renderToStaticMarkup(createElement(ResourceState, { error: "Try again later", empty: true }, child));
    expect(error).toContain('role="alert"');
    expect(error).toContain("Try again later");
    expect(error).not.toContain("Nothing here yet");
    const empty = renderToStaticMarkup(createElement(ResourceState, { empty: true, emptyTitle: "No scheduled trips" }, child));
    expect(empty).toContain("No scheduled trips");
    expect(empty).not.toContain("live data");
  });
});
