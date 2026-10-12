// Tests for the virtual terminal inside practice: spots, course settings, decline codes, and the shared practice terminal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES } from '../src/training';
import { validateModule, type Injection, type TrainingModule } from '../src/lib/trainingModule';
import { isKnownSpot, SPOT, STATIC_SPOTS } from '../src/lib/trainingSpots';
import { declineCodeOf, declinesOf } from '../src/lib/trainingSandbox';
import { resetTrainingTerminal, setDeclines, setManualCard, trainingTerminal, trainingVt, timing } from '../src/lib/trainingTerminal';
import { practiceWidth } from '../src/lib/virtualTerminal';
import { startCharge } from '../src/lib/zeller';

const welcome = MODULES[0] as TrainingModule;
const problems = (m: TrainingModule) => validateModule(m, isKnownSpot);
const withInject = (inject: Injection[]): TrainingModule => ({ ...welcome, check2: welcome.check2.map((g, i) => (i === 0 ? { ...g, inject, taughtBy: g.taughtBy ?? welcome.guide[0].id } : g)) });

test('the terminal spots are known, unique and named in the UI', () => {
  for (const id of ['terminal.tap', 'terminal.insert', 'terminal.remove', 'terminal.pinpad', 'terminal.pinok', 'terminal.cancel', 'terminal.done']) assert.ok(isKnownSpot(id), id);
  assert.equal(new Set(STATIC_SPOTS).size, STATIC_SPOTS.length); assert.equal(SPOT.terminalTap, 'terminal.tap');
});
test('a course may say who plays the customer, and only auto or manual are accepted', () => {
  assert.deepEqual(problems(welcome), []); assert.deepEqual(problems({ ...welcome, card: 'manual' }), []); assert.deepEqual(problems({ ...welcome, card: 'auto' }), []);
  assert.ok(problems({ ...welcome, card: 'robot' as any }).some(p => /card must be/.test(p)));
});
test('a decline injection needs 1 to 5 declines and a response code the app knows', () => {
  assert.deepEqual(problems(withInject([{ kind: 'decline', times: 2, code: 'QB' }])).filter(p => /declin/.test(p)), []);
  assert.ok(problems(withInject([{ kind: 'decline', times: 0 }])).some(p => /whole number from 1 to 5/.test(p)));
  assert.ok(problems(withInject([{ kind: 'decline', times: 9 }])).some(p => /whole number from 1 to 5/.test(p)));
  assert.ok(problems(withInject([{ kind: 'decline', times: 1, code: 'ZZZ' }])).some(p => /unknown response code "ZZZ"/.test(p)));
});
test('declineCodeOf: the code asked for, else 51; declinesOf still counts', () => {
  assert.equal(declineCodeOf(undefined), '51'); assert.equal(declineCodeOf([{ kind: 'decline', times: 1 }]), '51'); assert.equal(declineCodeOf([{ kind: 'ledger', counts: {} }, { kind: 'decline', times: 2, code: 'QB' }]), 'QB'); assert.equal(declinesOf([{ kind: 'decline', times: 2, code: 'QB' }]), 2);
});
test('the practice terminal declines the number of times asked, with the code asked, then approves; reset puts everything back', async () => {
  const was = timing.stepMs; timing.stepMs = 5; try {
    resetTrainingTerminal(); setDeclines(2, 'QB'); const kinds: string[] = [];
    for (const ref of ['a', 'b', 'c']) { const r = await startCharge(trainingTerminal, { amountCents: 100, reference: ref }).promise; kinds.push(r.kind === 'DECLINED' ? `D:${r.code}` : r.kind); }
    assert.deepEqual(kinds, ['D:QB', 'D:QB', 'APPROVED']);
    setManualCard(true); assert.equal(trainingVt.manual, true); trainingVt.dispatch({ t: 'request', amountCents: 5 }); resetTrainingTerminal();
    assert.equal(trainingVt.manual, false); assert.equal(trainingVt.get().screen, 'sleep'); assert.equal(trainingTerminal.approved.length, 0);
    assert.equal((await startCharge(trainingTerminal, { amountCents: 100, reference: 'd' }).promise).kind, 'APPROVED', 'decline code and queue were cleared');
  } finally { timing.stepMs = was; resetTrainingTerminal(); }
});
test('practiceWidth stays within 120 to 190 and is wider on a tablet', () => {
  assert.equal(practiceWidth(200), 120); assert.equal(practiceWidth(390), 156); assert.equal(practiceWidth(1180), 190); assert.ok(practiceWidth(1024) >= practiceWidth(600));
});
