// Location: src/lib/scannerKeyboardHint.ts
// When a hardware keyboard (a Bluetooth HID scanner pairs as one) is connected, iOS and Android keep the on-screen keyboard hidden,
// so a person focused in a text field sees no keyboard. After a short quiet spell we remind them that double-clicking the
// scanner's trigger brings the keyboard up. Pure timing rules: no React / RN imports, unit-tested.

/** Quiet time (no typing) after focusing a field, or after the last keystroke, before the tip appears. */
export const HINT_IDLE_MS = 4000;
/** How long the tip stays up before it goes away by itself. */
export const HINT_SHOW_MS = 7000;
/** Minimum gap between two tips, so moving between fields never nags. */
export const HINT_COOLDOWN_MS = 90_000;
/** Points of screen the keyboard may cover and still count as "hidden". A hardware keyboard leaves at most a shortcut/Done bar (about 50-70pt). */
export const SOFT_KEYBOARD_MIN_OVERLAP = 120;

export const TIP_TEXT = 'Double-click the scanner trigger to show the keyboard';

let lastShownAt: number | null = null;
export const markHintShown = (now = Date.now()): void => { lastShownAt = now; };
/** Test helper. */
export const resetHintCooldown = (): void => { lastShownAt = null; };

/** True when a field is focused but the on-screen keyboard is not up (the sign of a connected hardware keyboard). */
export const softKeyboardHidden = (overlap: number): boolean => !(overlap >= SOFT_KEYBOARD_MIN_OVERLAP);

/**
 * Milliseconds until the tip is due, or null when it should not show at all (the on-screen keyboard is up, so the person can type).
 * `idleSince`: when the field was focused or last typed in. 0 means due now.
 */
export function hintDueIn(o: { now: number; idleSince: number; overlap: number; lastShown?: number | null }): number | null {
  if (!softKeyboardHidden(o.overlap)) return null;
  const last = o.lastShown === undefined ? lastShownAt : o.lastShown;
  const idleLeft = o.idleSince + HINT_IDLE_MS - o.now;
  const coolLeft = last == null ? 0 : last + HINT_COOLDOWN_MS - o.now;
  return Math.max(0, idleLeft, coolLeft);
}
