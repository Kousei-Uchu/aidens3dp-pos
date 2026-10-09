// Local pricing engine (instant totals). Order of application:
//   1. bundle deals (in-app config)      – consume units, block manual line discount on those lines
//   2. Shopify automatic discounts       – best single discount wins (combination rules are not read)
//   3. manual line discount              – % or $ off the line's remaining value
//   4. cart discount                     – % or $ spread over remaining value of discountable lines
// Items excluded from discounts: gift cards, tag "no-discount", lines flagged noDiscount.
import { allocate, pctOf } from './money';
import { matchBundles } from './bundles';
import type {
  AppliedDiscount, AutoDiscount, BundleConfig, Cart, CartLine, PricedCart, PricedLine, Target, Variant,
} from './types';

export type PricingContext = {
  variants: Record<string, Variant>;
  collectionsOfProduct: Record<string, string[]>;
  autoDiscounts: AutoDiscount[];
  bundles: BundleConfig | null;
  now?: number;
};

export const NO_DISCOUNT_TAG = 'no-discount';

type Work = {
  line: CartLine; base: number; gross: number; discountable: boolean; isItem: boolean;
  productId?: string; collections: string[]; variantId?: string;
  bundleUnits: number; discounts: AppliedDiscount[]; applied: number;
};

const remaining = (w: Work) => w.gross - w.applied;
const eligibleQty = (w: Work) => Math.max(0, w.line.qty - w.bundleUnits);

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

/** Evaluate one automatic discount → cents per work-line (0 where it doesn't apply). */
function evalAuto(d: AutoDiscount, ws: Work[]): number[] {
  const out = ws.map(() => 0);
  const cand = ws.map(w => w.isItem && w.discountable);
  if (d.kind === 'basic') {
    const el = ws.map((w, i) => (cand[i] && matches(d.target, w) ? eligibleQty(w) : 0));
    const value = ws.reduce((a, w, i) => a + el[i] * w.base, 0);
    const qty = el.reduce((a, b) => a + b, 0);
    if (!qty) return out;
    if (d.minSubtotalCents && value < d.minSubtotalCents) return out;
    if (d.minQty && qty < d.minQty) return out;
    if (d.pct) ws.forEach((w, i) => { if (el[i]) out[i] = Math.min(remaining(w), pctOf(el[i] * w.base, d.pct!)); });
    else if (d.amtCents) {
      if (d.eachItem) ws.forEach((w, i) => { if (el[i]) out[i] = Math.min(remaining(w), el[i] * Math.min(d.amtCents!, w.base)); });
      else {
        const total = Math.min(d.amtCents, value);
        const parts = allocate(total, ws.map((w, i) => el[i] * w.base));
        parts.forEach((p, i) => (out[i] = Math.min(remaining(ws[i]), p)));
      }
    }
    return out;
  }
  // buy X get Y
  if (!d.buys || !d.gets) return out;
  type U = { li: number; price: number; used: boolean };
  const units = (t: Target): U[] => {
    const u: U[] = [];
    ws.forEach((w, li) => { if (cand[li] && matches(t, w)) for (let k = 0; k < eligibleQty(w); k++) u.push({ li, price: w.base, used: false }); });
    return u;
  };
  // separate unit objects per role, but a physical unit can only be used once → share via key
  const keyOf = (li: number, k: number) => `${li}:${k}`;
  const mk = (t: Target) => {
    const res: (U & { key: string })[] = [];
    ws.forEach((w, li) => { if (cand[li] && matches(t, w)) for (let k = 0; k < eligibleQty(w); k++) res.push({ li, price: w.base, used: false, key: keyOf(li, k) }); });
    return res;
  };
  void units;
  const buyPool = mk(d.buys.target).sort((a, b) => b.price - a.price);
  const getPool = mk(d.gets.target).sort((a, b) => a.price - b.price);
  const used = new Set<string>();
  let apps = 0;
  for (;;) {
    if (d.usesPerOrderLimit && apps >= d.usesPerOrderLimit) break;
    const buys: typeof buyPool = [];
    if (d.buys.qty) {
      for (const u of buyPool) { if (!used.has(u.key)) { buys.push(u); if (buys.length === d.buys.qty) break; } }
      if (buys.length < d.buys.qty) break;
    } else if (d.buys.amountCents) {
      let s = 0;
      for (const u of buyPool) { if (!used.has(u.key)) { buys.push(u); s += u.price; if (s >= d.buys.amountCents) break; } }
      if (s < d.buys.amountCents) break;
    } else break;
    buys.forEach(b => used.add(b.key));
    const gets: typeof getPool = [];
    for (const u of getPool) { if (!used.has(u.key)) { gets.push(u); if (gets.length === d.gets.qty) break; } }
    if (gets.length < d.gets.qty) { buys.forEach(b => used.delete(b.key)); break; }
    gets.forEach(g => {
      used.add(g.key);
      const off = d.gets!.pct ? pctOf(g.price, d.gets!.pct) : Math.min(d.gets!.amtCents ?? 0, g.price);
      out[g.li] += off;
    });
    apps++;
  }
  return out.map((c, i) => Math.min(c, remaining(ws[i])));
}

export function priceCart(cart: Cart, ctx: PricingContext): PricedCart {
  const now = ctx.now ?? Date.now();
  const ws: Work[] = cart.lines.map(line => {
    const base = line.overrideCents ?? line.unitCents;
    const v = line.variantId ? ctx.variants[line.variantId] : undefined;
    const tagged = !!v?.tags.some(t => t.toLowerCase() === NO_DISCOUNT_TAG);
    return {
      line, base, gross: base * line.qty,
      discountable: line.kind !== 'gift_card' && !line.noDiscount && !tagged,
      isItem: line.kind === 'item' && !!v,
      productId: v?.productId, variantId: line.variantId,
      collections: v ? ctx.collectionsOfProduct[v.productId] ?? [] : [],
      bundleUnits: 0, discounts: [], applied: 0,
    };
  });
  const add = (w: Work, d: AppliedDiscount) => {
    const c = Math.min(d.cents, remaining(w));
    if (c <= 0) return;
    w.discounts.push({ ...d, cents: c });
    w.applied += c;
  };

  // 1 ── bundles
  if (ctx.bundles) {
    const idx = new Map<string, number>();
    const sources = ws
      .map((w, i) => ({ w, i }))
      .filter(x => x.w.isItem && x.w.discountable)
      .map(({ w, i }) => { idx.set(w.line.id, i); return { key: w.line.id, variantId: w.variantId!, productId: w.productId!, unitCents: w.base, avail: w.line.qty }; });
    const matchesFound = matchBundles(sources, ctx.bundles);
    const agg = new Map<string, { w: Work; label: string; cents: number; units: number; dealId: string }>();
    for (const m of matchesFound) for (const p of m.picks) {
      const w = ws[idx.get(p.sourceKey)!];
      w.bundleUnits += 1;
      const k = `${w.line.id}|${m.dealId}`;
      const cur = agg.get(k) ?? { w, label: m.label, cents: 0, units: 0, dealId: m.dealId };
      cur.cents += p.discountCents; cur.units += 1; agg.set(k, cur);
    }
    for (const a of agg.values()) if (a.cents > 0) add(a.w, { type: 'bundle', label: a.label, cents: a.cents, id: a.dealId });
  }

  // 2 ── automatic discounts (best single)
  let best: { d: AutoDiscount; per: number[]; total: number } | null = null;
  for (const d of ctx.autoDiscounts) {
    if (!activeNow(d, now)) continue;
    const per = evalAuto(d, ws);
    const total = per.reduce((a, b) => a + b, 0);
    if (total > (best?.total ?? 0)) best = { d, per, total };
  }
  if (best) best.per.forEach((c, i) => c > 0 && add(ws[i], { type: 'auto', label: best!.d.title, cents: c, id: best!.d.id }));

  // 3 ── manual line discount (blocked on lines that received a bundle discount)
  for (const w of ws) {
    const md = w.line.discount;
    if (!md || !w.discountable || w.discounts.some(d => d.type === 'bundle')) continue;
    const rem = remaining(w);
    const c = md.kind === 'pct' ? pctOf(rem, md.value) : Math.min(md.value, rem);
    add(w, { type: 'manual', label: md.label, cents: c });
  }

  // 4 ── cart discount
  const cd = cart.discount;
  if (cd) {
    const pool = ws.map(w => (w.discountable ? remaining(w) : 0));
    const sum = pool.reduce((a, b) => a + b, 0);
    const total = cd.kind === 'pct' ? pctOf(sum, cd.value) : Math.min(cd.value, sum);
    allocate(total, pool).forEach((c, i) => c > 0 && add(ws[i], { type: 'cart', label: cd.label, cents: c }));
  }

  const lines: PricedLine[] = ws.map(w => ({
    line: w.line, baseUnitCents: w.base, grossCents: w.gross, discounts: w.discounts,
    discountCents: w.applied, netCents: w.gross - w.applied, bundleUnits: w.bundleUnits,
  }));
  const itemsCents = lines.reduce((a, l) => a + l.grossCents, 0);
  const discountCents = lines.reduce((a, l) => a + l.discountCents, 0);
  const roll = new Map<string, AppliedDiscount>();
  for (const l of lines) for (const d of l.discounts) {
    const k = `${d.type}|${d.label}`;
    const cur = roll.get(k);
    roll.set(k, cur ? { ...cur, cents: cur.cents + d.cents } : { ...d });
  }
  return { lines, itemsCents, discountCents, netCents: itemsCents - discountCents, deals: [...roll.values()] };
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
