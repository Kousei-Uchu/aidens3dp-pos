// Location: tests/assistantscreens.test.ts
// The assistant's screen tool (patch 0158): the screen index built from the app graph, the role filter, and search_screens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTANT_TOOLS, makeToolSet, resultText, runToolCall, searchScreenList, toolDefs, visibleScreens } from '../src/lib/assistantTools';
import { buildScreenIndex, builtinScreens, HOME_SCREEN, type ScreenEntry } from '../src/lib/assistantScreens';
import { buildSystemPrompt } from '../src/lib/assistantChat';
import { screenMeta, tree } from '../src/lib/appGraph';

const index = buildScreenIndex();
const byId = (id: string): ScreenEntry => { const e = index.find(x => x.id === id); assert.ok(e, `missing ${id}`); return e!; };
const ctxFor = (role: string, over: Partial<{ maxChars: number; screens: ScreenEntry[] }> = {}) => ({ pages: [], screens: index, role, maxChars: 4000, ...over });
const call = (name: string, args: unknown, id = 'c1') => ({ id, type: 'function' as const, function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } });
const run = (name: string, args: unknown, role = 'cashier', over: Partial<{ maxChars: number; screens: ScreenEntry[] }> = {}) =>
  JSON.parse(runToolCall(call(name, args), { tools: ASSISTANT_TOOLS, ctx: ctxFor(role, over) }).message.content ?? '{}');
const names = (r: any): string[] => r.results.map((x: any) => x.name);

// ---- the index ----
test('the index lists the tabs, pages and windows of the real till, and nothing practice only or drawn over everything', () => {
  assert.ok(index.length > 50);
  for (const id of ['tab_checkout', 'tab_more', 'view_keypad', 'page_reports', 'page_drawer', 'sheet_refund', 'sheet_cash_receive']) byId(id);
  assert.ok(!index.some(e => e.id.startsWith('overlay_')), 'no overlays');
  assert.ok(!index.some(e => e.id.startsWith('do_')), 'no control nodes');
  for (const e of index) { assert.ok(e.name && e.kind && e.roles.length, e.id); assert.ok(['tab', 'view', 'page', 'window'].includes(e.kind), `${e.id} kind ${e.kind}`); }
  assert.equal(byId('sheet_refund').kind, 'window'); assert.equal(byId('page_orders').kind, 'page'); assert.equal(byId('tab_more').kind, 'tab');
});
test('every screen a person might look for says what it is for', () => {
  const blank = index.filter(e => !e.summary).map(e => e.id);
  assert.deepEqual(blank, [], 'add a summary in src/app.navgraph');
  for (const e of index) assert.ok(e.keywords.length > 0, `${e.id} needs keywords`);
});
test('the index follows the graph: every entry is a real screen, and its words come from the graph', () => {
  const t = tree(); assert.ok(t);
  for (const e of index) { assert.ok(t!.hasScreen(e.id), e.id); assert.equal(screenMeta(e.id)?.summary, e.summary); }
});
test('the list for the app is built once and is the same list', () => { assert.equal(builtinScreens(), builtinScreens()); assert.equal(builtinScreens().length, index.length); });

// ---- roles ----
test('a cashier is not given Settings, Staff or the windows inside them, though the Settings screen carries no roles of its own', () => {
  for (const id of ['page_settings', 'page_staff', 'sheet_switch_staff', 'sheet_staff_pass']) { assert.ok(!byId(id).roles.includes('cashier'), id); assert.ok(byId(id).roles.includes('manager') && byId(id).roles.includes('owner'), id); }
  assert.ok(!visibleScreens({ screens: index, role: 'cashier' }).some(e => ['Settings', 'Staff', 'Switch staff', 'Staff pass'].includes(e.name)));
  assert.ok(visibleScreens({ screens: index, role: 'manager' }).some(e => e.name === 'Settings'));
});
test('an unknown role sees nothing, and a context with no screens finds nothing', () => {
  assert.deepEqual(visibleScreens({ screens: index, role: 'visitor' }), []);
  assert.deepEqual(searchScreenList({ screens: index, role: 'visitor' }, 'reports'), []);
  assert.deepEqual(searchScreenList({ role: 'owner' }, 'reports'), []);
  assert.equal(run('search_screens', { query: 'reports' }, 'owner', { screens: [] }).results.length, 0);
});

// ---- how to open ----
test('how to open starts from Checkout and uses the words the app already says', () => {
  assert.deepEqual(byId('page_reports').steps.cashier, ['Tap More.', 'Tap Reports.']);
  assert.deepEqual(byId('sheet_refund').steps.owner, ['Tap More.', 'Tap Orders.', 'Tap the order.', 'Tap Refund or return.']);
  assert.deepEqual(byId('page_pay').steps.cashier, ['Tap Charge.']);
  assert.deepEqual(byId(HOME_SCREEN).steps.cashier, [], 'Checkout is where the walk starts');
  assert.deepEqual(byId('page_settings').steps.manager, ['Tap More.', 'Tap Settings.']);
  assert.equal(byId('page_settings').steps.cashier, undefined, 'no walk for a role that cannot get there');
});
test('the windows inside a cart line have a walk too, though the line is only known while the till runs', () => {
  assert.deepEqual(byId('sheet_line_discount').steps.cashier, ["Open the item's window first.", 'Tap Discount.']);
});

// ---- search_screens ----
test('search_screens finds a screen by its name, and by what it is for', () => {
  assert.equal(run('search_screens', { query: 'cash drawer' }).results[0].name, 'Cash drawer');
  assert.equal(run('search_screens', { query: 'end of day takings' }).results[0].name, 'Reports');
  const r = run('search_screens', { query: 'how do I refund a sale' });
  assert.ok(names(r).includes('Return'), names(r).join(','));
  assert.deepEqual(r.results.find((x: any) => x.name === 'Return').how_to_open, ['Tap More.', 'Tap Orders.', 'Tap the order.', 'Tap Refund or return.']);
  assert.equal(run('search_screens', { query: 'gift card balance' }).results[0].id, 'page_giftcards');
});
test('search_screens: the screen name beats a word that only appears in a summary, and a sentence still finds something', () => {
  assert.equal(run('search_screens', { query: 'split' }).results[0].name, 'Split amount');
  assert.equal(run('search_screens', { query: 'where can I split the bill between two people' }).results[0].name, 'Split amount');
  assert.equal(run('search_screens', { query: 'discount one item' }).results[0].name, 'Item discount');
});
test('search_screens ignores words that name no screen, such as page, window and open', () => {
  assert.equal(run('search_screens', { query: 'open the reports page' }).results[0].name, 'Reports');
  assert.equal(run('search_screens', { query: 'open window screen page' }).results.length, 0);
});
test('search_screens: at most 5, a bad or empty query is told so, and nothing found says so', () => {
  assert.ok(run('search_screens', { query: 'cash' }).results.length <= 5);
  assert.match(run('search_screens', { query: '' }).error, /Give a query/);
  assert.match(run('search_screens', {}).error, /Give a query/);
  const none = run('search_screens', { query: 'quantum teleporter flux' });
  assert.deepEqual(none.results, []); assert.match(none.note, /No screen matched/);
});
test('search_screens only offers the walk note when a result has one', () => {
  assert.match(run('search_screens', { query: 'reports' }).note, /Checkout tab/);
  assert.equal(run('search_screens', { query: 'checkout' }).results.find((x: any) => x.id === 'tab_checkout').how_to_open, undefined);
});

// ---- the role filter, end to end ----
test('search_screens never returns a screen the role cannot get to, and gives nothing away about it', () => {
  for (const q of ['settings', 'staff', 'staff pin roles', 'shopify setup', 'cashier pass', 'switch staff', 'backup']) {
    const r = run('search_screens', { query: q }, 'cashier'); const text = JSON.stringify(r);
    assert.doesNotMatch(text, /Settings|Staff|page_settings|page_staff|sheet_switch_staff|sheet_staff_pass/, q);
  }
  assert.equal(run('search_screens', { query: 'staff pin roles' }, 'manager').results[0].id, 'page_staff');
  assert.equal(run('search_screens', { query: 'settings' }, 'owner').results[0].id, 'page_settings');
});
test('the answer for a restricted screen is the same as for one that does not exist', () => {
  const missing = run('search_screens', { query: 'zzzz qqqq' }, 'cashier'); const restricted = run('search_screens', { query: 'staff pin' }, 'cashier');
  if (!restricted.results.length) assert.deepEqual(restricted, { results: [], note: missing.note });
  else assert.ok(!restricted.results.some((x: any) => /staff/i.test(x.name)), 'whatever else matches, it is not a Staff screen');
});
test('nothing shown for a screen a cashier may open names a screen or role that a cashier may not', () => {
  for (const e of visibleScreens({ screens: index, role: 'cashier' })) {
    const text = [e.name, e.summary, ...e.keywords, ...(e.steps.cashier ?? [])].join(' | ');
    assert.doesNotMatch(text, /\bsettings\b|\bstaff\b|\bmanagers?\b|\bowners?\b|\bpins?\b/i, `${e.id}: ${text}`);
  }
});
test('no walk to an allowed screen passes through a screen the role cannot open', () => {
  const blocked = new Set(['Tap Settings.', 'Tap Staff.']);
  for (const e of index.filter(x => x.roles.includes('cashier'))) for (const s of e.steps.cashier ?? []) assert.ok(!blocked.has(s), `${e.id}: ${s}`);
});

// ---- plumbing ----
test('the tool is listed with the others, with a description and object parameters, and it names nothing a cashier may not use', () => {
  const defs = toolDefs(ASSISTANT_TOOLS); const d = defs.find(x => x.function.name === 'search_screens')!; assert.ok(d);
  assert.ok(d.function.description.length > 20); assert.equal((d.function.parameters as any).type, 'object'); assert.deepEqual((d.function.parameters as any).required, ['query']);
  assert.doesNotMatch(JSON.stringify(d), /settings|staff|manager|owner|printer|hardware/i);
});
test('results are cut to the limit like every other tool, and stay valid JSON', () => {
  const r = runToolCall(call('search_screens', { query: 'cash' }), { tools: ASSISTANT_TOOLS, ctx: ctxFor('owner', { maxChars: 300 }) });
  assert.ok((r.message.content ?? '').length <= 300); assert.doesNotThrow(() => JSON.parse(r.message.content ?? ''));
});
test('a result that has to be cut still fits the limit when it is full of quotes, and stays valid JSON', () => {
  const quoted = { results: Array.from({ length: 80 }, (_, i) => ({ name: `"Item ${i}"`, summary: 'say "yes" to "all"' })) };
  for (const max of [60, 300, 1500]) { const t = resultText(quoted, max); assert.ok(t.length <= max, `${t.length} > ${max}`); const j = JSON.parse(t); assert.equal(j.cut, true); }
  assert.equal(resultText({ a: 1 }, 1500), '{"a":1}', 'a short result is untouched');
});
test('makeToolSet carries the screens, and a set made without them has none', () => {
  const set = makeToolSet({ pages: [], screens: index, role: 'owner', contextSize: 4096 });
  assert.equal(set.ctx.screens, index);
  assert.equal(makeToolSet({ pages: [], role: 'owner', contextSize: 4096 }).ctx.screens, undefined);
});
test('a call is logged with the screens it was given', () => {
  const r = runToolCall(call('search_screens', { query: 'reports' }), { tools: ASSISTANT_TOOLS, ctx: ctxFor('cashier') });
  assert.equal(r.record.name, 'search_screens'); assert.equal(r.record.ok, true); assert.match(r.record.result, /Reports/);
});
test('the prompt tells the model about the screen tool, and still names no restricted thing', () => {
  const p = buildSystemPrompt('short', true);
  assert.match(p, /search_screens/); assert.match(p, /couldn't find anything on that/); assert.match(p, /only the taps it lists/);
  assert.doesNotMatch(p, /manager|owner|printer|hardware|settings page|staff page/i);
  assert.doesNotMatch(buildSystemPrompt('short', false), /search_screens/);
});
