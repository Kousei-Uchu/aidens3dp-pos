import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAINING_MODULES, learnerKey, nextHintIndex, scenarioAnswerIsCorrect } from '../src/lib/training';

test('training module identifiers are unique and all five curriculum stages have content', () => {
  const ids = TRAINING_MODULES.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length > 0);
  for (const item of TRAINING_MODULES) {
    assert.ok(item.slides.length > 0, `${item.id} info`);
    assert.ok(item.flow.length > 0, `${item.id} process`);
    assert.ok(item.guide.length > 0, `${item.id} guide`);
    assert.equal(item.scenarios.length, 2, `${item.id} smooth and recovery checks`);
    assert.equal(item.scenarios[0].kind, 'smooth');
    assert.equal(item.scenarios[1].kind, 'recovery');
    for (const scenario of item.scenarios) {
      assert.ok(scenario.choices.some(choice => choice.id === scenario.answer), `${scenario.id} answer`);
      assert.ok(scenario.hints.length > 0, `${scenario.id} hints`);
    }
  }
});

test('training records distinguish each signed-in staff member from register-only use', () => {
  assert.equal(learnerKey('staff-1'), 'staff-1');
  assert.equal(learnerKey(undefined), 'register');
});

test('answer checks and progressive hint requests stay bounded', () => {
  const scenario = TRAINING_MODULES[0].scenarios[0];
  assert.equal(scenarioAnswerIsCorrect(scenario, scenario.answer), true);
  assert.equal(scenarioAnswerIsCorrect(scenario, 'wrong'), false);
  assert.equal(nextHintIndex(scenario.hints, 0), 1);
  assert.equal(nextHintIndex(scenario.hints, scenario.hints.length), scenario.hints.length);
});
