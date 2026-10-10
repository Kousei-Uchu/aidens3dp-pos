// Local pricing engine (instant totals). Order of application:
//   1. bundle deals (in-app config)      – consume units, block manual line discount on those lines
//   2. Shopify automatic discounts       – several can apply to one order; each unit takes at most one; the combination
//                                          with the biggest total saving wins (Shopify's own combination rules are not read)
//   3. manual line discount              – % or $ off the line's remaining value
//   4. cart discount                     – % or $ spread over remaining value of discountable lines (lines with an active
//                                          line price adjustment are left out: their price is already fixed)
//   5. line price adjustment (A16.1)     – sets the final price of the whole line; stored as the difference. Only ever lowers.
//   6. whole order adjustment (A16.4)    – sets the total of the cart; the difference is shared over the lines by value (gift
//                                          cards are never reduced). Only ever lowers.
// Items excluded from discounts: gift cards, tag "no-discount", lines flagged noDiscount.
import { allocate, pctOf } from './money';
import { matchBundles } from './bundles';
import type {
  AppliedBundle, AppliedDiscount, AutoDiscount, BundleConfig, Cart, CartLine, PricedCart, PricedLine, Target, Variant,
} from './types';

export type PricingContext = {
  variants: Record<string, Variant>;
  collectionsOfProduct: Record<string, string[]>;
  autoDiscounts: AutoDiscount[];
  bundles: BundleConfig | null;
  now?: number;
  /** "Amount off when you buy N" discounts work as lots (N units per application, repeating). Default true. */
  lotDiscounts?: boolean;
};

export const NO_DISCOUNT_TAG = 'no-discount';
/** Label of the discount row a line price adjustment produces (cart, receipts, reports). */
export const ADJUST_LABEL = 'Line price adjustment';
/** Label of the discount a whole-order adjustment adds to each line it is shared over. */
export const ORDER_ADJUST_LABEL = 'Order price adjustment';

type Work = {
  line: CartLine; base: number; gross: number; discountable: boolean; isItem: boolean;
  productId?: string; collections: string[]; variantId?: string;
  bundleUnits: number; discounts: AppliedDiscount[]; applied: number; fixed: boolean;
};

const remaining = (w: Work) => w.gross - w.applied;

function matches(t: Target | undefined, w: Work): boolean {
  if (!t) return false;
  if (t.all) return true;
  if (w.variantId && t.variantIds?.includes(w.variantId)) return true;
  if (w.productId && t.productIds?.includes(w.productId)) return true;
  return !!t.collectionIds?.some(c => w.collections.includes(c));
}

function activeNow(d: AutoDiscount, now: number) {
  if (d.startsAt && Date.parse(d.startsAt) > now) return false;
  if (d.endsAt && Date.parse(d.endsAt) < now) return false;
  return true;
}

/** State of the automatic-discount search: units already taken by a discount, cents already applied, uses per discount. */
type AutoState = { used: number[]; applied: number[]; uses: Map<string, number> };
/** One application of one automatic discount: cents and units taken per cart line. */
type Move = { d: AutoDiscount; cents: number[]; units: number[]; total: number };

/** A basic "fixed amount off, minimum quantity N" discount is applied per lot of N units (and can repeat). */
const isLot = (d: AutoDiscount, lots: boolean) => lots && d.kind === 'basic' && !!d.minQty && !!d.amtCents && !d.eachItem;

/**
 * Build ONE application of discount `d` against the units still free in `st`, or null if it doesn't apply.
 * - basic, lot type: takes minQty units (dearest first), amount off once for the lot.
 * - basic, other: takes every eligible unit once (same maths as before).
 * - buy X get Y: one buy set + one get set (cheapest units are the ones discounted).
 */
function autoMove(d: AutoDiscount, ws: Work[], st: AutoState, lots: boolean): Move | null {
  const free = (i: number) => Math.max(0, ws[i].line.qty - ws[i].bundleUnits - st.used[i]);
  const room = (i: number) => Math.max(0, ws[i].gross - ws[i].applied - st.applied[i]);
  const cents = ws.map(() => 0), units = ws.map(() => 0);
  const cand = ws.map(w => w.isItem && w.discountable);
  if (d.kind === 'basic') {
    const el = ws.map((w, i) => (cand[i] && matches(d.target, w) ? free(i) : 0));
    const qty = el.reduce((a, b) => a + b, 0);
    if (!qty) return null;
    if (d.minQty && qty < d.minQty) return null;
    if (d.minSubtotalCents && ws.reduce((a, w, i) => a + el[i] * w.base, 0) < d.minSubtotalCents) return null;
    let take = el;
    if (isLot(d, lots)) { // pick the minQty dearest free units
      take = ws.map(() => 0);
      let need = d.minQty!;
      for (const i of ws.map((_, k) => k).sort((x, y) => ws[y].base - ws[x].base)) { const n = Math.min(el[i], need); take[i] = n; need -= n; if (!need) break; }
    }
    const value = ws.reduce((a, w, i) => a + take[i] * w.base, 0);
    if (d.pct) ws.forEach((w, i) => { if (take[i]) cents[i] = Math.min(room(i), pctOf(take[i] * w.base, d.pct!)); });
    else if (d.amtCents) {
      if (d.eachItem) ws.forEach((w, i) => { if (take[i]) cents[i] = Math.min(room(i), take[i] * Math.min(d.amtCents!, w.base)); });
      else allocate(Math.min(d.amtCents, value), ws.map((w, i) => take[i] * w.base)).forEach((p, i) => (cents[i] = Math.min(room(i), p)));
    }
    take.forEach((n, i) => (units[i] = n));
  } else {
    if (!d.buys || !d.gets) return null;
    if (d.usesPerOrderLimit && (st.uses.get(d.id) ?? 0) >= d.usesPerOrderLimit) return null;
    const pool = (t: Target) => {
      const r: { li: number; price: number; k: number }[] = [];
      ws.forEach((w, li) => { if (cand[li] && matches(t, w)) for (let k = 0; k < free(li); k++) r.push({ li, price: w.base, k }); });
      return r;
    };
    const taken = new Set<string>(); const key = (u: { li: number; k: number }) => `${u.li}:${u.k}`;
    const buys: ReturnType<typeof pool> = [];
    const buyPool = pool(d.buys.target).sort((a, b) => b.price - a.price);
    if (d.buys.qty) { for (const u of buyPool) { buys.push(u); if (buys.length === d.buys.qty) break; } if (buys.length < d.buys.qty) return null; }
    else if (d.buys.amountCents) { let sum = 0; for (const u of buyPool) { buys.push(u); sum += u.price; if (sum >= d.buys.amountCents) break; } if (sum < d.buys.amountCents) return null; }
    else return null;
    buys.forEach(u => taken.add(key(u)));
    const gets: ReturnType<typeof pool> = [];
    for (const u of pool(d.gets.target).sort((a, b) => a.price - b.price)) { if (!taken.has(key(u))) { gets.push(u); if (gets.length === d.gets.qty) break; } }
    if (gets.length < d.gets.qty) return null;
    buys.forEach(u => units[u.li]++);
    gets.forEach(u => { units[u.li]++; cents[u.li] += d.gets!.pct ? pctOf(u.price, d.gets!.pct) : Math.min(d.gets!.amtCents ?? 0, u.price); });
    ws.forEach((_, i) => (cents[i] = Math.min(cents[i], room(i))));
  }
  const total = cents.reduce((a, b) => a + b, 0);
  return total > 0 ? { d, cents, units, total } : null;
}

/**
 * Choose which automatic discounts to apply: any number of different discounts, each repeating as often as the cart
 * allows, no unit used twice, biggest total saving wins (ties: fewest applications, so bigger lots beat many small ones).
 * Greedy gives the baseline, then a capped depth-first search looks for something better.
 */
function chooseAutoDiscounts(ws: Work[], active: AutoDiscount[], lots: boolean, maxNodes = 4000): Move[] {
  const fresh = (): AutoState => ({ used: ws.map(() => 0), applied: ws.map(() => 0), uses: new Map() });
  const commit = (st: AutoState, m: Move) => { m.units.forEach((n, i) => (st.used[i] += n)); m.cents.forEach((c, i) => (st.applied[i] += c)); st.uses.set(m.d.id, (st.uses.get(m.d.id) ?? 0) + 1); };
  const undo = (st: AutoState, m: Move) => { m.units.forEach((n, i) => (st.used[i] -= n)); m.cents.forEach((c, i) => (st.applied[i] -= c)); st.uses.set(m.d.id, (st.uses.get(m.d.id) ?? 0) - 1); };

  let best: { total: number; moves: Move[] } = { total: 0, moves: [] };
  { // greedy baseline: always take the single biggest saving available
    const st = fresh(); const moves: Move[] = []; let total = 0;
    for (let guard = 0; guard < 500; guard++) {
      let pick: Move | null = null;
      for (const d of active) { const m = autoMove(d, ws, st, lots); if (m && (!pick || m.total > pick.total)) pick = m; }
      if (!pick) break;
      commit(st, pick); moves.push(pick); total += pick.total;
    }
    best = { total, moves };
  }
  let nodes = 0; const st = fresh(); const path: Move[] = [];
  const dfs = (start: number, total: number) => {
    if (total > best.total || (total === best.total && path.length > 0 && path.length < best.moves.length)) best = { total, moves: [...path] };
    if (++nodes > maxNodes || path.length >= 60) return;
    for (let k = start; k < active.length; k++) {
      const m = autoMove(active[k], ws, st, lots);
      if (!m) continue;
      commit(st, m); path.push(m);
      dfs(k, total + m.total); // k again: the same discount may repeat
      path.pop(); undo(st, m);
      if (nodes > maxNodes) return;
    }
  };
  dfs(0, 0);
  return best.moves;
}

export function priceCart(cart: Cart, ctx: PricingContext): PricedCart {
  const now = ctx.now ?? Date.now();
  const ws: Work[] = cart.lines.map(line => {
    const base = line.kind === 'gift_card' ? line.unitCents : (line.overrideCents ?? line.unitCents); // a gift card is worth what was paid for it
    const v = line.variantId ? ctx.variants[line.variantId] : undefined;
    const tagged = !!v?.tags.some(t => t.toLowerCase() === NO_DISCOUNT_TAG);
    return {
      line, base, gross: base * line.qty,
      discountable: line.kind !== 'gift_card' && !line.noDiscount && !tagged,
      isItem: line.kind === 'item' && !!v,
      productId: v?.productId, variantId: line.variantId,
      collections: v ? ctx.collectionsOfProduct[v.productId] ?? [] : [],
      bundleUnits: 0, discounts: [], applied: 0, fixed: false,
    };
  });
  const add = (w: Work, d: AppliedDiscount) => {
    const c = Math.min(d.cents, remaining(w));
    if (c <= 0) return;
    w.discounts.push({ ...d, cents: c });
    w.applied += c;
  };

  // 1 ── bundles
  const bundleApps: AppliedBundle[] = [];
  if (ctx.bundles) {
    const idx = new Map<string, number>();
    const sources = ws
      .map((w, i) => ({ w, i }))
      .filter(x => x.w.isItem && x.w.discountable)
      .map(({ w, i }) => { idx.set(w.line.id, i); return { key: w.line.id, variantId: w.variantId!, productId: w.productId!, unitCents: w.base, avail: w.line.qty }; });
    const matchesFound = matchBundles(sources, ctx.bundles, undefined, now);
    const agg = new Map<string, { w: Work; label: string; cents: number; units: number; dealId: string }>();
    for (const m of matchesFound) {
      bundleApps.push({
        dealId: m.dealId, label: m.label, discountCents: m.discountCents, status: m.status,
        units: m.picks.map(p => { const w = ws[idx.get(p.sourceKey)!]; return { lineId: w.line.id, variantId: w.variantId!, title: w.line.title, variantTitle: w.line.variantTitle, unitCents: p.unitCents, discountCents: p.discountCents }; }),
      });
    }
    for (const m of matchesFound) for (const p of m.picks) {
      const w = ws[idx.get(p.sourceKey)!];
      w.bundleUnits += 1;
      const k = `${w.line.id}|${m.dealId}`;
      const cur = agg.get(k) ?? { w, label: m.label, cents: 0, units: 0, dealId: m.dealId };
      cur.cents += p.discountCents; cur.units += 1; agg.set(k, cur);
    }
    for (const a of agg.values()) if (a.cents > 0) add(a.w, { type: 'bundle', label: a.label, cents: a.cents, id: a.dealId });
  }

  // 2 ── automatic discounts (several can combine; each unit takes at most one)
  const moves = chooseAutoDiscounts(ws, ctx.autoDiscounts.filter(d => activeNow(d, now)), ctx.lotDiscounts !== false);
  const perLine = new Map<string, { w: Work; d: AutoDiscount; cents: number; times: number }>();
  for (const m of moves) m.cents.forEach((c, i) => {
    if (c <= 0) return;
    const k = `${i}|${m.d.id}`; const cur = perLine.get(k) ?? { w: ws[i], d: m.d, cents: 0, times: 0 };
    cur.cents += c; cur.times += 1; perLine.set(k, cur);
  });
  for (const a of perLine.values()) add(a.w, { type: 'auto', label: a.d.title, cents: a.cents, id: a.d.id, ...(a.times > 1 ? { times: a.times } : {}) });

  // 3 ── manual line discount (blocked on lines that received a bundle discount)
  for (const w of ws) {
    const md = w.line.discount;
    if (!md || !w.discountable || w.discounts.some(d => d.type === 'bundle')) continue;
    const rem = remaining(w);
    const c = md.kind === 'pct' ? pctOf(rem, md.value) : Math.min(md.value, rem);
    add(w, { type: 'manual', label: md.label, cents: c });
  }

  // 3b ── a line price adjustment fixes the line's price, so the cart discount skips it (it is applied last, step 5)
  for (const w of ws) if (w.line.adjust && w.line.kind !== 'gift_card' && w.line.adjust.finalCents < remaining(w)) w.fixed = true;

  // 4 ── cart discount
  const cd = cart.discount;
  if (cd) {
    const pool = ws.map(w => (w.discountable && !w.fixed ? remaining(w) : 0));
    const sum = pool.reduce((a, b) => a + b, 0);
    const total = cd.kind === 'pct' ? pctOf(sum, cd.value) : Math.min(cd.value, sum);
    allocate(total, pool).forEach((c, i) => c > 0 && add(ws[i], { type: 'cart', label: cd.label, cents: c }));
  }

  // 5 ── line price adjustment (A16.1): worked out after everything else, stored as the difference. Never raises a price.
  const adjusted = new Map<string, { finalCents: number; cents: number }>();
  for (const w of ws) {
    const a = w.line.adjust;
    if (!a || w.line.kind === 'gift_card') continue;
    const cents = Math.max(0, remaining(w) - Math.max(0, a.finalCents));
    if (cents > 0) add(w, { type: 'adjust', label: ADJUST_LABEL, cents });
    adjusted.set(w.line.id, { finalCents: Math.max(0, a.finalCents), cents });
  }

  // 6 ── whole order adjustment (A16.4): the cart total becomes finalCents. The difference is shared over every line except
  //      gift cards in proportion to what each still costs. It never raises the total and never goes below the gift cards.
  let orderAdjustment: { finalCents: number; cents: number } | undefined;
  const oa = cart.orderAdjust;
  if (oa) {
    const pool = ws.map(w => (w.line.kind === 'gift_card' ? 0 : remaining(w)));
    const poolSum = pool.reduce((a, b) => a + b, 0);
    const total = ws.reduce((a, w) => a + remaining(w), 0);
    const final = Math.max(0, oa.finalCents);
    const cents = Math.max(0, Math.min(poolSum, total - final));
    if (cents > 0) allocate(cents, pool).forEach((c, i) => c > 0 && add(ws[i], { type: 'orderadjust', label: ORDER_ADJUST_LABEL, cents: c }));
    orderAdjustment = { finalCents: final, cents };
  }

  const lines: PricedLine[] = ws.map(w => ({
    line: w.line, baseUnitCents: w.base, grossCents: w.gross, discounts: w.discounts,
    discountCents: w.applied, netCents: w.gross - w.applied, bundleUnits: w.bundleUnits,
    ...(adjusted.has(w.line.id) ? { adjustment: adjusted.get(w.line.id)! } : {}),
  }));
  const itemsCents = lines.reduce((a, l) => a + l.grossCents, 0);
  const discountCents = lines.reduce((a, l) => a + l.discountCents, 0);
  const roll = new Map<string, AppliedDiscount>();
  for (const l of lines) for (const d of l.discounts) {
    const k = `${d.type}|${d.label}`;
    const cur = roll.get(k);
    roll.set(k, cur ? { ...cur, cents: cur.cents + d.cents } : { ...d });
  }
  return { lines, itemsCents, discountCents, netCents: itemsCents - discountCents, deals: [...roll.values()], bundles: bundleApps, ...(orderAdjustment ? { adjustment: orderAdjustment } : {}) };
}

/** Per-unit price after discounts, split so Σ equals the line net exactly (Shopify order lines need unit prices). */
export function splitLineForOrder(netCents: number, qty: number): { qty: number; unitCents: number }[] {
  if (qty <= 0) return [];
  const lo = Math.floor(netCents / qty);
  const hiQty = netCents - lo * qty; // how many units carry one extra cent
  const out: { qty: number; unitCents: number }[] = [];
  if (qty - hiQty > 0) out.push({ qty: qty - hiQty, unitCents: lo });
  if (hiQty > 0) out.push({ qty: hiQty, unitCents: lo + 1 });
  return out;
}
