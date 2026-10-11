// Location: src/lib/confetti.ts
// Confetti pieces for the Done screen. Seeded so it is the same every time for the same seed (and testable).
export type Piece = { x: number; delay: number; dur: number; drift: number; spin: number; color: number; w: number; h: number };
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** x is 0 to 1 across the screen, delay and dur are in ms, drift is sideways travel as a share of width, spin is turns. */
export function makeConfetti(count: number, seed: number, colours: number): Piece[] {
  const r = rng(seed); const n = Math.max(0, Math.min(200, Math.floor(count)));
  return Array.from({ length: n }, () => ({ x: r(), delay: Math.round(r() * 700), dur: 1800 + Math.round(r() * 1400), drift: (r() - 0.5) * 0.3, spin: 1 + Math.round(r() * 4), color: Math.floor(r() * Math.max(1, colours)), w: 6 + Math.round(r() * 6), h: 10 + Math.round(r() * 8) }));
}
export const CONFETTI_COLOURS = ['#16A34A', '#F59E0B', '#2563EB', '#DB2777', '#7C3AED', '#0EA5E9'];
