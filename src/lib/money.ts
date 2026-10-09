// Money is ALWAYS integer cents inside the app (matches the Zeller SDK).
// Shopify returns decimal strings – convert at the edge only.

export const CURRENCY = 'AUD';

/** "12.50" | 12.5 | null → 1250. Parses the string form to avoid float drift. */
export function toCents(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const s = typeof v === 'number' ? v.toFixed(2) : String(v).trim();
  const neg = s.startsWith('-');
  const [w, f = ''] = s.replace(/^[-+]/, '').split('.');
  const whole = parseInt(w || '0', 10) || 0;
  const frac = Math.round(parseFloat('0.' + (f || '0')) * 100);
  const c = whole * 100 + frac;
  return neg ? -c : c;
}

/** 1250 → "12.50" (Shopify decimal string). */
export function toDecimal(c: number): string {
  const neg = c < 0;
  const a = Math.abs(Math.round(c));
  return `${neg ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

/** 1250 → "$12.50"; -100 → "-$1.00". */
export function fmt(c: number): string {
  const neg = c < 0;
  const a = Math.abs(Math.round(c));
  const dollars = Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}$${dollars}.${String(a % 100).padStart(2, '0')}`;
}

/**
 * Swedish/Australian 5c cash rounding, applied to the cash-DUE amount only.
 * last digit 1,2 → 0 · 3,4 → 5 · 6,7 → 5 · 8,9 → 10
 */
export function roundCash(c: number): number {
  return Math.floor((c + 2) / 5) * 5;
}

/**
 * Split `total` cents across `weights` proportionally (largest-remainder).
 * Any leftover cent goes to the heaviest weights first, so the sum is always exact.
 */
export function allocate(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map(w => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), w: weights[i] }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w);
  for (let k = 0; rem > 0 && k < order.length; k++, rem--) out[order[k].i] += 1;
  return out;
}

/** Digits typed on a keypad ("1250") → cents. 8 digits max. */
export const digitsToCents = (d: string) => (d ? parseInt(d.slice(0, 8), 10) : 0);

/** Percentage helper in cents, round half up. pct may be fractional (12.5). */
export const pctOf = (cents: number, pct: number) => Math.round((cents * pct) / 100);

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
