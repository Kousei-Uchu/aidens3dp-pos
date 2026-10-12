import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANNED_TITLES, REMEDIES, moduleTitle, remedyOf, showHowAtOnce } from '../src/lib/trainingRemedies';
import { diagnose } from '../src/lib/trainingCourse';
import { snapOf } from '../src/lib/trainingConds';
import { validateModule } from '../src/lib/trainingModule';
import { isKnownSpot } from '../src/lib/trainingSpots';
import { welcome } from '../src/training/modules/welcome';

const frame = { tabs: ['checkout'], routes: ['cart'] };
const line = (variantId: string, qty = 1) => ({ variantId, title: variantId.replace('train-v-', ''), kind: 'item' as const, qty });
const snap = (o: Partial<{ tab: string; route: string; sheets: number; lines: ReturnType<typeof line>[]; sales: number; customer: boolean; note: string; discount: boolean }> = {}) =>
  snapOf({ tab: o.tab ?? 'checkout', route: o.route ?? '', sheets: o.sheets ?? 0, cart: { lines: o.lines ?? [], customer: o.customer ? {} : undefined, discount: o.discount ? {} : undefined, note: o.note }, sales: o.sales ?? 0, paying: false });

test('every way of straying has steps to put it right, in plain words', () => {
  const kinds = ['sale', 'tender', 'place', 'sheet', 'lost', 'extra', 'qty', 'discount', 'adjust', 'customer', 'note'];
  assert.deepEqual(Object.keys(REMEDIES).sort(), kinds.sort());
  for (const [k, r] of Object.entries(REMEDIES)) {
    assert.ok(r.how.length >= 1, k);
    for (const h of r.how) { assert.ok(h.trim().length > 5, `${k}: ${h}`); assert.doesNotMatch(h, /[\u2013\u2014]/, `${k} has a dash`); assert.doesNotMatch(h, /\p{Extended_Pictographic}/u, `${k} has an emoji`); }
    if (r.module) assert.ok(PLANNED_TITLES[r.module], `${k} names ${r.module}, which has no planned title`);
  }
});
test('the two that can only be fixed by starting again teach nothing', () => {
  assert.equal(REMEDIES.sale.module, undefined); assert.equal(REMEDIES.tender.module, undefined);
});
test('diagnose hands over the steps and the module that teaches them', () => {
  const d = diagnose({ allow: [] }, frame, snap(), snap({ lines: [line('train-v-egg')] }))!;
  assert.equal(d.kind, 'extra'); assert.equal(d.taughtIn, 'cart'); assert.deepEqual(d.how, REMEDIES.extra.how);
  assert.equal(diagnose({ allow: [] }, frame, snap(), snap({ customer: true }))!.taughtIn, 'customer');
  assert.equal(diagnose({ allow: [] }, frame, snap(), snap({ sales: 1 }))!.taughtIn, undefined);
});
test('a module\'s own watch rule brings its own steps', () => {
  const g = { allow: [], watch: [{ id: 'w', when: () => true, say: 'No.', how: ['Do this.'], taughtIn: 'cart' }] };
  const d = diagnose(g, frame, snap(), snap())!; assert.equal(d.kind, 'watch'); assert.deepEqual(d.how, ['Do this.']); assert.equal(d.taughtIn, 'cart');
  const bare = diagnose({ allow: [], watch: [{ id: 'w', when: () => true, say: 'No.' }] }, frame, snap(), snap())!; assert.deepEqual(bare.how, []); assert.equal(bare.taughtIn, undefined);
  assert.deepEqual(remedyOf('watch'), { how: [], taughtIn: undefined });
});
test('steps show at once until the module that teaches them is finished', () => {
  assert.equal(showHowAtOnce('cart', false), true);
  assert.equal(showHowAtOnce('cart', true), false);
  assert.equal(showHowAtOnce(undefined, true), true, 'nothing teaches a restart, so say what to do');
});
test('titles: a built module wins, then the planned title, then the id', () => {
  assert.equal(moduleTitle('cart', { title: 'Build a cart, v2' }), 'Build a cart, v2');
  assert.equal(moduleTitle('cart'), 'Build a cart');
  assert.equal(moduleTitle('mystery'), 'mystery');
});
test('the welcome course watch rules carry steps, and the checker still passes', () => {
  assert.deepEqual(validateModule(welcome, isKnownSpot), []);
  for (const w of [...welcome.guide.flatMap(s => s.watch ?? []), ...welcome.check2.flatMap(g => g.watch ?? [])]) assert.ok((w.how ?? []).length > 0, w.id);
  const bad = { ...welcome, guide: welcome.guide.map(s => ({ ...s, watch: [{ id: 'x', when: () => false, say: 'Hi', how: [' '] }] })) };
  assert.match(validateModule(bad, isKnownSpot).join('\n'), /empty step in how/);
});
