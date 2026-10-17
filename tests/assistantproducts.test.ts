// Location: tests/assistantproducts.test.ts
// The assistant's product and stock tools (patch 0164, patch 6 in the plan): the queries, the words they use for stock (the till's own),
// the field maps through the data gate, the read-only rule, and the model-free lookup in the offline mode (plan 3.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyGate, resolvePolicy } from '../src/lib/assistantGate';
import { ASSISTANT_TOOLS, makeToolSet, runToolCall, toolDefs } from '../src/lib/assistantTools';
import { DATA_TOOLS, PRODUCTS_MAP, STOCK_MAP } from '../src/lib/assistantDataTools';
import { findProducts, offlineProductSearch, offlineProductTerms, stockLevels, type CatalogueView } from '../src/lib/assistantProducts';
import { hasOfflineHits, offlineExchange, offlineSearch } from '../src/lib/assistantOffline';
import { buildOfflineEvent } from '../src/lib/assistantLog';
import { stockText } from '../src/lib/lookup';
import type { AssistantData } from '../src/lib/assistantData';
import type { AutoDiscount, Variant } from '../src/lib/types';

const NOW = new Date(2026, 9, 18, 15, 0).getTime();
const v = (id: string, productId: string, productTitle: string, variantTitle: string, stock: number | null, over: Partial<Variant> = {}): Variant =>
  ({ id, productId, productTitle, variantTitle, priceCents: 1200, tracked: stock !== null, stock, tags: [], active: true, status: 'ACTIVE', ...over });
const VARIANTS: Variant[] = [
  v('v1', 'p1', 'Highland Cow', 'Red', 5, { sku: 'HC-RED', barcode: '9300000000011', costCents: 400, compareAtCents: 1500, tags: ['dragon-bin', 'cute'] }),
  v('v2', 'p1', 'Highland Cow', 'Blue', 0, { sku: 'HC-BLU', barcode: '9300000000028', costCents: 400 }),
  v('v3', 'p1', 'Highland Cow', 'Green', -1, { sku: 'HC-GRN', costCents: 400, priceCents: 1400 }),
  v('v4', 'p2', 'Tadling', '', null, { priceCents: 300, sku: 'TAD', barcode: '9300000000035', costCents: 100 }),
  v('v5', 'p3', 'Plain Mug', '', 2, { priceCents: 2000, costCents: 900 }),
  v('v6', 'p4', 'Prototype Dragon', '', 1, { active: false, status: 'DRAFT', priceCents: 9900 }),
  v('v7', 'p5', 'Rose Dragon', 'Small', 8, { priceCents: 3000 }),
  v('v8', 'p5', 'Rose Dragon', 'Large', 3, { priceCents: 5000 }),
  v('v9', 'p6', 'Unlisted Wyvern', '', 4, { status: 'UNLISTED' }),
];
const AUTOS: AutoDiscount[] = [{ id: 'a1', title: 'Cow week', kind: 'basic', pct: 10, target: { productIds: ['p1'] } }];
const view = (over: Partial<CatalogueView> = {}): CatalogueView => ({
  now: NOW, variants: Object.fromEntries(VARIANTS.map(x => [x.id, x])), collections: [{ id: 'c1', title: 'Dragons', productIds: ['p5', 'p4'] }, { id: 'c2', title: 'Mugs and cups', productIds: ['p3'] }],
  autos: AUTOS, bundles: null, ...over,
});
type Row = Record<string, any>;
const prods = (r: Record<string, unknown>): Row[] => r.products as Row[];

// ---------- find_products ----------
test('find_products: a name finds the product, with its price, a stock total in the till\'s own words, and a row for each variation', () => {
  const r = findProducts(view(), { query: 'highland cows' }); // plural: the search drops a trailing s
  assert.equal(r.found, 1); const p = prods(r)[0];
  assert.equal(p.name, 'Highland Cow'); assert.equal(p.price, '$12.00 to $14.00'); assert.equal(p.total_stock, '5 in stock', 'out of stock and oversold add nothing to the total');
  assert.deepEqual(p.variants, [{ name: 'Red', price: '$12.00', stock: '5 in stock' }, { name: 'Blue', price: '$12.00', stock: 'Out of stock' }, { name: 'Green', price: '$14.00', stock: '1 oversold' }]);
  for (const x of VARIANTS) assert.equal((p.variants as Row[]).find(y => y.name === x.variantTitle)?.stock ?? stockText(x.stock), stockText(x.stock));
});
test('find_products: a plain item has its price and stock on the row, and not tracked says so', () => {
  const p = prods(findProducts(view(), { query: 'tadling' }))[0];
  assert.deepEqual(p, { name: 'Tadling', price: '$3.00', stock: 'Not tracked' });
  assert.deepEqual(prods(findProducts(view(), { query: 'mug' }))[0], { name: 'Plain Mug', price: '$20.00', stock: '2 in stock' });
});
test('find_products: every word has to match, and a variation, a SKU or a barcode finds its product', () => {
  assert.equal(findProducts(view(), { query: 'cow red' }).found, 1); assert.equal(findProducts(view(), { query: 'cow purple' }).found, 0);
  assert.deepEqual(prods(findProducts(view(), { query: 'HC-BLU' }))[0], { name: 'Highland Cow - Blue', price: '$12.00', stock: 'Out of stock' }, 'one matching variation of a product is named in full'); assert.equal(prods(findProducts(view(), { query: '9300000000035' }))[0].name, 'Tadling');
  assert.match(String(findProducts(view(), { query: 'zzz' }).note), /No product matched/);
});
test('find_products: active and unlisted by default, as the till shows them, and a status word asks for the rest', () => {
  assert.equal(findProducts(view(), { query: 'prototype' }).found, 0);
  assert.equal(findProducts(view(), { query: 'wyvern' }).found, 1); assert.equal(prods(findProducts(view(), { query: 'wyvern' }))[0].status, 'unlisted');
  const d = prods(findProducts(view(), { query: 'prototype', status: 'draft' }))[0]; assert.equal(d.status, 'draft'); assert.equal(d.price, '$99.00');
  assert.equal(findProducts(view(), { query: 'dragon', status: 'all' }).found, 2); assert.equal(findProducts(view(), { query: 'dragon' }).found, 1);
  assert.deepEqual(findProducts(view(), { query: 'x', status: 'deleted' }), { error: 'Unknown status. Use one of: active, draft, archived, all.' });
  assert.match(String(findProducts(view(), { query: 'cow' }).note), /Only active and unlisted products/);
});
test('find_products: a category lists its products, and a word of its name is enough', () => {
  assert.deepEqual(prods(findProducts(view(), { category: 'dragons' })).map(p => p.name), ['Rose Dragon']); // the draft one is in the category but not for sale
  assert.deepEqual(prods(findProducts(view(), { category: 'mugs' })).map(p => p.name), ['Plain Mug']);
  assert.deepEqual(prods(findProducts(view(), { category: 'dragons', query: 'rose large' })).map(p => p.name), ['Rose Dragon - Large']);
  assert.equal(findProducts(view(), { category: 'dragons', query: 'cow' }).found, 0, 'a product outside the category is not found');
});
test('find_products: an unknown category says so and names the real ones, and with nothing to look for it is an error', () => {
  const r = findProducts(view(), { category: 'sparkles' }); assert.equal(r.found, 0); assert.match(String(r.note), /No category matched\. The categories are: Dragons, Mugs and cups/);
  assert.match(String(findProducts(view({ collections: [] }), { category: 'x' }).note), /no categories are saved/);
  assert.match(String(findProducts(view(), {}).error), /Give a product name/); assert.match(String(findProducts(view(), { query: '  ' }).error), /Give a product name/);
});
test('find_products: the summary leaves out SKU, barcode, cost and deals, and detail adds them', () => {
  const plain = JSON.stringify(findProducts(view(), { query: 'cow' })); for (const w of ['HC-RED', '9300000000011', 'cost', 'compare_at', 'Cow week', 'dragon-bin']) assert.doesNotMatch(plain, new RegExp(w), w);
  const d = prods(findProducts(view(), { query: 'cow', detail: true }))[0];
  assert.deepEqual(d.variants[0], { name: 'Red', price: '$12.00', stock: '5 in stock', sku: 'HC-RED', barcode: '9300000000011', compare_at: '$15.00', cost: '$4.00' });
  assert.deepEqual(d.deals, ['Cow week']); assert.deepEqual(d.tags, ['dragon-bin', 'cute']);
  assert.deepEqual(prods(findProducts(view(), { query: 'rose', detail: true }))[0].categories, ['Dragons']);
  const one = prods(findProducts(view(), { query: 'tadling', detail: true }))[0]; assert.equal(one.sku, 'TAD'); assert.equal(one.cost, '$1.00');
});
test('find_products: ten products, or three with detail, and it says how many there were', () => {
  const many = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`m${i}`, v(`m${i}`, `pm${i}`, `Marble ${String(i).padStart(2, '0')}`, '', i)]));
  const r = findProducts(view({ variants: many }), { query: 'marble' }); assert.equal(r.found, 14); assert.equal(prods(r).length, 10); assert.match(String(r.note), /Showing 10 of 14/);
  const d = findProducts(view({ variants: many }), { query: 'marble', detail: true }); assert.equal(prods(d).length, 3); assert.match(String(d.note), /Showing 3 of 14/);
  const big: Record<string, Variant> = {}; for (let i = 0; i < 20; i++) big[`b${i}`] = v(`b${i}`, 'pb', 'Big Set', `Size ${i}`, i);
  const bp = prods(findProducts(view({ variants: big }), { query: 'big set' }))[0]; assert.equal(bp.variants.length, 12); assert.equal(bp.more_variants, 8);
});
test('find_products: when only some variations of a product match, only those are shown and there is no total for the product', () => {
  const pens = Object.fromEntries([['a', 'Red', 3], ['b', 'Blue', 4], ['c', 'Red Glitter', 5]].map(([id, t, n]) => [id, v(String(id), 'pp', 'Pen', String(t), Number(n))]));
  const r = findProducts(view({ variants: pens }), { query: 'pen red' }); const p = prods(r)[0];
  assert.deepEqual(p.variants.map((x: Row) => x.name), ['Red', 'Red Glitter']); assert.equal('total_stock' in p, false); assert.match(String(r.note), /only some variations of a product matched/);
  const all = prods(findProducts(view({ variants: pens }), { query: 'pen' }))[0]; assert.equal(all.total_stock, '12 in stock'); assert.doesNotMatch(String(findProducts(view({ variants: pens }), { query: 'pen' }).note), /only some variations/);
});

// ---------- stock_levels ----------
test('stock_levels: low is the Inventory list\'s own low, so it includes out of stock, and the counts cover everything asked about', () => {
  const r = stockLevels(view(), {}) as Row;
  assert.equal(r.filter, 'low'); assert.deepEqual(r.items.map((i: Row) => i.name), ['Highland Cow - Blue', 'Plain Mug'], 'oversold is not low, and a draft product is not counted');
  assert.equal(r.matching, 2);
  assert.deepEqual([r.variations, r.tracked, r.not_tracked, r.out_of_stock, r.low, r.oversold, r.units_in_stock], [8, 7, 1, 1, 2, 1, 5 + 2 + 8 + 3 + 4]);
  assert.match(String(r.note), /Low means 2 or fewer, which includes out of stock/);
});
test('stock_levels: out of stock, oversold, not tracked and tracked, lowest first with not tracked last', () => {
  assert.deepEqual((stockLevels(view(), { filter: 'out' }) as Row).items, [{ name: 'Highland Cow - Blue', stock: 'Out of stock' }]);
  assert.deepEqual((stockLevels(view(), { filter: 'oversold' }) as Row).items, [{ name: 'Highland Cow - Green', stock: '1 oversold' }]);
  assert.deepEqual((stockLevels(view(), { filter: 'untracked' }) as Row).items, [{ name: 'Tadling', stock: 'Not tracked' }]);
  const t = (stockLevels(view(), { filter: 'tracked' }) as Row).items.map((i: Row) => i.name); assert.equal(t[0], 'Highland Cow - Green'); assert.equal(t.length, 7); assert.ok(!t.includes('Tadling'));
});
test('stock_levels: a category or words narrow the counts as well as the list, and a draft product counts only when asked for', () => {
  const c = stockLevels(view(), { filter: 'tracked', category: 'dragons' }) as Row; assert.deepEqual(c.items.map((i: Row) => i.name), ['Rose Dragon - Large', 'Rose Dragon - Small']); assert.equal(c.units_in_stock, 11); assert.equal(c.variations, 2);
  const w = stockLevels(view(), { filter: 'tracked', query: 'cow' }) as Row; assert.equal(w.variations, 3); assert.equal(w.oversold, 1);
  assert.equal((stockLevels(view(), { filter: 'tracked', category: 'dragons', status: 'all' }) as Row).variations, 3);
  const none = stockLevels(view(), { category: 'sparkles' }) as Row; assert.equal(none.variations, 0); assert.match(String(none.note), /No category matched/);
});
test('stock_levels: nothing matching says so, ten rows at most, and a bad word is an error the model can read', () => {
  assert.match(String((stockLevels(view(), { filter: 'oversold', category: 'mugs' }) as Row).note), /Nothing matched that filter/);
  const many = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`m${i}`, v(`m${i}`, `pm${i}`, `Marble ${i}`, '', 1)]));
  const r = stockLevels(view({ variants: many }), {}) as Row; assert.equal(r.matching, 14); assert.equal(r.items.length, 10); assert.match(String(r.note), /Showing the lowest 10 of 14/);
  assert.deepEqual(stockLevels(view(), { filter: 'half' }), { error: 'Unknown filter. Use one of: low, out, oversold, untracked, tracked.' });
});

// ---------- through the tools and the gate ----------
const LOCAL = resolvePolicy('local'); const REMOTE = resolvePolicy('remote');
const data = (): AssistantData => ({ ...view(), sales: [], rollups: [], customers: [], presets: [] });
const call = (name: string, args: unknown) => ({ id: 'c1', type: 'function' as const, function: { name, arguments: JSON.stringify(args) } });
const runTool = (name: string, args: unknown, policy = LOCAL, d: AssistantData | null = data()) => runToolCall(call(name, args), { tools: ASSISTANT_TOOLS, ctx: { pages: [], role: 'cashier', maxChars: 6000, policy, ...(d ? { data: d } : {}) } });
const out = (r: ReturnType<typeof runTool>) => r.message.content ?? '';

test('both product tools declare a field map, and realistic results have no field the map does not name', () => {
  for (const [name, args, map] of [['find_products', { query: 'cow', detail: true }, PRODUCTS_MAP], ['find_products', { query: 'rose' }, PRODUCTS_MAP], ['find_products', { query: 'tadling', detail: true }, PRODUCTS_MAP], ['stock_levels', {}, STOCK_MAP], ['stock_levels', { filter: 'tracked', category: 'dragons' }, STOCK_MAP]] as const) {
    const t = DATA_TOOLS.find(x => x.def.function.name === name)!; assert.equal(t.gate, map);
    const g = applyGate(t.run(args as any, { pages: [], role: 'owner', maxChars: 6000, data: data() }), t.gate, LOCAL); assert.deepEqual(g.unknown, [], `${name} returned fields the gate does not know: ${g.unknown.join(', ')}`);
  }
});
test('product and stock data is shop data: it reaches the model on a remote endpoint, with the cost price taken out only where cost may not be sent', () => {
  const lo = out(runTool('find_products', { query: 'cow', detail: true }, LOCAL)); assert.match(lo, /HC-RED/); assert.match(lo, /\$4\.00/);
  const re = out(runTool('find_products', { query: 'cow', detail: true }, REMOTE)); assert.match(re, /HC-RED/); assert.match(re, /\$4\.00/, 'cost is allowed on a remote endpoint, as in the plan table');
  const no = out(runTool('find_products', { query: 'cow', detail: true }, resolvePolicy('remote', { cost: 'never' }))); assert.doesNotMatch(no, /\$4\.00|"cost"/); assert.match(no, /HC-RED/); assert.match(no, /costs and profit/); assert.match(no, /privacy_note/);
  assert.match(out(runTool('stock_levels', {}, REMOTE)), /Highland Cow - Blue/);
});
test('switching shop data off leaves the model nothing about products or stock, only the note', () => {
  const p = resolvePolicy('local', { shop: 'never' });
  for (const [n, a] of [['find_products', { query: 'cow' }], ['stock_levels', {}]] as const) { const t = out(runTool(n, a, p)); assert.doesNotMatch(t, /Highland|Tadling|\$12\.00|in stock/i, n); assert.match(t, /shop data/, n); }
});
test('with no policy the strictest rules apply, with no snapshot the tools say there is no shop data, and a bad argument is an error', () => {
  const r = runToolCall(call('find_products', { query: 'cow' }), { tools: ASSISTANT_TOOLS, ctx: { pages: [], role: 'cashier', maxChars: 6000, data: data() } }); assert.match(out(r), /Highland Cow/);
  for (const n of ['find_products', 'stock_levels']) { const t = out(runTool(n, { query: 'cow' }, LOCAL, null)); assert.match(t, /No shop data is available/, n); }
  const bad = runTool('stock_levels', { filter: 'half' }); assert.equal(bad.record.ok, false); assert.match(out(bad), /Unknown filter/);
  assert.equal(runTool('find_products', {}).record.ok, false);
});
test('the product tools are read only: the snapshot is not changed, and they are handed nothing that writes', () => {
  const d = data(); const frozen = JSON.stringify(d);
  const deep = (o: any): any => { if (o && typeof o === 'object') { Object.values(o).forEach(deep); Object.freeze(o); } return o; }; deep(d);
  findProducts(d, { query: 'cow', detail: true, category: 'dragons' }); stockLevels(d, { filter: 'low' }); offlineProductSearch(d, 'any red cows low on stock');
  runTool('find_products', { query: 'cow' }, LOCAL, d); runTool('stock_levels', {}, LOCAL, d);
  assert.equal(JSON.stringify(d), frozen);
  const src = readFileSync('src/lib/assistantProducts.ts', 'utf8'); assert.doesNotMatch(src, /useApp|setState|fetch\(|kvSet|writeFile|from '\.\.\/state/);
});

test('results fit the size limit and stay valid JSON, even with a big catalogue', () => {
  const many = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`m${i}`, v(`m${i}`, `pm${i}`, `Marble ${i} with a rather long product name`, `Colour ${i}`, i % 5, { sku: `SKU-${i}`, barcode: `93000000${i}` })]));
  const set = makeToolSet({ pages: [], role: 'cashier', contextSize: 2000, data: { ...data(), variants: many }, policy: LOCAL });
  for (const [n, a] of [['find_products', { query: 'marble', detail: true }], ['stock_levels', { filter: 'tracked' }]] as const) {
    const r = runToolCall(call(n, a), set); assert.ok((r.message.content ?? '').length <= set.ctx.maxChars, n); JSON.parse(r.message.content ?? '');
  }
});
test('the product tool definitions are short, take only plain arguments, carry no dashes, and are offered ahead of the sales tools', () => {
  const defs = toolDefs(DATA_TOOLS).filter(d => ['find_products', 'stock_levels'].includes(d.function.name)); assert.equal(defs.length, 2);
  for (const d of defs) { assert.ok(d.function.description.length > 40 && d.function.description.length < 520, d.function.name); assert.equal((d.function.parameters as any).additionalProperties, false); assert.doesNotMatch(JSON.stringify(d), /[\u2013\u2014]/); }
  assert.deepEqual((defs[1].function.parameters as any).properties.filter.enum, ['low', 'out', 'oversold', 'untracked', 'tracked']);
  assert.deepEqual(DATA_TOOLS.slice(0, 2).map(t => t.def.function.name), ['find_products', 'stock_levels']);
});

// ---------- the offline mode ----------
test('offline: a typed question is reduced to the words that could be in a product name, and a stock phrase picks a stock list', () => {
  assert.deepEqual(offlineProductTerms('how many red highland cows do we have in stock?'), { terms: ['red', 'highland', 'cow'], stock: null });
  assert.deepEqual(offlineProductTerms('whats the price of the plain mug'), { terms: ['plain', 'mug'], stock: null });
  assert.deepEqual(offlineProductTerms('what is low on stock'), { terms: [], stock: 'low' }); assert.deepEqual(offlineProductTerms('what are we out of stock on').stock, 'out'); assert.equal(offlineProductTerms('anything oversold').stock, 'oversold');
  assert.deepEqual(offlineProductTerms('how do I refund a card'), { terms: ['refund', 'card'], stock: null });
});
test('offline: products come with price and stock from the same words the tools use, best matches first, active products only', () => {
  const r = offlineProductSearch(view(), 'do we have any red highland cows');
  assert.deepEqual(r.products.map(p => p.name), ['Highland Cow']); assert.equal(r.products[0].price, '$12.00 to $14.00'); assert.equal(r.products[0].stock, '5 in stock');
  assert.deepEqual(r.products[0].variants, [{ name: 'Red', stock: '5 in stock' }, { name: 'Blue', stock: 'Out of stock' }, { name: 'Green', stock: '1 oversold' }]);
  assert.deepEqual(offlineProductSearch(view(), 'plain mug price').products, [{ name: 'Plain Mug', price: '$20.00', stock: '2 in stock', variants: [] }]);
  assert.deepEqual(offlineProductSearch(view(), 'prototype dragon').products.map(p => p.name), [], 'a draft product is not for sale');
  assert.deepEqual(offlineProductSearch(view(), '9300000000035').products.map(p => p.name), ['Tadling'], 'a scanned barcode typed in finds its item');
  const three = offlineProductSearch(view(), 'a green dragon cow thing').products.map(p => p.name); assert.ok(three.includes('Highland Cow'), 'with three or more words, half is enough');
  assert.deepEqual(offlineProductSearch(view(), 'zzz qqq').products, []);
});
test('offline: low, out of stock and oversold lists, lowest first, ten at most', () => {
  assert.deepEqual(offlineProductSearch(view(), "what's running low").stock, { title: 'Low on stock (2 or fewer)', rows: [{ name: 'Highland Cow - Blue', stock: 'Out of stock' }, { name: 'Plain Mug', stock: '2 in stock' }], more: 0 });
  assert.deepEqual(offlineProductSearch(view(), 'what is out of stock').stock?.rows, [{ name: 'Highland Cow - Blue', stock: 'Out of stock' }]);
  assert.equal(offlineProductSearch(view(), 'anything oversold').stock?.title, 'Oversold');
  const many = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`m${i}`, v(`m${i}`, `pm${i}`, `Marble ${i}`, '', 1)]));
  const s = offlineProductSearch(view({ variants: many }), 'low stock').stock!; assert.equal(s.rows.length, 10); assert.equal(s.more, 4);
  assert.equal(offlineProductSearch(view(), 'cow').stock, null);
});
const OFFLINE = { pages: [], screens: [], role: 'cashier' };
test('offline search: products are only looked up when a catalogue is given, and the old result is unchanged without one', () => {
  assert.deepEqual(offlineSearch(OFFLINE, 'highland cow'), { screens: [], pages: [] });
  const h = offlineSearch({ ...OFFLINE, catalogue: view() }, 'highland cow'); assert.deepEqual(h.products?.map(p => p.name), ['Highland Cow']); assert.equal(h.stock, null); assert.ok(hasOfflineHits(h));
  assert.deepEqual(offlineSearch({ ...OFFLINE, catalogue: null }, 'highland cow'), { screens: [], pages: [] }, 'practice data gives no catalogue, so no products');
  assert.deepEqual(offlineSearch({ ...OFFLINE, catalogue: view() }, ''), { screens: [], pages: [], products: [], stock: null });
  assert.equal(hasOfflineHits({ screens: [], pages: [], products: [], stock: null }), false); assert.equal(hasOfflineHits({ screens: [], pages: [], stock: { title: 'x', rows: [], more: 0 } }), true);
});
test('offline: the question stays scrubbed, the card number is not searched for, and the exchange carries the products found', () => {
  const ex = offlineExchange({ text: 'cow stock 4111 1111 1111 1111', ctx: { ...OFFLINE, catalogue: view() }, id: (() => { let n = 0; return () => `e${++n}`; })(), now: () => 1 });
  assert.doesNotMatch(ex.user.text, /4111/); assert.deepEqual(ex.hits.products?.map(p => p.name), ['Highland Cow']);
});
test('the offline log line can carry the names of the products found, and leaves the field out when there are none', () => {
  const base = { id: 'l1', now: 1, staff: { id: 's', name: 'S', role: 'cashier' as const }, user: { id: 'u1', role: 'user' as const, text: 'cow', at: 1 }, cause: 'unreachable', screens: [], pages: [] };
  assert.deepEqual(buildOfflineEvent({ ...base, products: ['Highland Cow'] }).offline, { cause: 'unreachable', screens: [], pages: [], products: ['Highland Cow'] });
  assert.deepEqual(buildOfflineEvent({ ...base, products: [] }).offline, { cause: 'unreachable', screens: [], pages: [] });
  assert.deepEqual(buildOfflineEvent(base).offline, { cause: 'unreachable', screens: [], pages: [] });
});
