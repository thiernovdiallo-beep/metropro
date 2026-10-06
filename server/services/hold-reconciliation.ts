import { expireStaleHolds } from "./inventory";

let lastSuccessfulRun = 0;
let running: Promise<void> | null = null;

/** Keep public remaining-seat counters consistent with expired Checkout holds.
 * A 15-second process-local gate avoids a database sweep on every search or
 * trip view; checkout still runs the unthrottled worker before any new sale. */
export function reconcileExpiredHolds(now = Date.now()): Promise<void> {
  if (running) return running;
  if (now - lastSuccessfulRun < 15_000) return Promise.resolve();
  running = expireStaleHolds(new Date(now)).then(() => { lastSuccessfulRun = Date.now(); })
    .finally(() => { running = null; });
  return running;
}
