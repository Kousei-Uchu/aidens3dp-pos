// Location: tests/trainingadjustreview.test.ts
// The "Review price adjustments" course: valid and registered after items, the two checks cover denied role and allowed role.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustReview } from '../src/training/modules/adjust-review';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { isKnownSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { PRACTICE_CASEY, PRACTICE_MORGAN } from '../src/lib/trainingSandbox';

const snap = (o: { staffId?: string; paying?: boolean } = {}): TrainSnap =>
  snapOf({ tab: 'checkout', route: o.paying ? 'pay' : '', sheets: 0, cart: { lines: [] }, sales: 0, paying: !!o.paying, staffId: o.staffId });

const until = (list: any[], id: string) => list.find((x: any) => x.id === id).until;
const won = (list: any[], id: string, s: TrainSnap) => isMet(until(list, id), s, noEvents());

test('the course is registered after items and is valid', () => {
  assert.equal(getModule('adjust-review'), adjustReview);
  assert.ok(MODULES.findIndex(m => m.id === 'adjust-review') > MODULES.findIndex(m => m.id === 'items'));
  assert.deepEqual(validateModule(adjustReview, isKnownSpot), []);
});

test('Check 1 requires Casey to reach pay', () => {
  assert.ok(!won(adjustReview.check1, 'c1-review', snap({ paying: false, staffId: PRACTICE_CASEY })));
  assert.ok(won(adjustReview.check1, 'c1-review', snap({ paying: true, staffId: PRACTICE_CASEY })));
  assert.ok(!won(adjustReview.check1, 'c1-review', snap({ paying: true, staffId: PRACTICE_MORGAN })));
});

test('Check 2 requires Morgan to reach pay', () => {
  assert.ok(won(adjustReview.check2, 'c2-keep', snap({ paying: true, staffId: PRACTICE_MORGAN })));
  assert.ok(!won(adjustReview.check2, 'c2-keep', snap({ paying: true, staffId: PRACTICE_CASEY })));
  assert.ok(!won(adjustReview.check2, 'c2-keep', snap({ paying: false, staffId: PRACTICE_MORGAN })));
});

test('Check 2 says where it was taught', () => {
  for (const g of adjustReview.check2) {
    assert.ok(g.inject?.length && g.taughtBy);
    const taught = [...adjustReview.info.steps, ...adjustReview.show.steps, ...adjustReview.guide].some(s => s.id === g.taughtBy);
    assert.ok(taught, `${g.id} names a real step`);
  }
});