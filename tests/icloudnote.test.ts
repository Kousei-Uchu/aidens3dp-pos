// Location: tests/icloudnote.test.ts
// The in-app note on what is and is not in iCloud (0202). Pins the points the decisions say it must make plainly, and that the
// Cloud sync page shows all of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ICLOUD_NOTE_INTRO, ICLOUD_WARNINGS, IN_ICLOUD, NOT_IN_ICLOUD } from '../src/lib/icloudNote';

const all = [ICLOUD_NOTE_INTRO, ...IN_ICLOUD.map(b => b.title + ' ' + b.text), ...ICLOUD_WARNINGS.map(b => b.title + ' ' + b.text)].join('\n');
const never = NOT_IN_ICLOUD.join('\n');

test('the note names what the decisions say it must (decisions, "Additional notes")', () => {
  for (const re of [/PIN and badge hashes/, /card details.*encrypted/i, /payment attempts/i, /events/i, /assistant.*log/i, /customer details/i, /training progress/i, /Shopify login/, /pass codes/i, /encryption test/i, /receipt/i, /drawer/i])
    assert.match(all, re, String(re));
});
test('it says plainly that the audit log and sale notes can hold customer names, and that the link is a key', () => {
  const w = ICLOUD_WARNINGS.map(b => b.text).join(' ');
  assert.match(w, /name, email or phone/); assert.match(w, /assistant/); assert.match(w, /note on a sale/);
  assert.match(w, /read and write/); assert.match(w, /turn the share off/i);
});
test('secrets are described as coming later, not as already synced', () => {
  const b = IN_ICLOUD.find(x => /secrets/i.test(x.title))!; assert.ok(b); assert.match(b.title, /later/); assert.match(b.text, /^Only after the encryption test/);
});
test('the never list holds the Shopify token, the open cart, per-iPad settings, the outbox and the caches', () => {
  for (const re of [/access token/, /cart being rung up/, /own settings/, /queue of sales/, /catalogue and customer cache/, /Demo data/]) assert.match(never, re, String(re));
});
test('nothing is listed both as kept and as never kept', () => {
  assert.doesNotMatch(never, /PIN|card details|drawer/);
});
test('the Cloud sync page shows every block of the note', () => {
  const s = readFileSync('src/screens/CloudSync.tsx', 'utf8');
  for (const n of ['ICLOUD_NOTE_INTRO', 'IN_ICLOUD.map', 'ICLOUD_WARNINGS.map', 'NOT_IN_ICLOUD.map']) assert.ok(s.includes(n), n);
});
