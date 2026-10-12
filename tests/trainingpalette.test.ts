// Location: tests/trainingpalette.test.ts
// The spotlight takes its colours from the theme, and the ring is always clearly visible on the dim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RING_CONTRAST, blend, contrast, dimOf, luminance, mix, parseColor, spotlightPalette } from '../src/lib/trainingPalette';

// The three built-in looks, copied from src/ui/theme.tsx (a test below checks they have not drifted).
const light = { bg: '#F4F4F5', card: '#FFFFFF', text: '#111111', accent: '#111111' };
const dark = { bg: '#0B0B0C', card: '#1A1A1C', text: '#F4F4F5', accent: '#F4F4F5' };
const brand = { bg: '#13111C', card: '#1C1924', text: '#EFD8C9', accent: '#FAE9DC' };
const seenOn = (t: typeof light, isDark: boolean) => blend(dimOf(t, isDark), parseColor(t.bg)!);

test('colour maths: parsing, luminance and contrast', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 }); assert.deepEqual(parseColor('#13111C'), { r: 19, g: 17, b: 28, a: 1 });
  assert.equal(parseColor('rgba(239,216,201,0.16)')!.a, 0.16); assert.equal(parseColor('nonsense'), null); assert.equal(parseColor(undefined), null);
  const w = parseColor('#fff')!; const k = parseColor('#000')!; assert.ok(Math.abs(contrast(w, k) - 21) < 0.01); assert.equal(luminance(k), 0); assert.ok(Math.abs(luminance(w) - 1) < 1e-6);
  assert.deepEqual(mix(k, w, 0.5), { r: 127.5, g: 127.5, b: 127.5, a: 1 });
});

test('the brand look uses its own peach accent, the dark look its near white, the light look a white ring', () => {
  assert.equal(spotlightPalette(brand, true).ring.toLowerCase(), '#fae9dc'); assert.equal(spotlightPalette(dark, true).ring.toLowerCase(), '#f4f4f5');
  assert.equal(spotlightPalette(light, false).ring.toLowerCase(), '#ffffff'); // the accent is near black, which the dim would swallow
});

test('the ring stands out from the dim in every look and for any accent a person could choose', () => {
  const accents = ['#2563EB', '#DC2626', '#16A34A', '#7C3AED', '#DB2777', '#F59E0B', '#0EA5E9', '#000000', '#222222', '#FFFFFF', '#444444', '#1E3A8A', '#064E3B', '#831843', '#E5E7EB'];
  for (const [t, isDark] of [[light, false], [dark, true], [brand, true]] as const) for (const a of accents) {
    const p = spotlightPalette({ ...t, accent: a }, isDark); const ring = parseColor(p.ring)!;
    assert.ok(contrast(ring, seenOn(t, isDark)) >= RING_CONTRAST, `accent ${a} on ${isDark ? 'dark' : 'light'} gives ring ${p.ring} (contrast ${contrast(ring, seenOn(t, isDark)).toFixed(2)})`);
  }
});

test('a chosen accent is kept when it already stands out, and lightened (not replaced) when it does not', () => {
  assert.equal(spotlightPalette({ ...dark, accent: '#F59E0B' }, true).ring.toLowerCase(), '#f59e0b');
  const lifted = parseColor(spotlightPalette({ ...light, accent: '#2563EB' }, false).ring)!; const orig = parseColor('#2563EB')!;
  assert.ok(lifted.b > lifted.r && lifted.b >= orig.b, 'still blue'); assert.ok(luminance(lifted) > luminance(orig), 'lighter than the chosen blue');
});

test('the text on the ring is readable, and the dim belongs to the theme', () => {
  for (const [t, isDark] of [[light, false], [dark, true], [brand, true]] as const) {
    const p = spotlightPalette(t, isDark); const on = parseColor(p.onRing)!; assert.ok(contrast(on, parseColor(p.ring)!) >= 4.5, `${p.onRing} on ${p.ring}`);
  }
  assert.match(spotlightPalette(brand, true).dim, /^rgba\(19, 17, 28, /, 'the brand dim is the plum, not black'); assert.match(spotlightPalette(light, false).dim, /^rgba\(17, 17, 17, /);
  assert.ok(dimOf(dark, true).a > dimOf(light, false).a, 'a dark page needs a stronger dim to read as dimmed');
});

test('unreadable theme values fall back to something visible', () => {
  const p = spotlightPalette({ bg: 'weird', card: 'weird', text: 'weird', accent: 'weird' }, true); assert.equal(p.ring.toLowerCase(), '#ffffff'); assert.ok(p.dim.startsWith('rgba('));
});

test('the built-in looks above match the app theme file, and no training screen hard codes the old amber', () => {
  const theme = fs.readFileSync('src/ui/theme.tsx', 'utf8');
  for (const t of [light, dark, brand]) for (const v of [t.bg, t.card, t.accent]) assert.ok(theme.includes(`'${v}'`), `${v} is in theme.tsx`);
  for (const f of ['src/ui/TrainingOverlay.tsx', 'src/ui/DemoView.tsx', 'src/ui/TrainingDock.tsx', 'src/screens/TrainingRun.tsx']) assert.ok(!/F59E0B/i.test(fs.readFileSync(f, 'utf8')), `${f} still hard codes the amber`);
});
