// Location: tests/assistantcontext.test.ts
// The assistant's screen and register context tool (patch 0167): where the person was standing, the tabs and mode, the role filter on the
// screen it names, that it needs no shop data, and that every field it returns is in its field map.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGate, resolvePolicy } from '../src/lib/assistantGate';
import { ASSISTANT_TOOLS, makeToolSet, runToolCall, visibleScreens } from '../src/lib/assistantTools';
import { buildSystemPrompt } from '../src/lib/assistantChat';
import { TAB_LABELS, contextInfo, registerContext, standingOn, type RegisterContext } from '../src/lib/assistantContext';
import { buildScreenIndex, type ScreenEntry } from '../src/lib/assistantScreens';
import { screenOfRoute } from '../src/lib/appGraph';
import { MODES, MODE_LABEL, TAB_ORDER, resolveUi } from '../src/lib/uiMode';

const index = buildScreenIndex();
const byId = (id: string): ScreenEntry => { const e = index.find(x => x.id === id); assert.ok(e, `missing ${id}`); return e!; };
const call = (args: unknown = {}) => ({ id: 'c1', type: 'function' as const, function: { name: 'screen_context', arguments: JSON.stringify(args) } });
const where = (over: Partial<RegisterContext> = {}): RegisterContext => ({ screen: 'tab_more', tab: 'more', mode: 'standard', tabs: [...TAB_ORDER], guided: false, practice: false, register: 'Register 1', ...over });
const ask = (role: string, w?: RegisterContext): any => JSON.parse(runToolCall(call(), { tools: ASSISTANT_TOOLS, ctx: { pages: [], screens: index, role, maxChars: 4000, ...(w ? { where: w } : {}) } }).message.content ?? '{}');
const stack = (...names: string[]) => names.map(name => ({ name }));
const ctxOf = (o: Partial<Parameters<typeof registerContext>[0]> = {}) => registerContext({ tab: 'checkout', stack: [], screenOfRoute, mode: 'standard', tabs: TAB_ORDER, guided: false, practice: false, ...o });

// ---- where the person was standing ----
test('the chat and Help are the way in, so the page under them is where the person was', () => {
  assert.equal(standingOn([]), undefined, 'on a tab, nothing is pushed');
  assert.equal(standingOn(stack('help', 'assistant')), undefined, 'opened from the More menu');
  assert.equal(standingOn(stack('reports', 'help', 'assistant')), 'reports', 'opened from a page');
  assert.equal(standingOn(stack('orders', 'help', 'help', 'assistant')), 'orders', 'through a help page');
  assert.equal(standingOn(stack('assistant')), undefined);
  assert.equal(standingOn(stack('pay')), 'pay', 'with no chat on the stack, the top page is where they are');
  assert.equal(standingOn(stack('help', 'reports', 'assistant')), 'reports', 'Help is only skipped at the end of the stack');
});
test('a tab is named by its graph id, a pushed page by the graph, and a page the graph does not know is not guessed', () => {
  assert.equal(ctxOf({ tab: 'inventory' }).screen, 'tab_inventory');
  assert.equal(ctxOf({ tab: 'more', stack: stack('help', 'assistant') }).screen, 'tab_more');
  assert.equal(ctxOf({ tab: 'more', stack: stack('reports', 'help', 'assistant') }).screen, 'page_reports');
  assert.equal(ctxOf({ tab: 'more', stack: stack('somethingNew', 'help', 'assistant') }).screen, null, 'it does not fall back to the tab under it');
  assert.equal(ctxOf({ stack: stack('constructor', 'assistant') }).screen, null, 'a name from the object prototype is not a page');
  assert.equal(screenOfRoute('reports'), 'page_reports'); assert.equal(screenOfRoute('toString'), undefined);
});
test('the register name is trimmed and capped, a blank one is left out, and the lists are copies', () => {
  assert.equal(ctxOf({ register: '  Front till  ' }).register, 'Front till'); assert.equal('register' in ctxOf({ register: '   ' }), false); assert.equal('register' in ctxOf(), false);
  assert.equal(ctxOf({ register: 'x'.repeat(200) }).register!.length, 60);
  const tabs = ['checkout', 'more']; const c = ctxOf({ tabs }); tabs.push('inventory'); assert.deepEqual(c.tabs, ['checkout', 'more']);
  assert.equal(ctxOf({ practice: true }).practice, true); assert.equal(ctxOf({ guided: true }).guided, true);
});

// ---- what the model is told ----
test('on a tab: the screen, the selected tab, the role, the mode and the tabs that mode shows', () => {
  const out = ask('cashier', where({ mode: 'minimal', tabs: ['checkout', 'transactions', 'more'], guided: true }));
  assert.equal(out.role, 'cashier'); assert.equal(out.display_mode, 'Minimal'); assert.deepEqual(out.tabs_shown, ['Checkout', 'Transactions', 'More']);
  assert.equal(out.guided_checkout, true); assert.equal(out.practice_mode, false); assert.equal(out.register, 'Register 1');
  assert.equal(out.selected_tab, 'More'); assert.equal(out.screen.name, 'More'); assert.equal(out.screen.kind, 'tab'); assert.equal(out.screen.summary, byId('tab_more').summary);
  assert.match(out.note, /Checkout tab/);
});
test('the tabs of a real Minimal profile are the three the display modes page promises', () => {
  const p = resolveUi({ mode: 'minimal' }); const out = ask('owner', where({ mode: p.mode, tabs: p.tabs, guided: p.guided }));
  assert.deepEqual(out.tabs_shown, ['Checkout', 'Transactions', 'More']); assert.equal(out.guided_checkout, true);
  const std = resolveUi({ mode: 'standard' }); assert.deepEqual(ask('owner', where({ tabs: std.tabs })).tabs_shown, ['Checkout', 'Inventory', 'Transactions', 'Notifications', 'More']);
});
test('on a page: the page is named with the tab under it', () => {
  const out = ask('owner', where({ screen: 'page_reports', tab: 'more' }));
  assert.equal(out.screen.name, byId('page_reports').name); assert.equal(out.screen.kind, 'page'); assert.equal(out.selected_tab, 'More');
});
test('every display mode has its own name, and an unknown one is passed on as written', () => {
  for (const m of MODES) assert.equal(contextInfo('owner', where({ mode: m }), byId('tab_more')).display_mode, MODE_LABEL[m]);
  assert.equal(contextInfo('owner', where({ mode: 'mystery' }), byId('tab_more')).display_mode, 'mystery');
});
test('no context at all says it does not know, and still gives the role', () => {
  const out = ask('cashier'); assert.equal(out.role, 'cashier'); assert.match(out.note, /not known/); assert.equal(out.screen, undefined); assert.equal(out.tabs_shown, undefined);
});
test('a page the till cannot name says so and does not report the tab underneath as if it were the page', () => {
  const out = ask('owner', where({ screen: null, tab: 'more' }));
  assert.match(out.note, /cannot tell which page/); assert.equal(out.screen, undefined); assert.equal(out.selected_tab, undefined);
  assert.equal(out.display_mode, 'Standard'); assert.equal(out.role, 'owner');
});

// ---- roles ----
test('a page this role cannot reach gets exactly the answer a page the till cannot name gets', () => {
  assert.ok(!byId('page_settings').roles.includes('cashier'));
  const hidden = ask('cashier', where({ screen: 'page_settings' })); const unknown = ask('cashier', where({ screen: null }));
  assert.deepEqual(hidden, unknown); assert.doesNotMatch(JSON.stringify(hidden), /settings/i);
  assert.equal(ask('manager', where({ screen: 'page_settings' })).screen.name, byId('page_settings').name);
  assert.deepEqual(ask('visitor', where({ screen: 'tab_more' })).screen, undefined, 'an unknown role is named no screen');
  assert.ok(visibleScreens({ screens: index, role: 'cashier' }).length > 0);
});

// ---- the gate, the loop and the prompt ----
test('it needs no shop data and every field it returns is in its field map', () => {
  const tool = ASSISTANT_TOOLS.find(t => t.def.function.name === 'screen_context')!; assert.ok(tool);
  const ctx = { pages: [], screens: index, role: 'owner', maxChars: 4000, where: where({ screen: 'page_reports' }) };
  const out = tool.run({}, ctx); const g = applyGate(out, tool.gate, resolvePolicy('remote'));
  assert.deepEqual(g.unknown, []); assert.deepEqual(g.withheld, {}, 'nothing in it is personal, so a remote address keeps all of it'); assert.deepEqual(g.value, out);
  const bare = applyGate(tool.run({}, { pages: [], role: 'owner', maxChars: 4000 }), tool.gate, resolvePolicy('remote')); assert.deepEqual(bare.unknown, []);
  const none = applyGate(contextInfo('owner', where(), undefined), tool.gate, resolvePolicy('remote')); assert.deepEqual(none.unknown, []);
});
test('it names no ids, only what the person would call the screen', () => {
  const text = JSON.stringify(ask('owner', where({ screen: 'page_reports' }))); assert.doesNotMatch(text, /page_reports|tab_more|"id"/); assert.doesNotMatch(text, /[–—]/);
});
test('the tab names are the ones in the app graph, so they cannot drift', () => {
  for (const id of TAB_ORDER) assert.equal(byId(`tab_${id}`).name, TAB_LABELS[id], id);
  assert.deepEqual(Object.keys(TAB_LABELS).sort(), [...TAB_ORDER].sort());
});
test('it is offered with the other tools, takes no arguments and cannot write', () => {
  const tool = ASSISTANT_TOOLS.find(t => t.def.function.name === 'screen_context')!;
  assert.deepEqual(tool.def.function.parameters, { type: 'object', properties: {}, additionalProperties: false }); assert.ok(tool.def.function.description.length > 20); assert.doesNotMatch(JSON.stringify(tool.def), /[–—]/); assert.equal(tool.link, undefined);
  assert.equal(ASSISTANT_TOOLS.length, 19);
});
test('makeToolSet hands the context to the tool, and leaving it out leaves the tool saying it does not know', () => {
  const w = where({ screen: 'page_reports' }); const set = makeToolSet({ pages: [], screens: index, role: 'owner', contextSize: 8000, where: w }); assert.equal(set.ctx.where, w);
  const r = runToolCall(call(), set); assert.equal(r.record.ok, true); assert.match(r.message.content ?? '', /Reports/);
  assert.equal(makeToolSet({ pages: [], role: 'owner', contextSize: 8000 }).ctx.where, undefined);
  assert.match(runToolCall(call(), makeToolSet({ pages: [], role: 'owner', contextSize: 8000 })).message.content ?? '', /not known/);
});
test('the prompt names it and still names no restricted thing', () => {
  const p = buildSystemPrompt('short', true); assert.match(p, /screen_context/); assert.match(p, /eighteen tools/); assert.match(p, /never tell them to tap a tab that it does not list/i);
  assert.doesNotMatch(p, /manager|owner|printer|hardware|reports page|staff page|settings page/i); assert.doesNotMatch(p, /[–—]/);
  assert.doesNotMatch(buildSystemPrompt('short', false), /screen_context/);
});
