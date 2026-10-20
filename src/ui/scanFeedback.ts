// Location: src/ui/scanFeedback.ts
// The feeling that goes with a scan (S4). A miss has to be noticed without looking: a longer, heavier buzz than a hit,
// and a different pattern for a code the till does not know at all against one it recognises but cannot use here (a
// gift card at the grid, say). Every call is wrapped, so a device with no vibration simply gets the colour and the popup.
import * as Haptics from 'expo-haptics';

/** How hard the answer should land, 0 (a gentle nudge) to 1 (the code was wrong, look at the screen). */
export type Feel = { ok: boolean; strength?: number };

/**
 * A hit is two light ticks, so it reads as "done" rather than as an alert. A miss is one heavy buzz, and the heavier
 * the lower the strength. `strength` from a screen that knows the code was not *wrong*, only out of place, softens it.
 */
export function feelScan({ ok, strength = 1 }: Feel): void {
  try {
    if (ok) { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTimeout(() => { try { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* no haptics */ } }, 90); return; }
    const s = Math.max(0, Math.min(1, strength));
    const style = s > 0.6 ? Haptics.ImpactFeedbackStyle.Heavy : s > 0.25 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
    void Haptics.notificationAsync(s > 0.6 ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Warning);
    void Haptics.impactAsync(style);
  } catch { /* a device with no haptics still gets the popup */ }
}

/** The camera's shutter feeling, once per code, before the answer is known. */
export function feelCapture(): void { try { void Haptics.selectionAsync(); } catch { /* no haptics */ } }
