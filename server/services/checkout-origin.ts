import { TRPCError } from "@trpc/server";

// This project has no published domain yet. Add its actual published HTTPS origin
// through METROPRO_PUBLIC_ORIGIN before taking live payments. Never infer a return
// address from the proxy's internal Host header or accept a caller-selected domain.
const PREVIEW_ORIGIN = "https://8328-ip1nxp76g4ol7r5z117o1-dd2b4445.us1.manus.computer";

export function approvedCheckoutOrigin(input: string, requestOrigin?: string) {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid payment return address" });
  }
  const approved = [PREVIEW_ORIGIN, process.env.METROPRO_PUBLIC_ORIGIN].filter((origin): origin is string => Boolean(origin));
  if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.pathname !== "/" || parsed.search || parsed.hash ||
      !approved.includes(parsed.origin) ||
      (requestOrigin && requestOrigin !== parsed.origin)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Payment return URL is not approved for this Metro Pro site" });
  }
  return parsed.origin;
}
