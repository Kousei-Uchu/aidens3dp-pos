// Location: tests/trainingpalette.test.ts
// The spotlight takes its colours from the theme, and the ring is always clearly visible on the dim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BRAND_ORANGE, RING_CONTRAST, blend, contrast, dimOf, luminance, mix, parseColor, spotlightPalette } from '../src/lib/trainingPalette';

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

test('the ring is the brand orange in every built-in look, whatever the accent', () => {
  for (const [t, isDark] of [[light, false], [dark, true], [brand, true]] as const) for (const a of [t.accent, '#2563EB', '#000000', '#FFFFFF']) {
    const p = spotlightPalette({ ...t, accent: a }, isDark); assert.equal(p.ring.toLowerCase(), '#fb873f'); assert.equal(p.glow.toLowerCase(), '#fb873f');
    assert.ok(contrast(parseColor(p.ring)!, seenOn(t, isDark)) >= RING_CONTRAST, `orange is visible on the ${isDark ? 'dark' : 'light'} dim`);
  }
  assert.equal(BRAND_ORANGE.toLowerCase(), '#fb873f');
});

test('a theme whose dim swallows the orange gets a lighter orange instead', () => {
  const odd = { bg: '#FB873F', card: '#FB873F', text: '#FB873F', accent: '#000' }; const p = spotlightPalette(odd, false);
  assert.ok(luminance(parseColor(p.ring)!) > luminance(parseColor(BRAND_ORANGE)!), 'lighter than the brand orange');
});

test('the text on the ring is readable, and the dim belongs to the theme', () => {
  for (const [t, isDark] of [[light, false], [dark, true], [brand, true]] as const) {
    const p = spotlightPalette(t, isDark); const on = parseColor(p.onRing)!; assert.ok(contrast(on, parseColor(p.ring)!) >= 4.5, `${p.onRing} on ${p.ring}`);
  }
  assert.match(spotlightPalette(brand, true).dim, /^rgba\(19, 17, 28, /, 'the brand dim is the plum, not black'); assert.match(spotlightPalette(light, false).dim, /^rgba\(17, 17, 17, /);
  assert.ok(dimOf(dark, true).a > dimOf(light, false).a, 'a dark page needs a stronger dim to read as dimmed');
});

test('unreadable theme values still give a visible orange ring', () => {
  const p = spotlightPalette({ bg: 'weird', card: 'weird', text: 'weird', accent: 'weird' }, true); assert.equal(p.ring.toLowerCase(), '#fb873f'); assert.ok(p.dim.startsWith('rgba('));
});

test('the built-in looks above match the app theme file, and no training screen hard codes the old amber', () => {
  const theme = fs.readFileSync('src/ui/theme.tsx', 'utf8');
  for (const t of [light, dark, brand]) for (const v of [t.bg, t.card, t.accent]) assert.ok(theme.includes(`'${v}'`), `${v} is in theme.tsx`);
  for (const f of ['src/ui/TrainingOverlay.tsx', 'src/ui/DemoView.tsx', 'src/ui/TrainingDock.tsx', 'src/screens/TrainingRun.tsx']) assert.ok(!/F59E0B/i.test(fs.readFileSync(f, 'utf8')), `${f} still hard codes the amber`);
});
