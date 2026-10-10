// Bundle / combo deals – in-app config (research doc §4.7a).
// Semantics:
//  1. A product GID in a set matches ALL its variants; a variant GID matches only that variant.
//  2. A deal matches when the cart can supply one unit from EACH listed set (`sets` may repeat a set).
//     Units are consumed by a match and cannot be reused.
//  3. Competing deals/units: choose the assignment that MAXIMISES total discount (exhaustive search with a
//     node cap, greedy fallback). Ties → most RECOMMENDED pairs (deals that list `recommended` variant combinations),
//     then fewest deal applications (so 6 units of a 3-for-$5 / 5-for-$10 pair use one 5-unit deal, not two 3-unit
//     deals), then lowest priority number, then config order.
//  4. Delta is applied to current unit prices (after any price override), never below $0.
//  5. `apply_to`: whole delta comes off the unit(s) matched from THAT set; otherwise spread proportionally.
//  6. Modes: 'delta' (price_delta_cents off), 'fixed_price' (matched units cost price_delta_cents together),
//     'percent' (`percent` % off the matched units). `starts_at` / `ends_at` limit when a deal is live.
//  7. `recommended`: optional list of variant combinations. Any variant still qualifies; a match whose variants equal
//     one of the combinations (any order) is 'recommended', otherwise 'other'. Deals without the list report 'none'.
import { allocate, pctOf } from './money';
import type { AppliedBundle, BundleConfig, BundleDeal, BundleStatus } from './types';

export type BundleSource = { key: string; variantId: string; productId: string; unitCents: number; avail: number };
export type BundlePick = { sourceKey: string; setId: string; unitCents: number; discountCents: number };
export type BundleMatch = { dealId: string; label: string; picks: BundlePick[]; discountCents: number; status: BundleStatus };

export function parseBundleConfig(text: string): { cfg?: BundleConfig; error?: string } {
  let raw: any;
  try { raw = JSON.parse(text); } catch (e: any) { return { error: `Not valid JSON: ${e.message}` }; }
  if (!raw || typeof raw !== 'object') return { error: 'Config must be an object' };
  const items: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw.items ?? {})) {
    if (!Array.isArray(v)) return { error: `items.${k} must be an array of GIDs` };
    items[k] = v.map(String);
  }
  const discounts: BundleDeal[] = [];
  for (const d of raw.discounts ?? []) {
    if (!d?.id) return { error: 'Every deal needs an id' };
    const sets: string[] = Array.isArray(d.sets) ? d.sets.map(String) : [];
    if (!sets.length) return { error: `Deal ${d.id}: sets is empty` };
    const mode: BundleDeal['mode'] = d.mode === 'fixed_price' ? 'fixed_price' : d.mode === 'percent' ? 'percent' : 'delta';
    let cents = 0; let percent: number | undefined;
    if (mode === 'percent') {
      if (typeof d.percent !== 'number' || !(d.percent > 0 && d.percent <= 100)) return { error: `Deal ${d.id}: percent must be between 0 and 100` };
      percent = d.percent;
    } else if (typeof d.price_delta_cents === 'number') cents = Math.round(d.price_delta_cents);
    else if (typeof d.price_delta === 'number') cents = Math.round(d.price_delta * 100); // editor convenience
    else return { error: `Deal ${d.id}: needs price_delta_cents` };
    const stamp = (v: unknown, name: string): { v: string | null } | { error: string } => {
      if (v == null || v === '') return { v: null };
      if (Number.isNaN(Date.parse(String(v)))) return { error: `Deal ${d.id}: ${name} is not a valid date` };
      return { v: String(v) };
    };
    const sa = stamp(d.starts_at, 'starts_at'); if ('error' in sa) return { error: sa.error };
    const ea = stamp(d.ends_at, 'ends_at'); if ('error' in ea) return { error: ea.error };
    let recommended: string[][] | undefined;
    if (d.recommended != null) {
      if (!Array.isArray(d.recommended) || d.recommended.some((r: unknown) => !Array.isArray(r))) return { error: `Deal ${d.id}: recommended must be a list of variant lists` };
      recommended = d.recommended.map((r: unknown[]) => r.map(String));
    }
    discounts.push({
      id: String(d.id), label: String(d.label ?? d.id), sets, price_delta_cents: cents, ...(percent !== undefined ? { percent } : {}),
      apply_to: d.apply_to ?? null, mode,
      max_per_cart: d.max_per_cart ?? null, stackable: !!d.stackable, enabled: d.enabled !== false,
      priority: typeof d.priority === 'number' ? d.priority : 0,
      starts_at: sa.v, ends_at: ea.v, ...(recommended?.length ? { recommended } : {}),
    });
  }
  return { cfg: { version: 1, items, discounts } };
}

export function validateBundleConfig(cfg: BundleConfig, knownIds: Set<string>): string[] {
  const w: string[] = [];
  for (const [s, ids] of Object.entries(cfg.items)) {
    if (!ids.length) w.push(`Set "${s}" is empty`);
    for (const id of ids) if (knownIds.size && !knownIds.has(id)) w.push(`Set "${s}": ${id} is not in the synced catalogue (archived/deleted?)`);
  }
  for (const d of cfg.discounts) {
    for (const s of d.sets) if (!cfg.items[s]) w.push(`Deal "${d.id}" references unknown set "${s}"`);
    if (d.apply_to && !d.sets.includes(d.apply_to)) w.push(`Deal "${d.id}": apply_to "${d.apply_to}" is not one of its sets`);
    if ((d.mode ?? 'delta') === 'delta' && d.price_delta_cents >= 0) w.push(`Deal "${d.id}": price_delta_cents should be negative for a discount`);
    if (d.starts_at && d.ends_at && Date.parse(d.starts_at) > Date.parse(d.ends_at)) w.push(`Deal "${d.id}": starts after it ends`);
    for (const r of d.recommended ?? []) {
      if (r.length !== d.sets.length) w.push(`Deal "${d.id}": a recommended pair has ${r.length} item(s) but the deal takes ${d.sets.length}`);
      for (const id of r) if (knownIds.size && !knownIds.has(id)) w.push(`Deal "${d.id}": recommended item ${id} is not in the synced catalogue`);
    }
  }
  const seen = new Map<string, string>();
  for (const d of cfg.discounts) {
    const k = [...d.sets].sort().join('+');
    if (seen.has(k)) w.push(`Deals "${seen.get(k)}" and "${d.id}" cover the same sets (overlap)`);
    else seen.set(k, d.id);
  }
  return w;
}

type Assignment = {
  dealIdx: number; deal: BundleDeal; src: number[]; setIds: string[]; discount: number; perUnit: number[]; needs: Map<number, number>; status: BundleStatus;
};

const comboKey = (ids: string[]) => [...ids].sort().join('|');
/** 'none' when the deal lists no recommended pairs; otherwise whether these exact variants (any order) are one of them. */
export function bundleStatus(deal: BundleDeal, variantIds: string[]): BundleStatus {
  if (!deal.recommended?.length) return 'none';
  const k = comboKey(variantIds);
  return deal.recommended.some(r => comboKey(r) === k) ? 'recommended' : 'other';
}

/** Is the deal live at `now`? (enabled flag and the optional start/end dates) */
export function dealLive(d: BundleDeal, now: number): boolean {
  if (d.enabled === false) return false;
  if (d.starts_at && Date.parse(d.starts_at) > now) return false;
  if (d.ends_at && Date.parse(d.ends_at) < now) return false;
  return true;
}

function dealValue(deal: BundleDeal, prices: number[], setIds: string[]): { total: number; perUnit: number[] } {
  const sum = prices.reduce((a, b) => a + b, 0);
  let targets = prices.map((_, i) => i);
  if (deal.apply_to) {
    const t = setIds.map((s, i) => (s === deal.apply_to ? i : -1)).filter(i => i >= 0);
    if (t.length) targets = t;
  }
  const cap = targets.reduce((a, i) => a + prices[i], 0);
  let D: number;
  if (deal.mode === 'fixed_price') D = Math.max(0, sum - deal.price_delta_cents);
  else if (deal.mode === 'percent') D = pctOf(cap, deal.percent ?? 0);
  else D = deal.price_delta_cents < 0 ? -deal.price_delta_cents : 0;
  D = Math.min(D, cap);
  const parts = allocate(D, targets.map(i => prices[i]));
  const perUnit = prices.map(() => 0);
  targets.forEach((i, k) => (perUnit[i] = parts[k]));
  return { total: D, perUnit };
}

export function matchBundles(sources: BundleSource[], cfg: BundleConfig | null, maxNodes = 20000, now: number = Date.now()): BundleMatch[] {
  if (!cfg || !cfg.discounts.length || !sources.length) return [];
  // reverse index: id → sets
  const toSets = new Map<string, string[]>();
  for (const [setId, ids] of Object.entries(cfg.items)) for (const id of ids) {
    const a = toSets.get(id) ?? []; a.push(setId); toSets.set(id, a);
  }
  const srcSets = sources.map(s => new Set([...(toSets.get(s.variantId) ?? []), ...(toSets.get(s.productId) ?? [])]));
  const deals = cfg.discounts
    .map((d, i) => ({ d, i }))
    .filter(x => dealLive(x.d, now))
    .sort((a, b) => (a.d.priority ?? 0) - (b.d.priority ?? 0) || a.i - b.i);

  // static enumeration of every possible assignment (independent of availability)
  const all: Assignment[] = [];
  deals.forEach(({ d }, dealIdx) => {
    const cand = d.sets.map(sid => sources.map((_, i) => i).filter(i => srcSets[i].has(sid)));
    if (cand.some(c => c.length === 0)) return;
    const rec = (pos: number, cur: number[]) => {
      if (pos === d.sets.length) {
        const needs = new Map<number, number>();
        cur.forEach(i => needs.set(i, (needs.get(i) ?? 0) + 1));
        for (const [i, n] of needs) if (n > sources[i].avail) return;
        const prices = cur.map(i => sources[i].unitCents);
        const v = dealValue(d, prices, d.sets);
        if (v.total <= 0) return;
        all.push({ dealIdx, deal: d, src: [...cur], setIds: d.sets, discount: v.total, perUnit: v.perUnit, needs, status: bundleStatus(d, cur.map(i => sources[i].variantId)) });
        return;
      }
      for (const i of cand[pos]) {
        if (pos > 0 && d.sets[pos] === d.sets[pos - 1] && i < cur[pos - 1]) continue; // symmetry pruning
        cur.push(i); rec(pos + 1, cur); cur.pop();
      }
    };
    rec(0, []);
  });
  if (!all.length) return [];

  const avail = sources.map(s => s.avail);
  const dealCount = new Map<string, number>();
  const fits = (a: Assignment) => {
    for (const [i, n] of a.needs) if (avail[i] < n) return false;
    if (a.deal.max_per_cart != null && (dealCount.get(a.deal.id) ?? 0) >= a.deal.max_per_cart) return false;
    return true;
  };
  const take = (a: Assignment, sign: 1 | -1) => {
    for (const [i, n] of a.needs) avail[i] -= sign * n;
    dealCount.set(a.deal.id, (dealCount.get(a.deal.id) ?? 0) + sign);
  };

  // greedy baseline
  let best = { total: 0, chosen: [] as Assignment[] };
  {
    const chosen: Assignment[] = []; let total = 0;
    const rank = (a: Assignment) => (a.status === 'recommended' ? 0 : 1);
    const byValue = [...all].sort((a, b) => b.discount - a.discount || rank(a) - rank(b) || a.dealIdx - b.dealIdx);
    for (;;) {
      const a = byValue.find(fits);
      if (!a) break;
      take(a, 1); chosen.push(a); total += a.discount;
    }
    best = { total, chosen };
    // reset
    chosen.forEach(a => take(a, -1));
  }
  // exhaustive improvement (capped)
  let nodes = 0;
  const chosen: Assignment[] = [];
  const recCount = (l: Assignment[]) => l.filter(a => a.status === 'recommended').length;
  const dfs = (start: number, total: number, rec: number) => {
    // strictly better saving wins; on an equal saving prefer more recommended pairs, then fewer deal applications (bigger lots)
    const bestRec = recCount(best.chosen);
    if (total > best.total || (total === best.total && chosen.length > 0 && (rec > bestRec || (rec === bestRec && chosen.length < best.chosen.length)))) best = { total, chosen: [...chosen] };
    if (++nodes > maxNodes) return;
    for (let k = start; k < all.length; k++) {
      const a = all[k];
      if (!fits(a)) continue;
      take(a, 1); chosen.push(a);
      dfs(k, total + a.discount, rec + (a.status === 'recommended' ? 1 : 0));
      chosen.pop(); take(a, -1);
      if (nodes > maxNodes) return;
    }
  };
  dfs(0, 0, 0);

  return best.chosen.map(a => ({
    dealId: a.deal.id,
    label: a.deal.label,
    discountCents: a.discount,
    status: a.status,
    picks: a.src.map((i, p) => ({ sourceKey: sources[i].key, setId: a.setIds[p], unitCents: sources[i].unitCents, discountCents: a.perUnit[p] })),
  }));
}

// ── cart review helpers (A8.4 / A8.6) ────────────────────────────────────────
/** Bundles applied with variations that aren't one of the deal's recommended pairs. */
export const oddBundles = (bs: AppliedBundle[]): AppliedBundle[] => bs.filter(b => b.status === 'other');
/** Stable fingerprint of the not-recommended bundles; the checkout prompt only returns when this changes. '' = nothing to check. */
export const bundleReviewKey = (bs: AppliedBundle[]): string =>
  oddBundles(bs).map(b => `${b.dealId}:${b.units.map(u => u.variantId).sort().join(',')}`).sort().join('|');
export const needsBundleCheck = (bs: AppliedBundle[], acknowledged: string): boolean => { const k = bundleReviewKey(bs); return k !== '' && k !== acknowledged; };
/** "Dragon - Red" (variation left out when the product has a single default variant). */
export const bundleUnitName = (u: { title: string; variantTitle?: string }): string =>
  (u.variantTitle && u.variantTitle !== 'Default Title' ? `${u.title} - ${u.variantTitle}` : u.title);
