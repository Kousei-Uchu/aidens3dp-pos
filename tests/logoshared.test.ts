// Location: tests/logoshared.test.ts
// CloudKit patch 6a, the logo: the pure rules (what to do, how the record reads and writes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideLogo, isLogoType, logoFromFields, logoHash, logoRemovedFields, logoToFields, logoTypeOfPath, MAX_LOGO_BYTES, type RemoteLogo } from '../src/lib/logoShared';

const img = (hash: string): RemoteLogo => ({ kind: 'image', hash, type: 'image/png', bytes: 1000, registerId: 'reg-a', registerName: 'Front', ts: '2026-11-02T10:00:00.000Z' });
const mine = (hash: string) => ({ hash, type: 'image/png' as const, bytes: 1000 });
const none = { hash: '' };

test('the same file hashes the same, a different file does not', () => {
  assert.equal(logoHash('abcd'), logoHash('abcd')); assert.notEqual(logoHash('abcd'), logoHash('abce')); assert.match(logoHash('x'), /^[0-9a-f]{14}$/);
});

test('image types are read from the file name, and an SVG is not one', () => {
  assert.equal(logoTypeOfPath('/docs/branding/logo-1.png'), 'image/png'); assert.equal(logoTypeOfPath('logo.JPG'), 'image/jpeg'); assert.equal(logoTypeOfPath('a.webp?x=1'), 'image/webp');
  assert.equal(logoTypeOfPath('logo.svg'), null); assert.equal(logoTypeOfPath('logo'), null);
  assert.ok(isLogoType('image/gif')); assert.ok(!isLogoType('image/svg+xml'));
});

test('the shop has never had a logo: this register sends its own, or nothing', () => {
  assert.equal(decideLogo(mine('h1'), { kind: 'absent' }, null), 'push');
  assert.equal(decideLogo(none, { kind: 'absent' }, null), 'none');
  assert.equal(decideLogo(none, { kind: 'absent' }, 'h1'), 'none');
});

test('the same image on both sides needs nothing, whatever the base', () => {
  assert.equal(decideLogo(mine('h1'), img('h1'), null), 'none'); assert.equal(decideLogo(mine('h1'), img('h1'), 'h0'), 'none');
  assert.equal(decideLogo(none, { kind: 'removed' }, 'h1'), 'none');
});

test('a register that has just joined takes the shop\'s image, even over one of its own', () => {
  assert.equal(decideLogo(none, img('h2'), null), 'pull'); assert.equal(decideLogo(mine('h1'), img('h2'), null), 'pull');
});

test('a register that has just joined keeps its own logo when the shop removed theirs, and sends it', () => {
  assert.equal(decideLogo(mine('h1'), { kind: 'removed' }, null), 'push');
});

test('a change made here is sent: a new image, a replaced one, or a removal', () => {
  assert.equal(decideLogo(mine('h2'), img('h1'), 'h1'), 'push');
  assert.equal(decideLogo(none, img('h1'), 'h1'), 'push', 'removed here, still there on the shop');
  assert.equal(decideLogo(mine('h2'), { kind: 'removed' }, 'h1'), 'push', 'added again here after the shop removed it');
});

test('a change made elsewhere is taken, and a removal made elsewhere removes the file here', () => {
  assert.equal(decideLogo(mine('h1'), img('h2'), 'h1'), 'pull');
  assert.equal(decideLogo(mine('h1'), { kind: 'removed' }, 'h1'), 'clear');
  assert.equal(decideLogo(none, img('h2'), ''), 'pull', 'agreed there was none, then the shop got one');
});

test('both changed: this register, the one sending, wins', () => {
  assert.equal(decideLogo(mine('h2'), img('h3'), 'h1'), 'push');
});

test('the record round-trips, and a removal reads as removed', () => {
  const f = logoToFields('reg-a', 'Front', mine('h1'), '2026-11-02T10:00:00.000Z');
  assert.deepEqual(logoFromFields(f), img('h1'));
  assert.deepEqual(logoFromFields(logoRemovedFields('reg-a', 'Front', '2026-11-02T10:00:00.000Z')), { kind: 'removed' });
  assert.equal(f.removed, 0);
});

test('a record that cannot be read as a logo counts as absent, and never throws', () => {
  const ok = logoToFields('r', 'n', mine('h1'), 't');
  for (const bad of [null, undefined, {}, { ...ok, hash: '' }, { ...ok, mime: 'image/svg+xml' }, { ...ok, bytes: 0 }, { ...ok, bytes: MAX_LOGO_BYTES + 1 }, { ...ok, bytes: 'big' }]) assert.deepEqual(logoFromFields(bad as any), { kind: 'absent' });
});

test('a number or a text for the removed flag both read as removed (CloudKit hands numbers back)', () => {
  for (const v of [1, true, '1']) assert.deepEqual(logoFromFields({ ...logoToFields('r', 'n', mine('h1'), 't'), removed: v }), { kind: 'removed' });
});
