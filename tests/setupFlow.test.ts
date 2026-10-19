// Location: tests/setupFlow.test.ts
// The setup checklist (Companion plan, patch 0176): which steps each profile gets, when each one is done, and the
// line the screen shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_REGISTER_NAME, SETUP_PROFILES, firstUnfinished, setupContext, setupFinished, setupProgress, setupSteps, type SetupContext } from '../src/lib/setupFlow';

const nothing: SetupContext = { shopify: false, ownerPin: false, registerNamed: false, anyFeature: false };
const everything: SetupContext = { shopify: true, ownerPin: true, registerNamed: true, anyFeature: true };

test('both profiles exist', () => {
  assert.deepEqual(SETUP_PROFILES, ['register', 'companion']);
});

test('a register is asked for Shopify, the owner PIN and its name; a companion for Shopify, the PIN and its features', () => {
  assert.deepEqual(setupSteps('register').map(s => s.id), ['shopify', 'pin', 'name']);
  assert.deepEqual(setupSteps('companion').map(s => s.id), ['shopify', 'pin', 'features']);
});

test('each step has readable text and a predicate', () => {
  for (const p of SETUP_PROFILES) for (const s of setupSteps(p)) {
    assert.ok(s.title.length > 0, `${s.id} title`);
    assert.ok(s.summary.length > 0, `${s.id} summary`);
    assert.equal(typeof s.done, 'function');
  }
});

test('the first unfinished step moves down the list as steps are done', () => {
  assert.equal(firstUnfinished('register', nothing)?.id, 'shopify');
  assert.equal(firstUnfinished('register', { ...nothing, shopify: true })?.id, 'pin');
  assert.equal(firstUnfinished('register', { ...nothing, shopify: true, ownerPin: true })?.id, 'name');
  assert.equal(firstUnfinished('register', everything), undefined);
  assert.equal(firstUnfinished('companion', { ...nothing, shopify: true, ownerPin: true })?.id, 'features');
  assert.equal(firstUnfinished('companion', everything), undefined);
});

test('progress counts the steps that are done', () => {
  assert.deepEqual(setupProgress('register', nothing), { done: 0, total: 3 });
  assert.deepEqual(setupProgress('register', { ...nothing, shopify: true, registerNamed: true }), { done: 2, total: 3 });
  assert.deepEqual(setupProgress('companion', everything), { done: 3, total: 3 });
  assert.equal(setupFinished('register', nothing), false);
  assert.equal(setupFinished('companion', everything), true);
});

test('the context reads the device settings, with the Shopify answer passed in', () => {
  const owner = { role: 'owner', pinHash: 'abc' };
  const cashier = { role: 'cashier', pinHash: 'abc' };
  assert.deepEqual(setupContext({ requirePin: true, staff: [owner], registerName: 'Counter', registerFeatures: { selling: true } }, true), everything);
  // a PIN that is set on a staff member but not required is not a lock, so the step stays open
  assert.equal(setupContext({ requirePin: false, staff: [owner] }, false).ownerPin, false);
  // a cashier's PIN does not stand in for the owner's
  assert.equal(setupContext({ requirePin: true, staff: [cashier] }, false).ownerPin, false);
  assert.equal(setupContext({ requirePin: true, staff: [] }, false).ownerPin, false);
  // the name default means "not named yet", and clearing it does too
  assert.equal(setupContext({ registerName: DEFAULT_REGISTER_NAME }, false).registerNamed, false);
  assert.equal(setupContext({ registerName: '  ' }, false).registerNamed, false);
  assert.equal(setupContext({ registerName: 'Back room' }, false).registerNamed, true);
  assert.equal(setupContext({}, false).registerNamed, false);
  // a companion with one group on has finished the features step
  assert.equal(setupContext({ registerFeatures: { selling: true } }, false).anyFeature, true);
  assert.equal(setupContext({ registerFeatures: { selling: 'yes' } }, false).anyFeature, false);
  assert.equal(setupContext({}, false).anyFeature, false);
});
