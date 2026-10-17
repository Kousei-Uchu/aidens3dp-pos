// Location: src/lib/scanSpeed.ts
// Timing a scanner's speed test, and calibrating what the timings mean. Pure, no React.
//   - `noteChange` / `measure`: watch the hidden scan box fill up, then work out ms per character for that scan.
//   - Calibration: an admin scans the test code at each speed a few times; the measured range for each speed replaces the manual's,
//     so the app judges the scanner the way it actually sees it (iPad and app delays included). It is shared through a Shopify metaobject.
import { DEFAULT_SPEED_RANGES, SPEED_TABLE, type SpeedId, type SpeedRanges } from './scannerCodes';

/** The test code's text (see scannerCodes.ts, id `speed-test`). */
export const SPEED_TEST_TEXT = 'HID_SCANNER_SPEED_TEST';

// ── timing one scan ──────────────────────────────────────────────────────────────────────────────
export type Timing = { first: number | null; last: number; len: number };
export const newTiming = (): Timing => ({ first: null, last: 0, len: 0 });
/** Call every time the scan box's text changes. A shorter text means a fresh start. `now` is a millisecond clock (performance.now()). */
export function noteChange(t: Timing, text: string, now: number): Timing {
  if (!text) return newTiming();
  if (t.first === null || text.length < t.len) return { first: now, last: now, len: text.length };
  return { first: t.first, last: now, len: text.length };
}
export type Measurement = { code: string; chars: number; totalMs: number; msPerChar: number };
/** The result for a finished scan (Return pressed), or null when there is not enough to time (under 2 characters, or no changes seen). */
export function measure(t: Timing, code: string): Measurement | null {
  if (t.first === null || code.length < 2) return null;
  const totalMs = Math.max(0, t.last - t.first); const gaps = Math.max(code.length - 1, 1);
  return { code, chars: code.length, totalMs, msPerChar: totalMs / gaps };
}

// ── calibration ──────────────────────────────────────────────────────────────────────────────────
export type ScannerCalibration = { version: 1; ranges: SpeedRanges; updatedBy: string; updatedAt: string };
export const MIN_SAMPLES = 3; export const MAX_SAMPLES = 12;
export const SPEED_IDS: SpeedId[] = SPEED_TABLE.map(s => s.codeId);
export const SPEED_NAME: Record<SpeedId, string> = Object.fromEntries(SPEED_TABLE.map(s => [s.codeId, s.name])) as Record<SpeedId, string>;

/** Who may calibrate: managers and owners (the admins). The setting is shared with every register, so cashiers only read it. */
export const canCalibrate = (role: 'cashier' | 'manager' | 'owner'): boolean => role === 'manager' || role === 'owner';

/** A range from measured samples (ms per character): the lowest to the highest, widened a little (10% of the average, at least 0.5 ms). */
export function rangeFromSamples(samples: number[]): { minMs: number; maxMs: number } {
  const good = samples.filter(n => Number.isFinite(n) && n >= 0);
  if (good.length < MIN_SAMPLES) throw new Error(`Scan the test code at least ${MIN_SAMPLES} times first`);
  const mean = good.reduce((a, b) => a + b, 0) / good.length; const pad = Math.max(0.5, mean * 0.1); const r1 = (n: number) => Math.round(n * 10) / 10;
  return { minMs: Math.max(0, r1(Math.min(...good) - pad)), maxMs: r1(Math.max(...good) + pad) };
}
/** Problems that stop a calibration being saved: a backwards range, or speeds out of order (Fast must read quicker than Medium, and so on). */
export function calibrationProblems(r: SpeedRanges): string[] {
  const out: string[] = [];
  for (const id of SPEED_IDS) { const x = r[id]; if (!x || !Number.isFinite(x.minMs) || !Number.isFinite(x.maxMs) || x.minMs < 0 || x.minMs > x.maxMs) out.push(`${SPEED_NAME[id]} has an unusable range.`); }
  if (out.length) return out;
  for (let i = 1; i < SPEED_IDS.length; i++) {
    const a = r[SPEED_IDS[i - 1]]; const b = r[SPEED_IDS[i]];
    if ((a.minMs + a.maxMs) / 2 >= (b.minMs + b.maxMs) / 2) out.push(`${SPEED_NAME[SPEED_IDS[i - 1]]} should measure faster than ${SPEED_NAME[SPEED_IDS[i]]}. Check which speed the scanner was on when you scanned.`);
  }
  return out;
}
export const withRange = (r: SpeedRanges, id: SpeedId, range: { minMs: number; maxMs: number }): SpeedRanges => ({ ...r, [id]: range });
/** Ranges in use: the shared calibration, or the manual's. */
export const effectiveRanges = (cal: ScannerCalibration | null | undefined): SpeedRanges => cal?.ranges ?? DEFAULT_SPEED_RANGES;

/** Read a calibration from stored or downloaded JSON. Anything unusable gives null, so a bad value never breaks scanning. */
export function readCalibration(raw: unknown): ScannerCalibration | null {
  let x: any = raw; if (typeof x === 'string') { try { x = JSON.parse(x); } catch { return null; } }
  if (!x || typeof x !== 'object' || x.version !== 1 || !x.ranges) return null;
  const ranges = {} as SpeedRanges;
  for (const id of SPEED_IDS) { const m = x.ranges[id]; if (!m || typeof m.minMs !== 'number' || typeof m.maxMs !== 'number') return null; ranges[id] = { minMs: m.minMs, maxMs: m.maxMs }; }
  if (calibrationProblems(ranges).length) return null;
  return { version: 1, ranges, updatedBy: typeof x.updatedBy === 'string' ? x.updatedBy : '', updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : '' };
}
export const describeRange = (r: { minMs: number; maxMs: number }): string => `${r.minMs} to ${r.maxMs} ms`;
