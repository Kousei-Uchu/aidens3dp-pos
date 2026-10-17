// Location: tests/scannercodes.test.ts
// The scanner setup barcodes: every one can be drawn, none is repeated, and the speed picker matches the manual's timings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_SCANNER_CODES, SCANNER_CODE_GROUPS, SPEED_TABLE, speedForInterval } from '../src/lib/scannerCodes';
import { code128Modules } from '../src/lib/code128';

test('every setup code is unique and can be drawn as Code 128', () => {
  assert.equal(new Set(ALL_SCANNER_CODES.map(c => c.id)).size, ALL_SCANNER_CODES.length);
  assert.equal(new Set(ALL_SCANNER_CODES.map(c => c.text)).size, ALL_SCANNER_CODES.length);
  for (const c of ALL_SCANNER_CODES) { assert.ok(c.label && c.what, c.id); assert.doesNotThrow(() => code128Modules(c.text), c.id); }
});
test('the codes are the ones from the manual', () => {
  const t = Object.fromEntries(ALL_SCANNER_CODES.map(c => [c.id, c.text]));
  assert.deepEqual(t, {
    'pairing-mode': '%%SpecCode99', 'vibration-on': '%%SpecCode77', 'vibration-off': '%%SpecCode76',
    'volume-mute': '%%SpecCode94', 'volume-low': '%%SpecCode95', 'volume-high': '%%SpecCode97',
    'sleep-5': '%%SpecCode33', 'sleep-30': '%%SpecCode35', 'sleep-never': '%%SpecCode36',
    'scan-auto': 'TRIGPRE', 'scan-manual': 'TRIGMAN',
    'speed-test': 'HID_SCANNER_SPEED_TEST', 'speed-fast': '%%SpecCodeB0', 'speed-medium': '%%SpecCodeB1', 'speed-slow': '%%SpecCodeB2', 'speed-super-slow': '%%SpecCodeB3',
  });
});
test('each group has at most one default and the speed table points at real codes', () => {
  for (const g of SCANNER_CODE_GROUPS) assert.ok(g.codes.filter(c => c.isDefault).length <= 1, g.id);
  for (const s of SPEED_TABLE) assert.ok(ALL_SCANNER_CODES.some(c => c.id === s.codeId), s.codeId);
});
test('speedForInterval: inside a range, between ranges, and out at the ends', () => {
  assert.equal(speedForInterval(4.5).name, 'Fast');
  assert.equal(speedForInterval(19).name, 'Medium');
  assert.equal(speedForInterval(44).name, 'Slow');
  assert.equal(speedForInterval(151).name, 'Super slow');
  assert.equal(speedForInterval(12).name, 'Medium'); // 6 from Fast's top, 5 from Medium's bottom
  assert.equal(speedForInterval(11.5).name, 'Fast'); // equally far from both ranges: Fast's middle is nearer
  assert.equal(speedForInterval(31).name, 'Medium'); // 10 above Medium, 11 below Slow
  assert.equal(speedForInterval(0).name, 'Fast'); assert.equal(speedForInterval(500).name, 'Super slow');
  assert.throws(() => speedForInterval(-1)); assert.throws(() => speedForInterval(NaN));
});
