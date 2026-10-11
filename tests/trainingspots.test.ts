// Location: tests/trainingspots.test.ts
// Reads the source so a module can never point at a spot that is not in the UI, or use an icon that does not exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SPOT, STATIC_SPOTS, isKnownSpot } from '../src/lib/trainingSpots';
import { MODULES } from '../src/training';
import { validateModule, type Goal, type Step } from '../src/lib/trainingModule';
import { FIXTURE_VARIANTS, fixtureGrid } from '../src/lib/trainingSandbox';

const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
const ui = [...walk('src/screens'), ...walk('src/ui'), 'App.tsx'].filter(f => !f.includes('Training')).map(f => fs.readFileSync(f, 'utf8')).join('\n');

test('every static spot is attached to something in the UI', () => {
  for (const [name, id] of Object.entries(SPOT)) assert.ok(ui.includes(`SPOT.${name}`), `${id} (SPOT.${name}) is not used by any screen`);
  assert.equal(new Set(STATIC_SPOTS).size, STATIC_SPOTS.length, 'spot ids are unique');
});
test('the dynamic spot kinds are really attached (grid tiles, cart lines)', () => {
  assert.ok(ui.includes('tileSpotId('), 'grid tiles carry spots'); assert.ok(ui.includes('cartLineSpot('), 'cart lines carry spots');
});
test('every module is valid, and every record spot it names exists in the practice data', () => {
  const vids = new Set(FIXTURE_VARIANTS.map(v => v.id)); const tiles = fixtureGrid().pages[0].tiles;
  const tileIds = new Set(tiles.flatMap(t => (t.type === 'item' ? [t.variantId ?? t.productId!] : [])));
  const spots = (m: (typeof MODULES)[number]): string[] => [...m.guide.flatMap((s: Step) => [s.target, s.recover?.target, s.until.kind === 'press' || s.until.kind === 'visible' ? s.until.id : undefined]), ...[...m.check1, ...m.check2].flatMap((g: Goal) => [g.reveal, g.via, g.until.kind === 'press' || g.until.kind === 'visible' ? g.until.id : undefined])].filter((x): x is string => !!x);
  const ids = new Set(MODULES.map(m => m.id)); assert.equal(ids.size, MODULES.length, 'module ids are unique');
  for (const m of MODULES) {
    assert.deepEqual(validateModule(m, isKnownSpot), []);
    for (const s of spots(m)) {
      if (s.startsWith('grid.item:')) assert.ok(tileIds.has(s.slice(10)), `${m.id}: no grid tile for ${s}`);
      if (s.startsWith('cart.line:')) assert.ok(vids.has(s.slice(10)), `${m.id}: no practice item for ${s}`);
    }
    for (const g of [...m.check1, ...m.check2]) for (const i of g.inject ?? []) if (i.kind === 'cart') for (const it of i.items) assert.ok(vids.has(it.variantId), `${m.id}: unknown practice item ${it.variantId}`);
  }
});
test('every icon a scene uses exists in Ionicons', () => {
  const map = JSON.parse(fs.readFileSync('node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json', 'utf8'));
  for (const m of MODULES) for (const a of [...m.info.actors, ...m.show.actors]) assert.ok(a.icon in map, `${m.id}: icon "${a.icon}" does not exist`);
});
test('copy has no em dashes, and no emoji, in any module', () => {
  const text = (m: (typeof MODULES)[number]) => JSON.stringify(m, (_k, v) => (typeof v === 'function' ? '' : v));
  for (const m of MODULES) { const t = text(m); assert.ok(!/[\u2014\u2013]/.test(t), `${m.id} has a dash used as punctuation`); assert.ok(!/\p{Extended_Pictographic}/u.test(t), `${m.id} has an emoji`); }
});
