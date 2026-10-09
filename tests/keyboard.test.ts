// Location: tests/keyboard.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { keyboardOverlap, revealDelta, sheetMaxHeight } from '../src/lib/keyboardMath';
import { KIND_PROPS, needsDoneBar, type FieldKind } from '../src/lib/fieldKinds';

test('keyboard overlap: hidden, shown, floating/partial, bad input', () => {
  assert.equal(keyboardOverlap(800, 800, 0), 0);
  assert.equal(keyboardOverlap(800, 540, 260), 260);
  assert.equal(keyboardOverlap(800, 700, 260), 100); // keyboard partly off-screen / floating
  assert.equal(keyboardOverlap(800, 900, 260), 0);
  assert.equal(keyboardOverlap(800, NaN, NaN), 0);
});

test('reveal: already visible → no scroll', () => assert.equal(revealDelta({ fieldTop: 200, fieldBottom: 250, viewTop: 100, viewBottom: 600 }), 0));
test('reveal: field under the keyboard → scroll down just enough (plus margin)', () => assert.equal(revealDelta({ fieldTop: 560, fieldBottom: 610, viewTop: 100, viewBottom: 600, margin: 12 }), 22));
test('reveal: field above the view → scroll up', () => assert.equal(revealDelta({ fieldTop: 60, fieldBottom: 110, viewTop: 100, viewBottom: 600, margin: 12 }), -52));
test('reveal: field taller than the visible band aligns to its top', () => assert.equal(revealDelta({ fieldTop: 300, fieldBottom: 900, viewTop: 100, viewBottom: 500, margin: 10 }), 190));

test('sheet height: limited by screen share and by space above keyboard, never tiny', () => {
  assert.equal(sheetMaxHeight(1000, 0, 0.86, 48), 860);
  assert.equal(sheetMaxHeight(1000, 400, 0.86, 48), 552);
  assert.equal(sheetMaxHeight(400, 380, 0.86, 48), 160);
});

test('every kind is defined; keyboards are consistent for each data type', () => {
  const kinds: FieldKind[] = ['text', 'name', 'email', 'phone', 'url', 'integer', 'decimal', 'money', 'pin', 'secret', 'code', 'search', 'date', 'json'];
  for (const k of kinds) assert.ok(KIND_PROPS[k], k);
  assert.equal(KIND_PROPS.email.keyboardType, 'email-address'); assert.equal(KIND_PROPS.email.autoCapitalize, 'none');
  assert.equal(KIND_PROPS.money.keyboardType, 'decimal-pad'); assert.equal(KIND_PROPS.integer.keyboardType, 'number-pad');
  assert.equal(KIND_PROPS.pin.secureTextEntry, true); assert.equal(KIND_PROPS.secret.secureTextEntry, true);
  assert.equal(KIND_PROPS.search.returnKeyType, 'search'); assert.equal(KIND_PROPS.name.autoCapitalize, 'words');
  for (const k of ['email', 'url', 'code', 'secret', 'search'] as FieldKind[]) { assert.equal(KIND_PROPS[k].autoCorrect, false, k); assert.equal(KIND_PROPS[k].autoCapitalize, 'none', k); }
});
test('Done bar only for pads that have no Return key', () => {
  assert.equal(needsDoneBar('money'), true); assert.equal(needsDoneBar('integer'), true); assert.equal(needsDoneBar('phone'), true); assert.equal(needsDoneBar('pin'), true);
  assert.equal(needsDoneBar('text'), false); assert.equal(needsDoneBar('email'), false); assert.equal(needsDoneBar(undefined), false);
  assert.equal(needsDoneBar(undefined, 'decimal-pad'), true); assert.equal(needsDoneBar('money', 'default'), false);
});
