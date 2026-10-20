// Location: src/lib/scanFocus.ts
// Asking the Bluetooth scanner's capture input to take focus again (B3, S3). The input lives in the scan box (Checkout,
// Pay, a lookup, sign in, the hardware pages) and retries its own focus every 1.5 seconds, but only while it believes
// nobody is typing. A field can be covered or torn out while it is still focused, so the guard's count stays up, the
// retries stop, and scans do nothing until a field is focused and blurred by hand. Waking the screensaver, and any raw
// key press that reaches the app while it is up, asks again here: that clears the stale count and puts the keyboard
// back in the input. Pure: no React, no React Native, unit-tested.
import { releaseFocusGuard } from './focusGuard';

let asks: (() => void)[] = [];
let flushCodes: ((code: string) => void)[] = [];
let requested = 0;

/** Called by a mounted, enabled scanner input. It returns the function that unregisters it. */
export function onRefocusAsked(f: () => void): () => void {
  asks.push(f);
  return () => { asks = asks.filter(x => x !== f); };
}

/**
 * A screen holding a scanner that is not mounted right now (Checkout, the one screen that takes scans on the main
 * grid) hands its scan handler over, so a barcode that arrives while the screensaver is up still adds to the cart
 * instead of being thrown away. Returns the function that unregisters it.
 */
export function onScanFlush(f: (code: string) => void): () => void {
  flushCodes.push(f);
  return () => { flushCodes = flushCodes.filter(x => x !== f); };
}

/**
 * Waking the screensaver or a raw key press calls this. It first clears the typing guard (that stale count is the
 * whole reason the input had stopped taking focus), then asks every mounted input to focus again. Returns how many
 * inputs were asked, so a caller can tell whether anything was listening.
 */
export function requestScanFocus(now = Date.now()): number {
  releaseFocusGuard(now);
  requested += 1;
  for (const f of [...asks]) { try { f(); } catch { /* an input that has gone away must not stop the others */ } }
  return asks.length;
}

/**
 * A code that arrived while no input was mounted (S3). Unlike requestScanFocus this does ask for focus: whoever holds
 * the scan handler is about to put its own box back on screen.
 */
export function offerScan(code: string, now = Date.now()): number {
  releaseFocusGuard(now);
  for (const f of [...flushCodes]) { try { f(code); } catch { /* a screen on its way out must not stop the others */ } }
  return flushCodes.length;
}

/** How many times focus has been asked for, so a component can react to a request that arrived while it was unmounted. */
export const refocusRequests = (): number => requested;
/** Test helper. */
export function resetScanFocus(): void { asks = []; flushCodes = []; requested = 0; }
