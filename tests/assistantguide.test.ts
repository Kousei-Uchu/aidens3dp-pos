// Location: tests/assistantguide.test.ts
// "Guide me there" (patch 0162): the rules for what the pointer shows, the one active guide, the walks built from the app graph, and the show_guide tool.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DONE_SHOW_MS, GUIDE_MAX_MS, LOST_LINE, atTarget, currentGuide, doneLine, guideVersion, guideView, pressedLast, progressLabel, startGuide, stopGuide, subscribeGuide, type Guide } from '../src/lib/assistantGuide';
import { buildScreenIndex, type GuideGap, type ScreenEntry } from '../src/lib/assistantScreens';
import { ASSISTANT_TOOLS, liveLinks, resolveLink, runToolCall, searchScreenList, type ToolContext } from '../src/lib/assistantTools';
import { ALL_PRODUCTS_SCREEN, itemGuide, placeForWords, placeGuide } from '../src/lib/assistantGridGuide';
import { readLinks, buildSystemPrompt } from '../src/lib/assistantChat';
import { isKnownSpot } from '../src/lib/trainingSpots';
import { PAGE_ROLES } from '../src/lib/helpDocs';
import type { CatalogueView } from '../src/lib/assistantProducts';
import type { Grid } from '../src/lib/grid';
import type { Variant } from '../src/lib/types';

const screens = buildScreenIndex();
const byId = (id: string): ScreenEntry => screens.find(e => e.id === id)!;
const ctxFor = (role: string, over: Partial<ToolContext> = {}): ToolContext => ({ pages: [], screens, role, maxChars: 6000, ...over });
const call = (name: string, args: unknown) => ({ id: 'c1', type: 'function' as const, function: { name, arguments: JSON.stringify(args) } });
const run = (name: string, args: unknown, role = 'cashier') => runToolCall(call(name, args), { tools: ASSISTANT_TOOLS, ctx: ctxFor(role) });
const runWith = (ctx: ToolContext, name: string, args: unknown) => runToolCall(call(name, args), { tools: ASSISTANT_TOOLS, ctx });
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

// ---------- guides to an item on the Quick Menu grid (B1) ----------
const V = (id: string, productId: string, productTitle: string, variantTitle = '', over: Partial<Variant> = {}): Variant => ({ id, productId, productTitle, variantTitle, priceCents: 500, tracked: false, stock: null, tags: [], active: true, ...over });
const cat: CatalogueView = {
  now: 0,
  variants: {
    'v-flat': V('v-flat', 'p-flat', 'Flat white'),
    'v-latte': V('v-latte', 'p-latte', 'Latte'),
    'v-tadling': V('v-tadling', 'p-tadling', 'Tadlings', 'Small', { sku: 'TAD-S', barcode: '9312345678901' }),
    'v-mug': V('v-mug', 'p-mug', 'Mug', '', { sku: 'MUG-1' }),
    'v-ghost': V('v-ghost', 'p-ghost', 'Retired mug', '', { active: false }),
  },
  collections: [
    { id: 'c-drinks', title: 'Drinks', productIds: ['p-flat', 'p-latte'] },
    { id: 'c-hot', title: 'Hot drinks', productIds: ['p-flat'] },
    { id: 'c-counter', title: 'Counter specials', productIds: ['p-tadling'] },
    { id: 'c-treats', title: 'Treats', productIds: [] },
  ],
  autos: [],
  bundles: null,
};
const layout: Grid = {
  version: 1,
  pages: [
    { id: 'page-home', name: 'Home', tiles: [
      { type: 'category', collectionId: 'c-drinks', label: 'Drinks', subs: [{ type: 'category', collectionId: 'c-hot', label: 'Hot drinks' }] },
      { type: 'group', name: 'Front counter', tiles: [], collectionId: 'c-counter' },
    ] },
    { id: 'page-extras', name: 'Extras', tiles: [{ type: 'item', productId: 'p-mug' }, { type: 'category', collectionId: 'c-treats', label: 'Treats', subs: [{ type: 'item', variantId: 'v-tadling' }] }] },
  ],
};
const gridCtx = (over: Partial<ToolContext> = {}): ToolContext => ctxFor('cashier', { grid: layout, catalogue: cat, ...over });

test('an item in the grid is walked to: the Quick Menu, each container on the way, then the tile itself (B1)', () => {
  // Flat white is in Drinks, which shows it only inside Hot drinks (the same fill rule the grid uses), so the walk opens both.
  const flat = placeForWords(layout, cat, 'flat white')!;
  assert.ok(flat); assert.equal(flat.key, 'p-flat'); assert.equal(flat.name, 'Flat white');
  assert.deepEqual(flat.containers.map(x => x.collectionId), ['c-drinks', 'c-hot']);
  assert.deepEqual(placeGuide(flat, 2).steps.map(s => s.spot), ['find.tab:quick', 'grid.page:page-home', 'grid.cat:c-drinks', 'grid.cat:c-hot', 'grid.item:p-flat']);
  // Latte shows in the Drinks view itself, so the walk stops at Drinks: it never opens Hot drinks for it.
  const latte = placeForWords(layout, cat, 'latte')!;
  assert.equal(latte.key, 'p-latte'); assert.equal(latte.page.id, 'page-home'); assert.deepEqual(latte.containers.map(x => x.collectionId), ['c-drinks']);
  assert.deepEqual(placeGuide(latte, 2).steps.map(s => s.spot), ['find.tab:quick', 'grid.page:page-home', 'grid.cat:c-drinks', 'grid.item:p-latte']);
  assert.deepEqual(placeGuide(latte, 1).steps.map(s => s.spot), ['find.tab:quick', 'grid.cat:c-drinks', 'grid.item:p-latte'], 'one page means no page chip');
  // An item pinned straight on a page is one tap from the Quick Menu.
  const pinned: Grid = { version: 1, pages: [{ id: 'page-only', name: 'Only', tiles: [{ type: 'item', productId: 'p-mug' }] }] };
  assert.equal(placeForWords(pinned, cat, 'mug')?.key, 'p-mug');
  assert.deepEqual(placeGuide(placeForWords(pinned, cat, 'mug')!, 1).steps.map(s => s.spot), ['find.tab:quick', 'grid.item:p-mug'], 'a product pinned on a page is one tap from the Quick Menu');
  // The words look in the variation name, the SKU and the barcode too, not only the product name.
  assert.equal(placeForWords(layout, cat, 'small tadling')?.name, 'Tadlings - Small', 'a tile can pin one variation inside a category');
  assert.equal(placeForWords(layout, cat, 'tad-s')?.key, 'v-tadling', 'the SKU matches');
  assert.equal(placeForWords(layout, cat, '9312345678901')?.key, 'v-tadling', 'the barcode matches');
});

test('an item only inside a display group has no walk, and the guide falls back to All products (B1)', () => {
  // The Counter specials group holds the Tadlings, but a group tile carries no spot, so nothing behind one can be walked to.
  // This grid has that group and nothing else holding them.
  const onlyGroup: Grid = { version: 1, pages: [{ id: 'page-g', name: 'G', tiles: [{ type: 'group', name: 'Front counter', tiles: [], collectionId: 'c-counter' }] }] };
  assert.equal(placeForWords(onlyGroup, cat, 'tadlings'), null, 'the only place they would show is a group');
  assert.equal(placeForWords(layout, cat, 'retired mug'), null, 'the grid never shows a draft or archived item, and those words match no other item');
  assert.equal(placeForWords(layout, cat, 'no such thing'), null);
  assert.equal(placeForWords(undefined, cat, 'flat white'), null, 'no grid given');
  assert.equal(placeForWords(layout, undefined, 'flat white'), null, 'no catalogue given');
  // A saved button for an item that is not in the grid at all is the All products walk, the same as when it was first asked for.
  const back = resolveLink(gridCtx(), 'guide', 'grid.item:p-ghost')!;
  assert.equal(back.link.id, ALL_PRODUCTS_SCREEN); assert.equal(back.link.label, 'Guide me to All products');
  if (back.action.to === 'guide') assert.deepEqual(back.action.guide.steps.map(s => s.spot), ['find.tab:all']);
  assert.equal(resolveLink(ctxFor('cashier'), 'guide', 'grid.item:p-flat')!.link.id, ALL_PRODUCTS_SCREEN, 'a context with no grid at all: the item cannot be placed, so the fallback is used');
});

test('a guide button for an item is worked out again from the grid when it is drawn (B1)', () => {
  const stored = [{ kind: 'guide' as const, id: 'grid.item:p-flat', label: 'Guide me to Flat white' }];
  const now = liveLinks(gridCtx(), stored);
  assert.deepEqual(now.map(l => l.link.id), ['grid.item:p-flat']);
  assert.equal(now[0].action.to, 'guide');
  if (now[0].action.to === 'guide') assert.deepEqual(now[0].action.guide.steps.map(s => s.spot), ['find.tab:quick', 'grid.page:page-home', 'grid.cat:c-drinks', 'grid.cat:c-hot', 'grid.item:p-flat']);
  // The grid gone (a sync, a person still on practice data) means the saved item button falls back to All products, which needs no grid.
  assert.deepEqual(liveLinks(ctxFor('cashier', { grid: undefined }), stored).map(l => l.link.id), [ALL_PRODUCTS_SCREEN], 'with no grid the item falls back to All products');
});

test('show_guide: an item makes a "Guide me" button, and the reply the model reads never names it (B1)', () => {
  const r = runWith(gridCtx(), 'show_guide', { item: 'flat white' });
  assert.equal(r.record.ok, true);
  assert.deepEqual(r.link, { kind: 'guide', id: 'grid.item:p-flat', label: 'Guide me to Flat white' });
  const note = r.message.content ?? '';
  assert.ok(!note.includes('Flat white'), `the note named the item: ${note}`);
  assert.ok(/All products/.test(note), 'the note says where it falls back to');
  // The screen argument still works, and neither argument on its own is required by the tool.
  assert.equal(runWith(gridCtx(), 'show_guide', { screen: 'page_reports' }).record.ok, true);
  assert.equal(runWith(gridCtx(), 'show_guide', {}).record.ok, false);
  assert.equal(runWith(gridCtx(), 'show_guide', { item: 'no such item' }).record.ok, true, 'an item with no place in the grid still gets the All products guide');
  assert.equal(runWith(gridCtx(), 'show_guide', { item: 'no such item' }).link?.id, ALL_PRODUCTS_SCREEN);
});

test('a guide button and a link to the same screen are two buttons, and a stored guide button is read back', () => {
  const both = liveLinks(ctxFor('cashier'), [{ kind: 'screen', id: 'page_reports', label: 'Open Reports' }, { kind: 'guide', id: 'page_reports', label: 'Guide me to Reports' }]);
  assert.deepEqual(both.map(b => b.link.kind), ['screen', 'guide']);
  assert.deepEqual(readLinks([{ kind: 'guide', id: 'page_reports', label: 'Guide me to Reports' }, { kind: 'wrong', id: 'x', label: 'y' }]), [{ kind: 'guide', id: 'page_reports', label: 'Guide me to Reports' }]);
});

test('the tool cannot write, and the prompt tells the model about it without naming anything', () => {
  const t = ASSISTANT_TOOLS.find(x => x.def.function.name === 'show_guide')!; assert.ok(t);
  assert.equal((t.def.function.parameters as any).type, 'object');
  const props = (t.def.function.parameters as any).properties; assert.ok(props.screen && props.item); assert.equal((t.def.function.parameters as any).required, undefined, 'neither argument is required on its own: screen for a screen, item for an item');
  assert.equal(t.run.length <= 2, true);
  const p = buildSystemPrompt('short', true);
  assert.match(p, /show_guide/); assert.match(p, /can_guide/); assert.match(p, /never write a link, an id or a page id/);
  for (const e of screens) assert.ok(!p.includes(e.id), `the prompt names ${e.id}`);
  assert.ok(!/[\u2013\u2014]/.test(p + t.def.function.description));
});
