// Location: tests/assistantguide.test.ts
// "Guide me there" (patch 0162): the rules for what the pointer shows, the one active guide, the walks built from the app graph, and the show_guide tool.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DONE_SHOW_MS, GUIDE_MAX_MS, LOST_LINE, atTarget, currentGuide, doneLine, guideVersion, guideView, pressedLast, progressLabel, startGuide, stopGuide, subscribeGuide, type Guide } from '../src/lib/assistantGuide';
import { buildScreenIndex, type GuideGap, type ScreenEntry } from '../src/lib/assistantScreens';
import { ASSISTANT_TOOLS, liveLinks, resolveLink, runToolCall, searchScreenList, type ToolContext } from '../src/lib/assistantTools';
import { readLinks, buildSystemPrompt } from '../src/lib/assistantChat';
import { isKnownSpot } from '../src/lib/trainingSpots';
import { PAGE_ROLES } from '../src/lib/helpDocs';

const screens = buildScreenIndex();
const byId = (id: string): ScreenEntry => screens.find(e => e.id === id)!;
const ctxFor = (role: string, over: Partial<ToolContext> = {}): ToolContext => ({ pages: [], screens, role, maxChars: 6000, ...over });
const call = (name: string, args: unknown) => ({ id: 'c1', type: 'function' as const, function: { name, arguments: JSON.stringify(args) } });
const run = (name: string, args: unknown, role = 'cashier') => runToolCall(call(name, args), { tools: ASSISTANT_TOOLS, ctx: ctxFor(role) });
const only = (...on: string[]) => (spot: string) => on.includes(spot);

const reports: Guide = { screen: 'page_reports', name: 'Reports', steps: [{ spot: 'tab.more', say: 'Tap More.' }, { spot: 'more.reports', say: 'Tap Reports.' }], target: { route: 'reports' } };
const keypad: Guide = { screen: 'view_keypad', name: 'Keypad', steps: [{ spot: 'find.tab:keypad', say: 'Tap Keypad.' }], arrive: ['find.keypad', 'find.keypad.add'] };
const noArrive: Guide = { screen: 'x', name: 'X', steps: [{ spot: 'a', say: 'Tap a.' }, { spot: 'b', say: 'Tap b.' }] };

// ---------- what the pointer shows ----------
test('guideView points at the last control of the walk that is on screen', () => {
  const nav = { tab: 'checkout' };
  assert.deepEqual(guideView(reports, { ...nav, mounted: only('tab.more') }), { kind: 'point', index: 0, of: 2, step: reports.steps[0] });
  assert.deepEqual(guideView(reports, { tab: 'more', mounted: only('tab.more', 'more.reports') }), { kind: 'point', index: 1, of: 2, step: reports.steps[1] });
});

test('a person already part of the way there is picked up, and one who strayed is pointed back', () => {
  assert.equal((guideView(reports, { tab: 'more', mounted: only('more.reports') }) as any).index, 1);
  // tapped a different tab: only the tab bar is on screen, so the walk starts again from its first tap
  assert.equal((guideView(reports, { tab: 'inventory', mounted: only('tab.more') }) as any).index, 0);
});

test('guideView: nothing from the walk on screen means the way is lost', () => {
  assert.deepEqual(guideView(reports, { tab: 'checkout', mounted: () => false }), { kind: 'lost' });
  assert.ok(LOST_LINE.length > 20);
});

test('arriving: a page is reached when it is on top, a tab when no page is open on it', () => {
  assert.deepEqual(guideView(reports, { tab: 'more', route: 'reports', mounted: only('tab.more') }), { kind: 'done' });
  assert.notEqual(guideView(reports, { tab: 'more', route: 'customers', mounted: only('tab.more') }).kind, 'done');
  const tab: Guide = { screen: 'tab_inventory', name: 'Inventory', steps: [{ spot: 'tab.inventory', say: 'Tap Inventory.' }], target: { tab: 'inventory' } };
  assert.deepEqual(guideView(tab, { tab: 'inventory', mounted: only('tab.inventory') }), { kind: 'done' });
  assert.notEqual(guideView(tab, { tab: 'inventory', route: 'help', mounted: only('tab.inventory') }).kind, 'done'); // a page open on top of the tab
  assert.notEqual(guideView(tab, { tab: 'more', mounted: only('tab.inventory') }).kind, 'done');
  assert.equal(atTarget(undefined, { tab: 'more' }), false);
});

test('arriving at a view: one of its own controls on screen, or a tap on the last control', () => {
  assert.equal(guideView(keypad, { tab: 'checkout', mounted: only('find.tab:keypad') }).kind, 'point');
  assert.equal(guideView(keypad, { tab: 'checkout', mounted: only('find.tab:keypad', 'find.keypad') }).kind, 'done');
  assert.equal(guideView(noArrive, { tab: 'checkout', mounted: only('b') }).kind, 'point');
  assert.equal(guideView(noArrive, { tab: 'checkout', mounted: only('b'), finished: true }).kind, 'done');
  assert.equal(pressedLast(noArrive, 'b'), true); assert.equal(pressedLast(noArrive, 'a'), false);
  assert.equal(pressedLast(reports, 'more.reports'), false, 'a guide with a target is finished by arriving, not by a tap');
});

test('the words are plain', () => {
  assert.equal(progressLabel(0, 3), 'Step 1 of 3'); assert.equal(doneLine('Reports'), 'You are there: Reports.');
  for (const s of [LOST_LINE, doneLine('Reports'), progressLabel(1, 2)]) assert.ok(!/[\u2013\u2014]/.test(s), s);
  assert.ok(DONE_SHOW_MS > 1000 && GUIDE_MAX_MS >= 60_000);
});

// ---------- the one active guide ----------
test('the store: one guide at a time, copied, announced, and never started empty', () => {
  stopGuide(); let n = 0; const off = subscribeGuide(() => { n++; });
  assert.equal(currentGuide(), null); assert.equal(startGuide({ screen: 's', name: 'S', steps: [] }), false); assert.equal(n, 0); assert.equal(currentGuide(), null);
  const v0 = guideVersion(); assert.equal(startGuide(reports), true); assert.equal(n, 1); assert.ok(guideVersion() > v0);
  assert.notEqual(currentGuide()!.steps, reports.steps); assert.deepEqual(currentGuide()!.steps, reports.steps);
  assert.equal(startGuide(keypad), true); assert.equal(currentGuide()!.screen, 'view_keypad');
  stopGuide(); assert.equal(currentGuide(), null); const before = n; stopGuide(); assert.equal(n, before, 'stopping nothing says nothing');
  off(); startGuide(reports); assert.equal(n, before); stopGuide();
});

// ---------- the walks built from the app graph ----------
test('screens a guide can point the way to have a walk of controls that really exist', () => {
  let guidable = 0;
  for (const e of screens) for (const [role, walk] of Object.entries(e.walk ?? {})) {
    assert.ok(walk!.length > 0, `${e.id} ${role}`); guidable++;
    assert.ok(e.roles.includes(role), `${e.id} has a walk for ${role}, who cannot get there`);
    for (const s of walk!) { assert.ok(s.say.length > 0, `${e.id} says nothing`); assert.ok(isKnownSpot(s.spot), `${e.id}: ${s.spot} is not a known control`); }
  }
  assert.ok(guidable > 20);
});

test('the walks dropped because a control is not a real spot are exactly the three known ones (patch 0162)', () => {
  const gaps: GuideGap[] = []; buildScreenIndex(PAGE_ROLES, gaps);
  // An item row has no id in the graph, Start is repeated on every lesson card, and the Training page is skipped by the spot scan in
  // tests/trainingspots.test.ts, so none of these can be pointed at as one control.
  assert.deepEqual([...new Set(gaps.map(g => `${g.screen}:${g.spot}`))].sort(), ['page_edit_item:items.row', 'page_terminal_play:training.terminal', 'page_training_run:training.start']);
  assert.equal(byId('page_edit_item').walk?.cashier, undefined);
  assert.equal(byId('page_training_run').walk?.cashier, undefined);
  assert.equal(byId('page_terminal_play').walk?.cashier, undefined);
});

test('the More rows and the Transactions tab are real controls a walk can end on (patch 0162)', () => {
  const spots = (id: string, role: string) => byId(id).walk?.[role]?.map(x => x.spot);
  assert.deepEqual(spots('page_reports', 'cashier'), ['tab.more', 'more.reports']);
  assert.deepEqual(spots('page_giftcards', 'cashier'), ['tab.more', 'more.giftcards']);
  assert.deepEqual(spots('page_help', 'cashier'), ['tab.more', 'more.help']);
  assert.deepEqual(spots('page_settings', 'manager'), ['tab.more', 'more.settings']);
  assert.deepEqual(spots('page_staff', 'owner'), ['tab.more', 'more.staff']);
  assert.deepEqual(spots('tab_transactions', 'cashier'), ['tab.transactions']);
  assert.equal(byId('page_settings').walk?.cashier, undefined, 'a cashier gets no walk to a page they cannot reach');
});

test('walks: the Checkout tab has none, windows have none, and the main pages do', () => {
  assert.equal(byId('tab_checkout').walk?.cashier, undefined);
  for (const e of screens.filter(x => x.kind === 'window')) assert.deepEqual(e.walk, {}, `${e.id} is a window`);
  assert.deepEqual(byId('page_reports').walk?.cashier?.map(s => s.spot), ['tab.more', 'more.reports']);
  assert.deepEqual(byId('tab_inventory').walk?.owner?.map(s => s.spot), ['tab.inventory']);
});

test('walks follow the role: a cashier has no walk to a screen only managers reach', () => {
  for (const id of ['page_settings', 'page_staff']) { assert.deepEqual(Object.keys(byId(id).walk ?? {}).sort(), ['manager', 'owner']); assert.equal(byId(id).walk?.cashier, undefined); }
  for (const e of screens) for (const r of Object.keys(e.walk ?? {})) assert.ok(PAGE_ROLES.includes(r), r);
});

test('a screen with a tab or a page of its own is finished by arriving, a view by its own controls', () => {
  assert.deepEqual(byId('tab_inventory').target, { tab: 'inventory' });
  assert.ok(byId('page_reports').target && 'route' in byId('page_reports').target!);
  assert.equal(byId('view_keypad').target, undefined); assert.ok(byId('view_keypad').arrive!.includes('find.keypad'));
  assert.ok(byId('view_all').arrive!.length > 0);
  for (const e of screens.filter(x => x.kind !== 'view')) assert.equal(e.arrive, undefined, e.id);
});

// ---------- the tool ----------
test('show_guide: makes a "Guide me to" button with the walk, for a screen this role can reach', () => {
  const r = run('show_guide', { screen: 'page_reports' });
  assert.equal(r.record.ok, true); assert.deepEqual(r.link, { kind: 'guide', id: 'page_reports', label: 'Guide me to Reports' });
  const res = resolveLink(ctxFor('cashier'), 'guide', 'page_reports')!;
  assert.equal(res.action.to, 'guide');
  if (res.action.to === 'guide') { assert.deepEqual(res.action.guide.steps.map(s => s.spot), ['tab.more', 'more.reports']); assert.deepEqual(res.action.guide.target, { route: 'reports' }); assert.equal(res.action.guide.screen, 'page_reports'); assert.equal(res.action.guide.name, 'Reports'); }
});

test('show_guide: a screen the role cannot reach gets the same answer as one that does not exist', () => {
  const hidden = run('show_guide', { screen: 'page_settings' }, 'cashier'); const nope = run('show_guide', { screen: 'page_no_such_thing' }, 'cashier');
  assert.equal(hidden.record.ok, false); assert.equal(hidden.link, undefined); assert.equal(hidden.message.content, nope.message.content);
  assert.equal(run('show_guide', { screen: 'page_settings' }, 'owner').record.ok, true);
  assert.equal(run('show_guide', { screen: 'page_settings' }, 'unknown-role').record.ok, false);
});

test('show_guide: no guide for the start screen, a window, nothing, or a wrong kind of argument', () => {
  for (const args of [{ screen: 'tab_checkout' }, { screen: 'sheet_cart_menu' }, { screen: '' }, { screen: 5 }, {}, { screen: ['page_reports'] }]) { const r = run('show_guide', args); assert.equal(r.record.ok, false, JSON.stringify(args)); assert.equal(r.link, undefined); }
});

test('search_screens marks the screens that can be guided, and only for roles that have a walk', () => {
  const hit = (q: string, role: string) => searchScreenList(ctxFor(role), q, 20);
  assert.equal(hit('reports', 'cashier').find(h => h.id === 'page_reports')?.can_guide, true);
  assert.equal(hit('cart menu', 'cashier').find(h => h.id === 'sheet_cart_menu')?.can_guide, undefined);
  assert.equal(hit('checkout', 'cashier').find(h => h.id === 'tab_checkout')?.can_guide, undefined);
  assert.equal(hit('settings', 'cashier').find(h => h.id === 'page_settings'), undefined);
});

test('a guide button is checked again when drawn, so it goes when the role can no longer reach the screen', () => {
  const stored = [{ kind: 'guide' as const, id: 'page_settings', label: 'Guide me to Settings' }, { kind: 'guide' as const, id: 'page_reports', label: 'Guide me to Reports' }];
  assert.deepEqual(liveLinks(ctxFor('owner'), stored).map(l => l.link.id), ['page_settings', 'page_reports']);
  assert.deepEqual(liveLinks(ctxFor('cashier'), stored).map(l => l.link.id), ['page_reports']);
  assert.deepEqual(liveLinks(ctxFor('cashier', { screens: [] }), stored), []);
});

test('a guide button and a link to the same screen are two buttons, and a stored guide button is read back', () => {
  const both = liveLinks(ctxFor('cashier'), [{ kind: 'screen', id: 'page_reports', label: 'Open Reports' }, { kind: 'guide', id: 'page_reports', label: 'Guide me to Reports' }]);
  assert.deepEqual(both.map(b => b.link.kind), ['screen', 'guide']);
  assert.deepEqual(readLinks([{ kind: 'guide', id: 'page_reports', label: 'Guide me to Reports' }, { kind: 'wrong', id: 'x', label: 'y' }]), [{ kind: 'guide', id: 'page_reports', label: 'Guide me to Reports' }]);
});

test('the tool cannot write, and the prompt tells the model about it without naming anything', () => {
  const t = ASSISTANT_TOOLS.find(x => x.def.function.name === 'show_guide')!; assert.ok(t);
  assert.equal((t.def.function.parameters as any).type, 'object'); assert.deepEqual((t.def.function.parameters as any).required, ['screen']);
  assert.equal(t.run.length <= 2, true);
  const p = buildSystemPrompt('short', true);
  assert.match(p, /show_guide/); assert.match(p, /can_guide/); assert.match(p, /never write a link, an id or a page id/);
  for (const e of screens) assert.ok(!p.includes(e.id), `the prompt names ${e.id}`);
  assert.ok(!/[\u2013\u2014]/.test(p + t.def.function.description));
});
