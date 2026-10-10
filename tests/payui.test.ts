// Location: tests/payui.test.ts
// A11.1: our own sheet must never cover Zeller's popup while the terminal is working.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lockPayButtons, showsOwnSheet, showsWaitingStrip, type CardPhase } from '../src/lib/payUi';

test('no modal sheet of ours while waiting on the terminal', () => {
  assert.equal(showsOwnSheet('waiting'), false);
  assert.equal(showsWaitingStrip('waiting'), true);
});

test('results after the terminal is done still use our sheet', () => {
  for (const p of ['declined', 'unknown', 'notready'] as CardPhase[]) { assert.equal(showsOwnSheet(p), true, p); assert.equal(showsWaitingStrip(p), false, p); }
});

test('idle shows nothing at all', () => {
  assert.equal(showsOwnSheet('idle'), false);
  assert.equal(showsWaitingStrip('idle'), false);
});

test('payment buttons are locked only while waiting', () => {
  assert.equal(lockPayButtons('waiting'), true);
  for (const p of ['idle', 'declined', 'unknown', 'notready'] as CardPhase[]) assert.equal(lockPayButtons(p), false, p);
});
