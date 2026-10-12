// Location: src/lib/trainingPalette.ts
// The colours of the training spotlight (B6): the ring, the dim, the glow and the text on the ring. The ring, pointer and glow are the brand orange in every look
// (patch 0080 made them follow the theme accent, which gave peach or near white). The dim still belongs to the theme. The ring sits on the dimmed screen, so it must
// stand out from the DIM: the orange does in all three built-in looks, and only an odd theme gets a lightened orange. Pure, tested (tests/trainingpalette.test.ts).
export type Rgb = { r: number; g: number; b: number; a: number };
const hex2 = (n: number): string => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

/** Reads #RGB, #RRGGBB, #RRGGBBAA, rgb() and rgba(). Anything else is null. */
export function parseColor(s: string | undefined | null): Rgb | null {
  if (!s) return null; const t = s.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(t); if (m) { const [r, g, b] = m[1].split('').map(h => parseInt(h + h, 16)); return { r, g, b, a: 1 }; }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(t); if (m) { const v = m[1]; return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16), a: m[2] ? parseInt(m[2], 16) / 255 : 1 }; }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(t);
  if (m) { const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]); return { r: +m[1], g: +m[2], b: +m[3], a: Math.max(0, Math.min(1, a)) }; }
  return null;
}
export const toHex = (c: Rgb): string => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
export const rgba = (c: Rgb, a: number): string => `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Math.round(a * 1000) / 1000})`;
/** `over` painted on `under` (alpha respected). */
export const blend = (over: Rgb, under: Rgb): Rgb => ({ r: over.r * over.a + under.r * (1 - over.a), g: over.g * over.a + under.g * (1 - over.a), b: over.b * over.a + under.b * (1 - over.a), a: 1 });
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: 1 });
/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(c: Rgb): number { const f = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

export type SpotlightPalette = { ring: string; onRing: string; dim: string; glow: string };
type ThemeLike = { bg: string; card: string; text: string; accent: string };
const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 }; const BLACK: Rgb = { r: 17, g: 17, b: 17, a: 1 };
/** The ring must be at least this far from the dim (3:1 is the usual line for a graphic that has to be seen). */
export const RING_CONTRAST = 3;

/** The dim: the theme's own dark (its background when the theme is dark, its ink when it is light), strong enough that the lit box is clear. */
export function dimOf(c: ThemeLike, dark: boolean): Rgb { const base = parseColor(dark ? c.bg : c.text) ?? BLACK; return { ...base, a: dark ? 0.74 : 0.72 }; }

/** The brand orange (the docs site's `--highlight`). The ring, the pointer and the progress bar are this colour in every look. */
export const BRAND_ORANGE = '#FB873F';
export function spotlightPalette(c: ThemeLike, dark: boolean): SpotlightPalette {
  const page = parseColor(c.bg) ?? (dark ? BLACK : WHITE); const dim = dimOf(c, dark); const seen = blend(dim, page); // what the ring is drawn over
  const brand = parseColor(BRAND_ORANGE)!; let ring = brand;
  // Only a theme whose dim happens to swallow the orange (not one of the built-in looks) gets a lightened orange, so it can never vanish.
  if (contrast(ring, seen) < RING_CONTRAST) for (let t = 0.1; t <= 0.8; t += 0.1) { ring = mix(brand, WHITE, t); if (contrast(ring, seen) >= RING_CONTRAST) break; }
  const onRing = contrast(ring, BLACK) >= contrast(ring, WHITE) ? '#111111' : '#FFFFFF';
  return { ring: toHex(ring), onRing, dim: rgba(dim, dim.a), glow: toHex(ring) };
}
