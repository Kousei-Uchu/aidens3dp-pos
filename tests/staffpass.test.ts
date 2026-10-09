// Location: tests/staffpass.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { code128Modules, code128Path } from '../src/lib/code128';
import { BADGE_RE, cleanScan, findByBadge, hasBadge, hashBadge, isBadgeCode, newBadgeCode, newBadgeSalt } from '../src/lib/badge';
import { buildPassHtml } from '../src/lib/passCard';
import { signStaffPass, staffPassMessage } from '../src/lib/passUrl';
import { validateStaffPass, verifyStaffPassRequest } from '../pass-server/src/verify';

// Reference bit strings produced by the open-source JsBarcode library (CODE128B) for the same input.
const REFERENCE: [string, string][] = [
  ["P0123456789AB", '1101001000011101110110100111011001001110011011001110010110010111001100100111011011100100110011101001110110111011101001100111001011001010001100010001011000101100010001100011101011'],
  ["PZZZZZZZZZZZZ", '1101001000011101110110111011000101110110001011101100010111011000101110110001011101100010111011000101110110001011101100010111011000101110110001011101100010100111011001100011101011'],
  ["PABCDEFGH1234", '1101001000011101110110101000110001000101100010001000110101100010001000110100010001100010110100010001100010100010011100110110011100101100101110011001001110100101111001100011101011'],
  ["A", '1101001000010100011000100010110001100011101011'],
  ["Hello, World 123", '1101001000011000101000101100100001100101000011001010000100011110101011001110011011001100111010001101000111101010010011110110010100001000010011011011001100100111001101100111001011001011100110111010001100011101011'],
];

test('Code 128 matches the reference encoder bit for bit', () => {
  for (const [text, bits] of REFERENCE) assert.equal(code128Modules(text), bits, text);
});
test('Code 128 rejects empty and non-ASCII input; path width counts the quiet zone', () => {
  assert.throws(() => code128Modules(''), /Nothing/); assert.throws(() => code128Modules('caf\u00e9'), /printable ASCII/);
  const { width, d } = code128Path('P0123456789AB'); assert.equal(width, code128Modules('P0123456789AB').length + 20); assert.ok(d.startsWith('M10 0'));
});

test('badge codes are well formed and unique', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) { const c = newBadgeCode(); assert.match(c, BADGE_RE); assert.equal(c.length, 13); seen.add(c); }
  assert.equal(seen.size, 500);
});

test('only the hash is stored, and the right code finds the right person', () => {
  const mk = (id: string) => { const code = newBadgeCode(), salt = newBadgeSalt(); return { code, m: { id, badgeSalt: salt, badgeHash: hashBadge(salt, code) } }; };
  const a = mk('a'), b = mk('b'); const staff = [a.m, b.m, { id: 'nobadge' }];
  assert.equal(findByBadge(staff, a.code)?.id, 'a'); assert.equal(findByBadge(staff, b.code)?.id, 'b');
  assert.equal(findByBadge(staff, newBadgeCode()), null, 'unknown pass');
  assert.ok(!JSON.stringify(staff).includes(a.code), 'the code itself must not be stored');
  assert.equal(hasBadge(a.m), true); assert.equal(hasBadge({ id: 'x' }), false);
});

test('scan cleaning tolerates case and stray spaces, and product barcodes are never mistaken for passes', () => {
  const c = newBadgeCode(); assert.equal(cleanScan(` ${c.toLowerCase()} \n`), c); assert.equal(isBadgeCode(c.toLowerCase()), true);
  for (const bad of ['9300633603009', '0123456789', 'PABCDEFGHIJK', 'P0123456789ABC', 'p0123456789a', 'I0123456789AB', '']) assert.equal(isBadgeCode(bad), false, bad);
});
test('a re-issued pass revokes the old one', () => {
  const salt = newBadgeSalt(); const oldCode = newBadgeCode(), newCode = newBadgeCode();
  const m = { id: 'a', badgeSalt: salt, badgeHash: hashBadge(salt, newCode) };
  assert.equal(findByBadge([m], newCode)?.id, 'a'); assert.equal(findByBadge([m], oldCode), null);
});

test('printable pass: both layouts render, escape text, and contain the right code', () => {
  const base = { shop: 'Aiden <3D> & Co', name: 'Sam "S" O\'Neil', role: 'cashier', code: 'P0123456789AB' };
  for (const format of ['qr', 'code128'] as const) {
    const html = buildPassHtml({ ...base, format });
    assert.ok(html.includes('Aiden &lt;3D&gt; &amp; Co')); assert.ok(html.includes('Sam &quot;S&quot; O'));
    assert.ok(!html.includes('<3D>')); assert.ok(html.includes('<svg') && html.includes('<path')); assert.ok(!html.includes('P0123456789AB'), 'the code is only in the barcode, not printed as text');
  }
  assert.ok(buildPassHtml({ ...base, format: 'code128' }).includes('class="bar"')); assert.ok(buildPassHtml({ ...base, format: 'qr' }).includes('class="qr"'));
});

const fields = { name: 'Sam', role: 'cashier', code: 'P0123456789AB', format: 'qr', shop: 'Aiden 3D' };
test('app and Worker agree on the staff pass signature, and tampering is caught', async () => {
  const now = Date.now(), ts = Math.floor(now / 1000), secret = 's3cret';
  const sig = signStaffPass(secret, fields, ts);
  assert.equal(await verifyStaffPassRequest(secret, fields, String(ts), sig, now), true);
  assert.equal(await verifyStaffPassRequest(secret, { ...fields, role: 'owner' }, String(ts), sig, now), false, 'role changed');
  assert.equal(await verifyStaffPassRequest(secret, { ...fields, code: 'P9999999999AB' }, String(ts), sig, now), false, 'code changed');
  assert.equal(await verifyStaffPassRequest('other', fields, String(ts), sig, now), false, 'wrong secret');
  assert.equal(await verifyStaffPassRequest(secret, fields, String(ts), sig, now + 6 * 60_000), false, 'expired');
  assert.ok(staffPassMessage(fields, ts).startsWith('staffpass\n'));
});
test('Worker field validation', () => {
  assert.equal(validateStaffPass(fields), null);
  for (const bad of [{ name: '' }, { name: 'x'.repeat(41) }, { role: 'admin' }, { code: 'nope' }, { format: 'pdf417' }, { shop: 'x'.repeat(61) }]) assert.ok(validateStaffPass({ ...fields, ...bad }), JSON.stringify(bad));
});
