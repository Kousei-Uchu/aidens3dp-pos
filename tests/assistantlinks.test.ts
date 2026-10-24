// Location: tests/assistantlinks.test.ts
// The assistant's link tool (patch 0159): show_link, the check that a button is allowed, the buttons kept in the history, and the loop collecting them.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Endpoint, FetchLike } from '../src/lib/assistantClient';
import { buildSystemPrompt, prepare, readHistory, readLinks, runPrepared, type AskInput } from '../src/lib/assistantChat';
import { ASSISTANT_TOOLS, MAX_LINKS, liveLinks, makeToolSet, resolveLink, runToolCall } from '../src/lib/assistantTools';
import { NOT_LINKABLE_ROUTES, buildScreenIndex, type ScreenEntry } from '../src/lib/assistantScreens';
import type { Page } from '../src/lib/helpDocs';

const mk = (id: string, title: string, extra: Partial<Page> = {}): Page => ({ id, title, parent: id === 'start' ? undefined : 'start', summary: `About ${title.toLowerCase()}.`, tags: [], related: [], lead: '', sections: { basic: `Basic text for ${title}.`, deep: '', advanced: '' }, file: `${id}.md`, ...extra });
const pages: Page[] = [mk('start', 'Start'), mk('pay/cash', 'Taking cash'), mk('settings/hardware', 'Hardware settings', { roles: ['manager', 'owner'] })];
const screens = buildScreenIndex();
const byId = (id: string): ScreenEntry => { const e = screens.find(x => x.id === id); assert.ok(e, `missing ${id}`); return e!; };
const ctxFor = (role: string) => ({ pages, screens, role, maxChars: 4000 });
const call = (name: string, args: unknown, id = 'c1') => ({ id, type: 'function' as const, function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } });
const runLink = (args: unknown, role = 'cashier') => runToolCall(call('show_link', args), { tools: ASSISTANT_TOOLS, ctx: ctxFor(role) });
const body = (r: ReturnType<typeof runLink>) => JSON.parse(r.message.content ?? '{}');

// ---- which screens can have a button ----
test('tabs and plain pages can have a button; windows, views and pages that need something cannot', () => {
  assert.deepEqual(byId('tab_more').target, { tab: 'more' });
  assert.deepEqual(byId('tab_inventory').target, { tab: 'inventory' });
  assert.deepEqual(byId('page_reports').target, { route: 'reports' });
  assert.deepEqual(byId('page_drawer').target, { route: 'drawer' });
  for (const id of ['sheet_refund', 'view_keypad']) assert.equal(byId(id).target, undefined, id);
  for (const e of screens) if (e.target && 'route' in e.target) assert.ok(!NOT_LINKABLE_ROUTES.includes(e.target.route), `${e.id} must not be linkable`);
});
test('pages that need a cart, an item, a lesson or the chat itself have no button, though they can still be found', () => {
  for (const id of ['page_pay', 'page_cart', 'page_create_item', 'page_edit_item', 'page_assistant', 'page_training_run', 'page_terminal_play']) assert.equal(byId(id).target, undefined, id);
});
test('every target is something the app can open: a real tab, or a route the app has', () => {
  const tabs = ['checkout', 'inventory', 'transactions', 'notifications', 'more', 'today', 'scan'];
  for (const e of screens) { if (!e.target) continue; if ('tab' in e.target) assert.ok(tabs.includes(e.target.tab), e.id); else assert.match(e.target.route, /^[a-z][A-Za-z]+$/, e.id); }
});

// ---- show_link ----
test('show_link makes a button for a help page and for a screen, and tells the model not to write the link itself', () => {
  const doc = runLink({ kind: 'doc', id: 'pay/cash' }); assert.equal(doc.link?.label, 'Taking cash'); assert.deepEqual(doc.link && [doc.link.kind, doc.link.id], ['doc', 'pay/cash']);
  assert.equal(body(doc).ok, true); assert.match(body(doc).note, /Do not write the link yourself/);
  const sc = runLink({ kind: 'screen', id: 'page_reports' }); assert.deepEqual(sc.link, { kind: 'screen', id: 'page_reports', label: 'Open Reports' });
  assert.ok(!('link' in body(sc)), 'the button is not part of what the model reads');
});
test('show_link: a page or screen the role may not see gets the same answer as one that does not exist', () => {
  const hidden = runLink({ kind: 'doc', id: 'settings/hardware' }, 'cashier'); const none = runLink({ kind: 'doc', id: 'no/such' }, 'cashier');
  assert.equal(hidden.message.content, none.message.content); assert.equal(hidden.link, undefined); assert.equal(hidden.record.ok, false);
  const s1 = runLink({ kind: 'screen', id: 'page_settings' }, 'cashier'); const s2 = runLink({ kind: 'screen', id: 'page_nothing' }, 'cashier');
  assert.equal(s1.message.content, s2.message.content); assert.equal(s1.link, undefined);
  assert.doesNotMatch(s1.message.content ?? '', /settings|staff|manager|owner/i);
  assert.ok(runLink({ kind: 'doc', id: 'settings/hardware' }, 'manager').link); assert.ok(runLink({ kind: 'screen', id: 'page_settings' }, 'owner').link);
});
test('show_link: a screen with no button, a bad kind, a missing id and bad arguments are errors the model can recover from', () => {
  for (const args of [{ kind: 'screen', id: 'sheet_refund' }, { kind: 'screen', id: 'page_pay' }, { kind: 'url', id: 'https://example.com' }, { kind: 'doc' }, { kind: 'doc', id: '   ' }, { kind: 'doc', id: 7 }, '[1]', 'not json']) {
    const r = runLink(args, 'owner'); assert.equal(r.link, undefined, JSON.stringify(args)); assert.equal(r.record.ok, false); assert.ok(typeof body(r).error === 'string');
  }
});
test('show_link never makes a button for a web address, whatever the model puts in the id', () => {
  for (const id of ['https://example.com', 'javascript:alert(1)', '../../etc/passwd']) for (const kind of ['doc', 'screen']) assert.equal(resolveLink(ctxFor('owner'), kind, id), null);
});
test('show_link is read-only: it is given nothing it could write with, and the result is only the note', () => {
  const t = ASSISTANT_TOOLS.find(x => x.def.function.name === 'show_link')!; assert.ok(t);
  assert.deepEqual(Object.keys(t.def.function.parameters as any).sort(), ['additionalProperties', 'properties', 'required', 'type']);
  assert.deepEqual(Object.keys(body(runLink({ kind: 'doc', id: 'start' }))).sort(), ['note', 'ok']);
});

// ---- checking again when drawn ----
test('a saved button is checked again for the role signed in now, and goes when that role cannot reach it', () => {
  const links = [{ kind: 'doc' as const, id: 'settings/hardware', label: 'Hardware settings' }, { kind: 'screen' as const, id: 'page_settings', label: 'Open Settings' }, { kind: 'screen' as const, id: 'page_reports', label: 'Open Reports' }];
  assert.deepEqual(liveLinks(ctxFor('owner'), links).map(l => l.link.id), ['settings/hardware', 'page_settings', 'page_reports']);
  assert.deepEqual(liveLinks(ctxFor('cashier'), links).map(l => l.link.id), ['page_reports']);
  assert.deepEqual(liveLinks(ctxFor('visitor'), links), []); assert.deepEqual(liveLinks(ctxFor('owner'), undefined), []);
});
test('what a button does: help opens the page, a tab switches tab, a page is pushed', () => {
  assert.deepEqual(resolveLink(ctxFor('owner'), 'doc', 'pay/cash')?.action, { to: 'help', id: 'pay/cash' });
  assert.deepEqual(resolveLink(ctxFor('owner'), 'screen', 'tab_more')?.action, { to: 'tab', tab: 'more' });
  assert.deepEqual(resolveLink(ctxFor('owner'), 'screen', 'page_orders')?.action, { to: 'route', route: 'orders' });
});
test('the same button twice is shown once', () => {
  const l = { kind: 'doc' as const, id: 'pay/cash', label: 'Taking cash' }; assert.equal(liveLinks(ctxFor('owner'), [l, l]).length, 1);
});

// ---- history ----
test('buttons are kept in the history, well formed ones only and at most three, and only on replies', () => {
  const h = readHistory([
    { id: 'a', role: 'assistant', text: 'ok', at: 1, links: [{ kind: 'doc', id: 'pay/cash', label: 'Taking cash' }, { kind: 'x', id: 'q', label: 'bad' }, { kind: 'doc', id: 'a', label: 'A' }, { kind: 'doc', id: 'b', label: 'B' }, { kind: 'doc', id: 'c', label: 'C' }, 'junk', null] },
    { id: 'u', role: 'user', text: 'hi', at: 0, links: [{ kind: 'doc', id: 'pay/cash', label: 'Taking cash' }] },
    { id: 'n', role: 'assistant', text: 'plain', at: 2, links: 'nope' },
  ]);
  assert.equal(h.find(e => e.id === 'a')!.links!.length, MAX_LINKS); assert.equal(h.find(e => e.id === 'u')!.links, undefined); assert.equal(h.find(e => e.id === 'n')!.links, undefined);
  assert.deepEqual(readLinks(undefined), []); assert.equal(readLinks([{ kind: 'doc', id: 'x', label: 'y'.repeat(500) }])[0].label.length, 120);
});
test('buttons are never sent to the model: only the text of earlier messages goes out', () => {
  const entry = { id: 'a', role: 'assistant' as const, text: 'Open Reports.', at: 1, links: [{ kind: 'screen' as const, id: 'page_reports', label: 'Open Reports' }] };
  const a: AskInput = { history: [{ id: 'u0', role: 'user', text: 'where is it', at: 0 }, entry], text: 'thanks', detail: 'short', settings: { contextSize: 8000, temperature: 0.2 }, endpoint: ep(), id: () => 'x', now: () => 1 };
  const p = prepare(a); assert.doesNotMatch(JSON.stringify(p.messages), /page_reports|links/);
});

// ---- the loop ----
function ep(): Endpoint { return { baseUrl: 'http://localhost:11434/v1', model: 'm', timeoutSec: 5 }; }
function scripted(steps: Array<{ content?: string | null; calls?: { name: string; args: unknown }[] }>) {
  let i = 0;
  const f: FetchLike = async () => {
    const s = steps[Math.min(i++, steps.length - 1)]; const message: any = { role: 'assistant', content: s.content ?? null };
    if (s.calls) message.tool_calls = s.calls.map((c, k) => ({ id: `call_${i}_${k}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }));
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message, finish_reason: s.calls ? 'tool_calls' : 'stop' }] }) };
  };
  return f;
}
const ask = (role = 'cashier'): AskInput => ({ history: [], text: 'Where are reports?', detail: 'short', settings: { contextSize: 8000, temperature: 0.2 }, endpoint: ep(), id: (() => { let n = 0; return () => `id${++n}`; })(), now: () => 1000, tools: makeToolSet({ pages, screens, role, contextSize: 8000 }) });

test('the loop: buttons the model asked for end up on the reply, once each, at most three', async () => {
  const f = scripted([
    { calls: [{ name: 'show_link', args: { kind: 'screen', id: 'page_reports' } }, { name: 'show_link', args: { kind: 'screen', id: 'page_reports' } }, { name: 'show_link', args: { kind: 'doc', id: 'pay/cash' } }] },
    { calls: [{ name: 'show_link', args: { kind: 'screen', id: 'page_orders' } }, { name: 'show_link', args: { kind: 'screen', id: 'page_items' } }] },
    { content: 'Reports is under More.' },
  ]);
  const a = ask(); const out = await runPrepared(f, a, prepare(a));
  assert.deepEqual(out.reply.links!.map(l => l.id), ['page_reports', 'pay/cash', 'page_orders']); assert.equal(out.reply.text, 'Reports is under More.');
});
test('the loop: a refused button is not on the reply, and a reply with none has no links field', async () => {
  let a = ask('cashier'); let out = await runPrepared(scripted([{ calls: [{ name: 'show_link', args: { kind: 'screen', id: 'page_settings' } }] }, { content: "I couldn't find anything on that." }]), a, prepare(a));
  assert.equal(out.reply.links, undefined); assert.ok(!('links' in out.reply));
  a = ask('cashier'); out = await runPrepared(scripted([{ content: 'Hello.' }]), a, prepare(a)); assert.ok(!('links' in out.reply));
});
test('the loop: the audit log still sees the show_link call and what the model was told', async () => {
  const a = ask(); await runPrepared(scripted([{ calls: [{ name: 'show_link', args: { kind: 'doc', id: 'pay/cash' } }] }, { content: 'Done.' }]), a, prepare(a));
  assert.deepEqual(a.tools!.records.map(r => [r.name, r.ok]), [['show_link', true]]); assert.match(a.tools!.records[0].result, /will be shown under your reply/);
});

// ---- the prompt ----
test('the prompt names the link tool and tells the model not to write links or ids, and still names nothing restricted', () => {
  const p = buildSystemPrompt('short', true);
  assert.match(p, /eighteen tools/); assert.match(p, /show_link/); assert.match(p, /never write a link, an id or a page id/);
  assert.doesNotMatch(p, /manager|owner|printer|hardware|reports page|staff page/i);
  assert.doesNotMatch(buildSystemPrompt('short', false), /show_link/);
});
