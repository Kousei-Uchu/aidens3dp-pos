// Location: tests/savedmerge.test.ts
// CloudKit patch 5 (0204): saved carts with conflict merging. The rules are in src/lib/savedMerge.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyPulled, baseOf, mergeSaved, parseSavedRow } from '../src/lib/savedMerge';
import type { SavedCart } from '../src/state/store';

const line = (id: string, qty = 1) => ({ id, variantId: id, qty }) as any;
const mk = (id: string, o: Partial<SavedCart> = {}): SavedCart => ({ id, name: 'Cart', cart: { id, lines: [line('a')] } as any, ts: '2026-11-01T00:00:00Z', status: 'open', version: 1, updatedAt: '2026-11-01T01:00:00Z', ...o });
const row = (c: SavedCart, over: Record<string, string> = {}) => ({
  id: `cart-${c.id}`, handle: `cart-${c.id}`, updatedAt: c.updatedAt ?? c.ts,
  f: { cart_uuid: c.id, name: c.name, note: c.note ?? '', status: c.status === 'void' ? 'void' : c.assignedTo ? `assigned:${c.assignedTo}` : 'open', lines_json: JSON.stringify(c.cart.lines),
    discount_json: '', customer_json: '', employee: '', created_at: c.ts, updated_at: c.updatedAt ?? '', version: String(c.version ?? 1), ...over },
});
/** What a register holds after it last saw `c` on the shared store, then changed it. */
const edited = (c: SavedCart, p: Partial<SavedCart>): SavedCart => ({ ...c, ...p, dirty: true, base: baseOf(c) });

test('a shared row becomes a saved cart, with who it is assigned to', () => {
  const c = parseSavedRow(row(mk('c1', { name: 'Sam', note: 'pickup', assignedTo: 'Casey', version: 4 })))!;
  assert.equal(c.id, 'c1'); assert.equal(c.name, 'Sam'); assert.equal(c.note, 'pickup'); assert.equal(c.assignedTo, 'Casey'); assert.equal(c.version, 4); assert.equal(c.status, 'open'); assert.equal(c.cart.lines.length, 1);
});
test('a row with unreadable contents is skipped, not thrown, and a row without cart_uuid takes its id from the record name', () => {
  assert.equal(parseSavedRow(row(mk('c1'), { lines_json: '{not json' })), null);
  assert.equal(parseSavedRow(row(mk('c1'), { lines_json: '{"a":1}' })), null);
  assert.equal(parseSavedRow(row(mk('c9'), { cart_uuid: '' }))!.id, 'c9');
});

test('rule 1: a delete from another register beats an unsent edit here, and a delete made here beats their edit', () => {
  const base = mk('c1');
  assert.deepEqual(mergeSaved(edited(base, { name: 'Renamed' }), mk('c1', { status: 'void', version: 2 })), { cart: null, push: false });
  const mine = edited(base, { status: 'void' }); const m = mergeSaved(mine, mk('c1', { name: 'Theirs', version: 3 }));
  assert.equal(m.push, true); assert.equal(m.cart!.status, 'void'); assert.equal(m.cart!.version, 3);
  assert.deepEqual(mergeSaved({ ...base, status: 'void', dirty: false }, mk('c1', { version: 2 })), { cart: null, push: false });
});
test('rule 2: a cart not changed here takes the shared copy when it is the same version or newer, and keeps its own when older', () => {
  const here = mk('c1', { version: 3 });
  assert.equal(mergeSaved(here, mk('c1', { name: 'New', version: 4 })).cart!.name, 'New');
  assert.equal(mergeSaved(here, mk('c1', { name: 'Same', version: 3 })).cart!.name, 'Same');
  assert.equal(mergeSaved(here, mk('c1', { name: 'Old', version: 2 })).cart!.name, 'Cart');
  const m = mergeSaved(undefined, mk('c2')); assert.equal(m.push, false); assert.equal(m.cart!.dirty, false); assert.ok(m.cart!.base);
});
test('rule 3: a cart changed here that nobody else touched is just sent', () => {
  const mine = edited(mk('c1', { version: 2 }), { name: 'Mine' });
  const m = mergeSaved(mine, mk('c1', { version: 2 })); assert.equal(m.push, true); assert.equal(m.cart!.name, 'Mine'); assert.equal(m.cart!.version, 2);
});
test('rule 4: a rename here and an assignment elsewhere are both kept', () => {
  const synced = mk('c1', { version: 2 });
  const mine = edited(synced, { name: 'Renamed', updatedAt: '2026-11-01T03:00:00Z' });
  const theirs = mk('c1', { version: 3, assignedTo: 'Casey', updatedAt: '2026-11-01T02:00:00Z' });
  const m = mergeSaved(mine, theirs);
  assert.equal(m.cart!.name, 'Renamed'); assert.equal(m.cart!.assignedTo, 'Casey'); assert.equal(m.push, true); assert.equal(m.cart!.dirty, true);
  assert.equal(m.cart!.version, 3, 'sent as version 4'); assert.equal(m.cart!.base, baseOf(theirs));
});
test('rule 4: lines changed on both sides take the later edit, and the shared copy on a tie', () => {
  const synced = mk('c1', { version: 2 });
  const newer = (t: string) => edited(synced, { cart: { ...synced.cart, lines: [line('a'), line('b')] }, updatedAt: t });
  const theirs = mk('c1', { version: 3, cart: { id: 'c1', lines: [line('a', 5)] } as any, updatedAt: '2026-11-01T02:00:00Z' });
  assert.equal(mergeSaved(newer('2026-11-01T03:00:00Z'), theirs).cart!.cart.lines.length, 2, 'mine is later');
  assert.equal(mergeSaved(newer('2026-11-01T01:30:00Z'), theirs).cart!.cart.lines[0].qty, 5, 'theirs is later');
  assert.equal(mergeSaved(newer('2026-11-01T02:00:00Z'), theirs).cart!.cart.lines[0].qty, 5, 'a tie goes to the shared copy');
});
test('rule 4: with nothing already agreed (an older cart), both changed means the later edit wins', () => {
  const mine = { ...mk('c1', { version: 2, name: 'Mine', updatedAt: '2026-11-01T05:00:00Z' }), dirty: true };
  assert.equal(mergeSaved(mine, mk('c1', { version: 3, name: 'Theirs', updatedAt: '2026-11-01T04:00:00Z' })).cart!.name, 'Mine');
});
test('rule 4: when the merge leaves nothing the shared copy lacks, there is nothing to send', () => {
  const synced = mk('c1', { version: 2 }); const mine = edited(synced, { name: 'Same' });
  const m = mergeSaved(mine, mk('c1', { version: 3, name: 'Same' })); assert.equal(m.push, false); assert.equal(m.cart!.dirty, false); assert.equal(m.cart!.version, 3);
});

test('applyPulled: bad rows are skipped, deleted carts leave the list, others come in newest first, and it says when something is left to send', () => {
  const keep = mk('keep', { ts: '2026-11-01T00:00:00Z' }); const gone = mk('gone'); const newer = mk('new', { ts: '2026-11-02T00:00:00Z' });
  const out = applyPulled([keep, gone], [row(mk('gone', { status: 'void', version: 2 })), row(newer), row(mk('bad'), { lines_json: 'x' })]);
  assert.deepEqual(out.next.map(c => c.id), ['new', 'keep']); assert.equal(out.push, false);
  const pending = applyPulled([edited(mk('k', { version: 2 }), { name: 'Mine' })], [row(mk('k', { version: 2 }))]);
  assert.equal(pending.push, true); assert.equal(pending.next[0].name, 'Mine');
});

test('sync.ts reads every page of carts, reads a cart back before sending it, sends one run at a time, and stamps the edit time', () => {
  const s = readFileSync('src/lib/sync.ts', 'utf8');
  assert.match(s, /MAX_CART_PAGES/); assert.match(s, /listShared\('cart', \{ first: 100, after \}\)/); assert.match(s, /if \(!r\.next\) break/);
  assert.match(s, /getShared\('cart', c\.id\)/); assert.match(s, /mergeSaved\(c, remote\)/);
  assert.match(s, /if \(pushingSaved\) \{ pushSavedAgain = true; return; \}/);
  assert.match(s, /updated_at: c\.updatedAt \?\? new Date\(\)\.toISOString\(\)/);
  assert.match(s, /applyPulled\(st\(\)\.pos\.saved, rows\)/);
});
