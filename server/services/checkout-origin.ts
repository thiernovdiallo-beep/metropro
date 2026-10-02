import { TRPCError } from "@trpc/server";
import { FIRST_PARTY_VALUE } from "@shared/const";

// The public return address must remain an explicitly approved HTTPS origin.
// Never derive a payment redirect from the internal Host or caller input.
const PREVIEW_ORIGIN = "https://8328-ip1nxp76g4ol7r5z117o1-dd2b4445.us1.manus.computer";

function approvedPublicOrigins() {
  return [PREVIEW_ORIGIN, process.env.METROPRO_PUBLIC_ORIGIN].filter((origin): origin is string => Boolean(origin));
}

function firstPartyRequest(
  requestOrigin: string | undefined,
  fetchSite: string | undefined,
  publicOrigin: string,
  firstPartyHeader?: string,
) {
  if (!requestOrigin || (fetchSite && fetchSite !== "same-origin")) return false;
  if (requestOrigin === publicOrigin) return true;

  // Cloud Preview serves HTTPS publicly but rebases its same-origin POSTs to
  // http://127.0.0.1:<PORT> before they reach Express. Require the browser's
  // custom API header, which another site cannot send without our denied CORS
  // preflight. Fetch Metadata, when present, must ALSO say "same-origin";
  // older mobile WebViews may omit it. Origin alone is never sufficient.
  const internalOrigin = `http://127.0.0.1:${process.env.PORT || "3000"}`;
  return requestOrigin === internalOrigin && firstPartyHeader === FIRST_PARTY_VALUE;
}

export function approvedCheckoutOrigin(
  input: string,
  requestOrigin?: string,
  fetchSite?: string,
  firstPartyHeader?: string,
) {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid payment return address" });
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.pathname !== "/" || parsed.search || parsed.hash ||
      !approvedPublicOrigins().includes(parsed.origin) ||
      !firstPartyRequest(requestOrigin, fetchSite, parsed.origin, firstPartyHeader)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Payment return URL is not approved for this Metro Pro site" });
  }
  return parsed.origin;
}

export function assertMemberAuthOrigin(requestOrigin?: string, fetchSite?: string, firstPartyHeader?: string) {
  // Member sign-in and registration set cross-site-capable session cookies.
  // Authorize the form's browser origin independently of Stripe return URLs.
  const publicOrigin = approvedPublicOrigins().find(origin => firstPartyRequest(requestOrigin, fetchSite, origin, firstPartyHeader));
  if (!publicOrigin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Open Metro Pro to sign in or create an account" });
  }
  return publicOrigin;
}
