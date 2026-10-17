// Location: tests/assistantoffline.test.ts
// The assistant's offline mode (patch 0160, plan 3.3): the model-free search of screens and help pages, the marker in the history,
// what the model is and is not shown of it, and the log line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessagesDetailed, capHistory, forModel, readHistory, tidyOffline, withoutExchange, type ChatEntry } from '../src/lib/assistantChat';
import { OFFLINE_LABEL, hasOfflineHits, makeOfflineEntry, offlineExchange, offlineQuery, offlineSearch } from '../src/lib/assistantOffline';
import { buildOfflineEvent, createLogStore, logOffline, type LogFs, type LogStaff } from '../src/lib/assistantLog';
import { buildScreenIndex } from '../src/lib/assistantScreens';
import { resolveLink } from '../src/lib/assistantTools';
import { builtinHelp } from '../src/lib/helpBuiltin';

const pages = builtinHelp().pages; const screens = buildScreenIndex();
const ctx = (role: string) => ({ pages, screens, role });
const entry = (id: string, role: 'user' | 'assistant', text: string, extra: Partial<ChatEntry> = {}): ChatEntry => ({ id, role, text, at: 1, ...extra });
const names = (h: ReturnType<typeof offlineSearch>) => h.screens.map(s => s.name);

// ---- the search ----
test('a question finds screens and help pages with no model, and a screen says how to open it', () => {
  const h = offlineSearch(ctx('owner'), 'where do I count the cash drawer');
  assert.ok(hasOfflineHits(h)); assert.ok(h.screens.length > 0 && h.pages.length > 0);
  assert.ok(h.screens.some(s => s.how_to_open && s.how_to_open.length > 0));
  assert.ok(h.screens.length <= 5 && h.pages.length <= 5);
});
test('nothing found is an empty list, and so are a blank question and one made only of hidden tags', () => {
  assert.equal(hasOfflineHits(offlineSearch(ctx('owner'), 'zzqx plugh')), false);
  assert.equal(hasOfflineHits(offlineSearch(ctx('owner'), '   ')), false);
  assert.equal(hasOfflineHits(offlineSearch(ctx('owner'), '[card number] [email address]')), false);
  assert.equal(offlineQuery('refund [card number] to [email address] please'), 'refund to please');
});
test('a cashier is never shown Settings, Staff or the help pages about them, and gets the same empty list as for something that is not there', () => {
  for (const q of ['add a staff member', 'staff', 'settings', 'AI assistant model address', 'shopify settings']) {
    const h = offlineSearch(ctx('cashier'), q);
    const seen = [...h.screens.map(s => `${s.id} ${s.name} ${s.summary} ${(s.how_to_open ?? []).join(' ')}`), ...h.pages.map(p => `${p.id} ${p.title} ${p.summary} ${p.match}`)].join('\n');
    assert.ok(!/\bsettings?\b/i.test(seen.replace(/\bsettings?\b(?= for (?:the )?cash)/gi, '')) || h.screens.every(s => s.id !== 'page_settings'), `${q}: ${seen}`);
    assert.ok(!h.screens.some(s => ['page_settings', 'page_staff', 'sheet_switch_staff', 'sheet_staff_pass'].includes(s.id)), q);
    assert.ok(!h.pages.some(p => p.id.startsWith('settings/') && p.id !== 'settings/ask-assistant') && !h.pages.some(p => p.id === 'staff'), q);
  }
  assert.deepEqual(offlineSearch(ctx('cashier'), 'teleporter'), { screens: [], pages: [] });
  const asManager = offlineSearch(ctx('manager'), 'add a staff member');
  assert.ok(asManager.screens.some(s => s.id === 'page_staff') && asManager.pages.some(p => p.id === 'staff'), 'a manager does get them');
});
test('an unknown role is shown no screens and none of the pages that name a role', () => {
  const h = offlineSearch(ctx('visitor'), 'cash drawer refund staff settings');
  assert.deepEqual(h.screens, []);
  const restricted = new Set(pages.filter(p => p.roles && p.roles.length).map(p => p.id));
  assert.ok(restricted.size > 0 && !h.pages.some(p => restricted.has(p.id)));
});
test('a search that throws is an empty list, not a second error', () => {
  const bad = { pages: null as any, screens: null as any, role: 'owner' };
  assert.deepEqual(offlineSearch(bad, 'refund'), { screens: [], pages: [] });
});

test('a screen in the list gets an Open button only when the link tool would make one, and a page always opens', () => {
  const h = offlineSearch(ctx('owner'), 'cash drawer reports inventory refund');
  const opens = h.screens.map(s => resolveLink(ctx('owner'), 'screen', s.id));
  assert.ok(opens.some(o => o), 'some screens can be opened'); assert.ok(h.screens.some(s => s.kind === 'window') ? opens.some(o => !o) : true, 'a window has no button');
  for (const o of opens) if (o) assert.match(o.link.label, /^Open /);
  for (const p of h.pages) assert.deepEqual(resolveLink(ctx('owner'), 'doc', p.id)?.action, { to: 'help', id: p.id });
  // what a cashier is listed can always be opened by a cashier, and what they cannot reach is neither listed nor openable
  for (const s of offlineSearch(ctx('cashier'), 'cash drawer reports refund').screens) assert.ok(s.id !== 'page_settings' && s.id !== 'page_staff');
  assert.equal(resolveLink(ctx('cashier'), 'screen', 'page_settings'), null);
});

// ---- the exchange ----
test('the exchange stores the question with the scrubber applied, and a marker in place of a reply', () => {
  let n = 0; const id = () => `e${++n}`;
  const ex = offlineExchange({ text: '  refund to jo@example.com on 4111 1111 1111 1111 ', ctx: ctx('owner'), id, now: () => 5 });
  assert.equal(ex.user.role, 'user'); assert.ok(!ex.user.text.includes('jo@example.com') && !ex.user.text.includes('4111'));
  assert.match(ex.user.text, /\[email address\]/); assert.match(ex.user.note ?? '', /Hidden before sending/);
  assert.deepEqual(ex.reply, { id: 'e2', role: 'assistant', text: OFFLINE_LABEL, at: 5, offline: true });
  assert.ok(hasOfflineHits(ex.hits), 'it searched for "refund"');
  assert.ok(!JSON.stringify(ex.reply).includes('Refund'), 'the list itself is not stored');
});
test('the list is found again for whoever is signed in, so a role that loses access stops being shown it', () => {
  const q = 'add a staff member'; const asManager = offlineSearch(ctx('manager'), q); const asCashier = offlineSearch(ctx('cashier'), q);
  assert.ok(asManager.screens.length > 0); assert.ok(!names(asCashier).some(x => /staff/i.test(x)));
});

// ---- the history ----
test('history keeps the offline marker, and drops one that has lost its question', () => {
  const h = readHistory([
    { id: 'u1', role: 'user', text: 'a', at: 1 }, { id: 'o1', role: 'assistant', text: OFFLINE_LABEL, at: 2, offline: true },
    { id: 'o2', role: 'assistant', text: OFFLINE_LABEL, at: 3, offline: true },        // two in a row: the second has no question
    { id: 'u2', role: 'user', text: 'b', at: 4, offline: true },                         // only a reply can be offline
    { id: 'a1', role: 'assistant', text: 'ok', at: 5, offline: 'yes' },                  // not exactly true: not offline
  ]);
  assert.deepEqual(h.map(e => [e.id, !!e.offline]), [['u1', false], ['o1', true], ['u2', false], ['a1', false]]);
  assert.equal(readHistory([{ id: 'o', role: 'assistant', text: 'x', at: 1, offline: true }]).length, 0, 'a lone marker is dropped');
});
test('cutting the oldest messages never leaves a marker at the front', () => {
  const h = [entry('u1', 'user', 'a'), makeOfflineEntry('o1', 2), entry('u2', 'user', 'b'), entry('a2', 'assistant', 'ok')];
  assert.deepEqual(capHistory(h, 3).map(e => e.id), ['u2', 'a2']);
  assert.deepEqual(tidyOffline(h).map(e => e.id), ['u1', 'o1', 'u2', 'a2']);
});
test('the model never sees an offline exchange: the question and the marker both stay out, so the chat still alternates', () => {
  const h = [entry('u1', 'user', 'old question'), entry('a1', 'assistant', 'old answer'), entry('u2', 'user', 'asked while offline'), makeOfflineEntry('o2', 3), entry('u3', 'user', 'asked once the model was back')];
  assert.deepEqual(forModel(h).map(e => e.id), ['u1', 'a1', 'u3']);
  const b = buildMessagesDetailed(h, 'short', 8000);
  const sent = b.messages.map(m => m.content).join('\n');
  assert.ok(!sent.includes('asked while offline') && !sent.includes(OFFLINE_LABEL));
  assert.deepEqual(b.messages.map(m => m.role), ['system', 'user', 'assistant', 'user']);
  assert.deepEqual(b.included.map(e => e.id), ['u1', 'a1', 'u3']);
  assert.deepEqual(forModel([entry('u1', 'user', 'x'), makeOfflineEntry('o1', 2)]), []);
});
test('a retry takes the place of the offline exchange it came from', () => {
  const h = [entry('u0', 'user', 'a'), entry('a0', 'assistant', 'b'), entry('u1', 'user', 'q'), makeOfflineEntry('o1', 2), entry('u9', 'user', 'later'), entry('a9', 'assistant', 'later answer')];
  assert.deepEqual(withoutExchange(h, 'u1').map(e => e.id), ['u0', 'a0', 'u9', 'a9']);
  assert.equal(withoutExchange(h, 'nope'), h); assert.equal(withoutExchange(h, undefined), h);
  assert.deepEqual(withoutExchange([entry('u1', 'user', 'q'), entry('a1', 'assistant', 'real answer')], 'u1').map(e => e.id), ['a1'], 'a real reply is not removed with its question');
});

// ---- the log ----
const staff: LogStaff = { id: 's1', name: 'Casey', role: 'cashier' };
test('an offline search is a log line with the question, why the model was not used and what was found, and never the key', async () => {
  const KEY = 'sk-abcdefghijklmnop';
  const user = entry('u1', 'user', `refund please ${KEY}`);
  const ev = buildOfflineEvent({ id: 'x1', now: 100, staff, endpoint: { host: '10.0.0.5', model: 'm', scope: 'local' }, user, cause: 'unreachable', screens: ['sheet_refund', 'page_orders'], pages: ['orders/refunds'], ms: 12, apiKey: KEY });
  assert.equal(ev.kind, 'offline'); assert.equal(ev.practice, false); assert.deepEqual(ev.offline, { cause: 'unreachable', screens: ['sheet_refund', 'page_orders'], pages: ['orders/refunds'] });
  assert.ok(!JSON.stringify(ev).includes(KEY)); assert.equal(ev.sent, undefined, 'nothing was sent to a model, so there is no request to record');
  const files = new Map<string, Uint8Array>();
  const fs: LogFs = { read: async n => files.get(n) ?? null, write: async (n, d) => { files.set(n, d); }, remove: async n => { files.delete(n); }, list: async () => [...files].map(([name, d]) => ({ name, size: d.length })) };
  const store = createLogStore(fs, { now: () => 100 });
  assert.equal(await logOffline({ sink: store.append }, ev), undefined);
  const back = (await store.events()).events; assert.equal(back.length, 1); assert.equal(back[0].kind, 'offline'); assert.deepEqual(back[0].offline?.pages, ['orders/refunds']);
});
test('a log that cannot be written never stops the list: it comes back as the line to show', async () => {
  const ev = buildOfflineEvent({ id: 'x', now: 1, staff, user: entry('u', 'user', 'q'), cause: 'timeout', screens: [], pages: [] });
  assert.match((await logOffline({ sink: async () => { throw new Error('disk full'); } }, ev)) ?? '', /could not be added to the log/);
});
