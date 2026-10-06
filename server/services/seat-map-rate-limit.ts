import { TRPCError } from "@trpc/server";

type RateLimitOptions = {
  windowMs: number;
  perClientLimit: number;
  globalLimit: number;
};

/** Fixed windows; the global ceiling also bounds how many client keys are retained. */
export function createSeatMapRateLimiter({
  windowMs,
  perClientLimit,
  globalLimit,
}: RateLimitOptions) {
  let windowEndsAt = 0;
  let totalRequests = 0;
  const requestsByClient = new Map<string, number>();

  return (clientKey: string, now = Date.now()): void => {
    if (now >= windowEndsAt) {
      windowEndsAt = now + windowMs;
      totalRequests = 0;
      requestsByClient.clear();
    }
    const requests = requestsByClient.get(clientKey) ?? 0;
    if (requests >= perClientLimit || totalRequests >= globalLimit) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Seat map requested too frequently. Please try again shortly." });
    }
    requestsByClient.set(clientKey, requests + 1);
    totalRequests += 1;
  };
}

// A public, read-heavy route: limit individual callers and bound total DB reads
// per app process. Do not trust user-supplied forwarding headers as client IDs.
export const throttleSeatMap = createSeatMapRateLimiter({
  windowMs: 60_000,
  perClientLimit: 120,
  globalLimit: 900,
});
