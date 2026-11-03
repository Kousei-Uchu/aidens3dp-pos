// Location: tests/migrationpanel.test.ts
// CloudKit patch 7, screen words: who sees the section, which button is offered and when, and what each outcome says.
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationPanel, outcomeLine } from '../src/lib/migrationPanel';
import type { MigrationView } from '../src/lib/cloudkit/migrationControl';

const v = (o: Partial<MigrationView> = {}): MigrationView => ({ line: 'Ready to set up sync from this iPad.', running: false, phase: null, imported: 0, canStart: true, done: false, last: null, ...o });

test('a till that is not in a shop sees nothing, and neither does a screen with no view yet', () => {
  assert.equal(migrationPanel(v(), 'none', false).show, false);
  assert.equal(migrationPanel(null, 'owner', false).show, false);
});

test('a fresh owner is told what it does and offered Set up sync', () => {
  const p = migrationPanel(v(), 'owner', false);
  assert.equal(p.show, true); assert.equal(p.primary?.label, 'Set up sync'); assert.equal(p.showStop, false); assert.equal(p.explain.length, 3);
  assert.match(p.explain[1], /nothing is deleted/);
});

test('a participant sees the state but has no button and no explanation', () => {
  const p = migrationPanel(v({ canStart: false, line: 'The shop owner\'s iPad is setting up sync. This iPad will join when it is done.' }), 'participant', false);
  assert.equal(p.show, true); assert.equal(p.primary, null); assert.equal(p.showStop, false); assert.deepEqual(p.explain, []);
});

test('practice mode removes the button', () => assert.equal(migrationPanel(v(), 'owner', true).primary, null));

test('while running: progress, a Stop button, no Start, and no stale outcome', () => {
  const p = migrationPanel(v({ running: true, canStart: false, phase: 'sales', imported: 240, last: { kind: 'lost' } }), 'owner', false);
  assert.equal(p.progress, 'Step 5 of 6, sales: 240 so far.'); assert.equal(p.showStop, true); assert.equal(p.primary, null); assert.equal(p.outcome, '');
});

test('after a stop, a failure or a short count the button says carry on', () => {
  for (const last of [{ kind: 'stopped' }, { kind: 'lost' }, { kind: 'failed', phase: 'carts', message: 'offline' }, { kind: 'short', held: null, short: [], message: 'Count check failed: sales 9 of 10.' }] as const)
    assert.equal(migrationPanel(v({ last: last as any }), 'owner', false).primary?.label, 'Carry on setting up sync');
  assert.equal(migrationPanel(v({ last: { kind: 'refused', why: 'x' } }), 'owner', false).primary?.label, 'Set up sync');
});

test('done: a sentence, no button, no explanation', () => {
  const p = migrationPanel(v({ done: true, canStart: false, line: 'Sync is set up.', last: { kind: 'done', held: {} as any, checks: [] } }), 'owner', false);
  assert.equal(p.primary, null); assert.deepEqual(p.explain, []); assert.match(p.outcome, /counts match/);
});

test('every outcome has plain words and names the step in plain terms', () => {
  assert.match(outcomeLine({ kind: 'failed', phase: 'rollups', message: 'Shopify went away.' }), /sales totals step: Shopify went away\. Press the button/);
  assert.match(outcomeLine({ kind: 'short', held: null, short: [], message: 'Count check failed: carts 1 of 2.' }), /carts 1 of 2\. Press/);
  assert.equal(outcomeLine(null), ''); assert.equal(outcomeLine({ kind: 'refused', why: 'Only the shop owner\'s iPad sets up sync.' }), 'Only the shop owner\'s iPad sets up sync.');
});
