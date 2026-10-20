// Location: src/lib/scanFeedback.ts
// The scan popup's timing and the feeling that goes with a scan (S4, S5). Pure: no React Native, so the slopes, the
// shake height and the failure test all run in the node tests. The popup is a confirmation, but a miss matters just as
// much: an unknown code should look and feel wrong, and it should clear itself sooner because then the till is waiting.
export const POPUP_HOLD_MS = 3000; // fully opaque this long, so the name can be read without hurrying
export const POPUP_FADE_MS = 2000; // then a rising slope, gone by 5 seconds
export const POPUP_GONE_MS = POPUP_HOLD_MS + POPUP_FADE_MS;
export const MISS_HOLD_MS = 2200; // a miss is a glance, not something to study
export const MISS_FADE_MS = 2000;
export const MISS_GONE_MS = MISS_HOLD_MS + MISS_FADE_MS;

/** Scan popup timing for a hit (a glance and gone) and a miss (longer, because there is more to read). */
export const popupTiming = (ok: boolean) => (ok
  ? { holdMs: POPUP_HOLD_MS, fadeMs: POPUP_FADE_MS, goneMs: POPUP_GONE_MS }
  : { holdMs: MISS_HOLD_MS, fadeMs: MISS_FADE_MS, goneMs: MISS_GONE_MS });

/**
 * Opacity through the popup's life: 1 until the hold is up, then a rising slope: it barely moves at first (so the name
 * is still readable just after the hold) and then falls away quickly, gone by `goneMs`. A straight line reads as a dull
 * drift; squaring the fraction gives the curve (slow, then steep). Anything at or past the end is 0.
 */
export function popupOpacity(elapsedMs: number, ok = true): number {
  const { holdMs, fadeMs } = popupTiming(ok);
  if (!(elapsedMs > holdMs)) return 1;
  const k = Math.min(1, (elapsedMs - holdMs) / fadeMs);
  return 1 - k ** 2;
}

/** True while the popup still has something to show, so the parent can drop it from the tree at the end. */
export const popupAlive = (elapsedMs: number, ok = true): boolean => elapsedMs < popupTiming(ok).goneMs;

/**
 * What the scanner should say back about a code (S4). The camera and the keyboard paths share this so they cannot drift:
 * a miss is anything with no confirmation text from the scan handler, which returns a string for a hit and null for a
 * miss (see `onScan` in `src/screens/Checkout.tsx`). Named so tests read both sides.
 */
export type ScanReply = { ok: boolean; text: string };
export function scanReply(result: string | null, code: string): ScanReply {
  const ok = !!(result && result.trim());
  const text = ok ? result! : `No item for ${code.trim()}`;
  return { ok, text };
}

/**
 * Where a valid or a miss scan should sit in a feedback ladder of `steps` steps. `valid` tells the two apart, and
 * `strength` (0 to 1) lets a screen dial a particular kind of miss down: a gift card is not a product, but it is not a
 * wrong code either. The result is always inside the ladder.
 */
export function feedbackLevel(valid: boolean, steps: number, strength = 1): number {
  const n = Math.max(1, Math.floor(steps));
  const s = Math.max(0, Math.min(1, strength));
  if (valid) return n - 1;
  return Math.max(0, n - 1 - Math.round((n - 1) * s));
}

/**
 * The sideways wobble for a miss, in points, at `elapsedMs` into the shake. A whole number of damped sine waves: it
 * starts at the full height, crosses zero twice per wave, and settles back to zero when it is over. Points rather than
 * pixels so React Native puts it on the screen pixel grid.
 */
export function shakeOffset(elapsedMs: number, height = 12, cycles = 3, durationMs = 520): number {
  if (!(elapsedMs > 0) || elapsedMs >= durationMs) return 0;
  const t = elapsedMs / durationMs;
  const damp = (1 - t) ** 2;
  return Math.round(Math.sin(t * cycles * 2 * Math.PI) * height * damp);
}
