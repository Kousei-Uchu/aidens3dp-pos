// Location: src/lib/hintPulse.ts
// The one-off pulse that shows a hint has been given (B6 Check), and the small pure helpers for the hint toast. Pure, tested (tests/hintpulse.test.ts).
//
// The curve is the one asked for: intensity(t) = 48.225 * t^2 * (0.8 - t)^3, with t in seconds.
// It is 0 at t = 0, rises to its peak at t = 0.32 s (about 0.546), and is back to 0 at t = 0.8 s. Past 0.8 the expression goes negative,
// so it is held at 0 there: the pulse lasts exactly 0.8 s. The drawing is in src/ui/HintPulse.tsx.

/** How long one pulse lasts, in seconds. The curve is zero from here on. */
export const PULSE_SECONDS = 0.8;
/** Where the curve peaks, in seconds (the root of its slope: 2(0.8 - t) = 3t). */
export const PULSE_PEAK_AT = 0.32;

/** The curve itself. Zero before the pulse starts, after it ends, and for anything that is not a number. */
export function pulseIntensity(t: number): number {
  if (!Number.isFinite(t) || t <= 0 || t >= PULSE_SECONDS) return 0;
  return 48.225 * Math.pow(t, 2) * Math.pow(PULSE_SECONDS - t, 3);
}
/** The highest value the curve reaches (at PULSE_PEAK_AT). */
export const PULSE_PEAK = pulseIntensity(PULSE_PEAK_AT);

/** How much the container grows at full intensity: 1 + gain * intensity, so the peak is about 8% bigger. */
export const PULSE_SCALE_GAIN = 0.15;
/** How strongly the tint and edge are drawn at full intensity (0 to 1 of the colour). */
export const PULSE_TINT_ALPHA = 0.22;
export const pulseScale = (intensity: number): number => 1 + PULSE_SCALE_GAIN * intensity;
/** Colour strength from 0 to 1: the curve divided by its own peak, so the colour is at full strength exactly at the peak. */
export const pulseMix = (intensity: number): number => Math.max(0, Math.min(1, intensity / PULSE_PEAK));

export type PulseSamples = { t: number[]; intensity: number[]; scale: number[]; mix: number[] };
/**
 * The curve sampled for `Animated.Value.interpolate` (so it can run on the native thread): `t` is the input range, in seconds, and
 * `intensity`, `scale` and `mix` are matching output ranges. The peak is always one of the samples, so it is hit exactly.
 */
export function pulseSamples(steps = 48): PulseSamples {
  const ts = new Set<number>();
  for (let i = 0; i <= steps; i++) ts.add(Math.round((PULSE_SECONDS * i / steps) * 1e6) / 1e6);
  ts.add(PULSE_PEAK_AT);
  const t = [...ts].sort((a, b) => a - b); const intensity = t.map(pulseIntensity);
  return { t, intensity, scale: intensity.map(pulseScale), mix: intensity.map(pulseMix) };
}

/** The title of the hint toast: which hint this is, or that it is the answer. */
export function hintLabel(level: number, left: number, answer: boolean): string {
  if (answer) return 'The answer';
  const l = Math.max(1, Math.round(level)); return `Hint ${l} of ${l + Math.max(0, Math.round(left))}`;
}
/** How long the toast stays on the main screen (the bar keeps the text): long enough to read it, never less than 6 s or more than 14 s. */
export const toastMs = (chars: number): number => Math.round(Math.max(6000, Math.min(14000, 3000 + Math.max(0, chars) * 60)));
