// Location: src/lib/bundleForm.ts
// Pure helpers behind the bundle builder screen (A8). The app stores bundles as the same JSON the engine reads
// (`settings.bundlesJson`); this module turns one deal into an editable form and back, so the GUI and the Advanced
// JSON view always describe the same data.
//
// Form model: a deal is a list of SLOTS. A slot is "N units from this group of products/variants". On save each slot
// becomes a named set (`<dealId>_1`, `<dealId>_2`, …) and the deal's `sets` repeats that set N times.
import type { BundleConfig, BundleDeal, Variant } from './types';

export type SlotForm = { ids: string[]; qty: number };
export type DealMode = 'delta' | 'fixed_price' | 'percent';
export type DealForm = {
  id: string;
  label: string;
  enabled: boolean;
  slots: SlotForm[];
  mode: DealMode;
  amountCents: number; // delta: dollars off (positive here); fixed_price: the price the matched units cost together
  percent: number; // percent mode
  applyToSlot: number | null; // index into slots; null = spread over every unit
  maxPerCart: number | null;
  startsOn: string; // '' or YYYY-MM-DD (local date, first day the deal is live)
  endsOn: string; // '' or YYYY-MM-DD (local date, last day the deal is live)
  recommended: string[][]; // variant GIDs, one per unit of the deal (slot order, qty expanded)
};

export const emptyBundleConfig = (): BundleConfig => ({ version: 1, items: {}, discounts: [] });

/** `Dragons 2 for $5!` → `dragons_2_for_5`, made unique against `taken`. */
export function makeDealId(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'deal';
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
}

export function emptyDealForm(cfg: BundleConfig): DealForm {
  return {
    id: makeDealId('new deal', cfg.discounts.map(d => d.id)), label: '', enabled: true, slots: [{ ids: [], qty: 1 }],
    mode: 'delta', amountCents: 0, percent: 10, applyToSlot: null, maxPerCart: null, startsOn: '', endsOn: '', recommended: [],
  };
}

// ── dates ────────────────────────────────────────────────────────────────────
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const isDateText = (t: string) => {
  const m = DATE_RE.exec(t.trim()); if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
};
/** Start of that local day. */
export const startOfDayIso = (t: string): string | null => { const m = DATE_RE.exec(t.trim()); return m && isDateText(t) ? new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0).toISOString() : null; };
/** Last millisecond of that local day, so "ends on 1 Dec" includes all of 1 Dec. */
export const endOfDayIso = (t: string): string | null => { const m = DATE_RE.exec(t.trim()); return m && isDateText(t) ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999).toISOString() : null; };
export const isoToDateText = (iso?: string | null): string => {
  if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ── config → form ────────────────────────────────────────────────────────────
export function dealToForm(cfg: BundleConfig, deal: BundleDeal): DealForm {
  // Group every use of a set into one slot (order of first appearance). The engine doesn't care about set order.
  const order: string[] = []; const qty = new Map<string, number>();
  for (const s of deal.sets) { if (!qty.has(s)) order.push(s); qty.set(s, (qty.get(s) ?? 0) + 1); }
  const mode: DealMode = deal.mode === 'fixed_price' ? 'fixed_price' : deal.mode === 'percent' ? 'percent' : 'delta';
  const apply = deal.apply_to ? order.indexOf(deal.apply_to) : -1;
  return {
    id: deal.id, label: deal.label, enabled: deal.enabled !== false,
    slots: order.map(s => ({ ids: [...(cfg.items[s] ?? [])], qty: qty.get(s)! })),
    mode, amountCents: mode === 'delta' ? Math.max(0, -deal.price_delta_cents) : mode === 'fixed_price' ? deal.price_delta_cents : 0,
    percent: deal.percent ?? 10, applyToSlot: apply >= 0 ? apply : null, maxPerCart: deal.max_per_cart ?? null,
    startsOn: isoToDateText(deal.starts_at), endsOn: isoToDateText(deal.ends_at), recommended: (deal.recommended ?? []).map(r => [...r]),
  };
}

// ── form → config ────────────────────────────────────────────────────────────
export const totalUnits = (f: Pick<DealForm, 'slots'>) => f.slots.reduce((a, s) => a + s.qty, 0);

/** Slot index for each unit position of the deal (qty expanded), used by the recommended-pair picker. */
export const unitSlots = (f: Pick<DealForm, 'slots'>): number[] => f.slots.flatMap((s, i) => Array(s.qty).fill(i));

export function formToDeal(f: DealForm): { deal: BundleDeal; items: Record<string, string[]> } {
  const items: Record<string, string[]> = {}; const sets: string[] = []; const setIdOf: string[] = [];
  f.slots.forEach((s, i) => { const sid = `${f.id}_${i + 1}`; setIdOf.push(sid); items[sid] = [...s.ids]; for (let n = 0; n < s.qty; n++) sets.push(sid); });
  const deal: BundleDeal = {
    id: f.id, label: f.label.trim() || f.id, sets, mode: f.mode,
    price_delta_cents: f.mode === 'delta' ? -Math.abs(Math.round(f.amountCents)) : f.mode === 'fixed_price' ? Math.round(f.amountCents) : 0,
    ...(f.mode === 'percent' ? { percent: f.percent } : {}),
    apply_to: f.applyToSlot != null && setIdOf[f.applyToSlot] ? setIdOf[f.applyToSlot] : null,
    max_per_cart: f.maxPerCart && f.maxPerCart > 0 ? Math.round(f.maxPerCart) : null,
    stackable: false, enabled: f.enabled, priority: 0,
    starts_at: f.startsOn.trim() ? startOfDayIso(f.startsOn) : null, ends_at: f.endsOn.trim() ? endOfDayIso(f.endsOn) : null,
    ...(f.recommended.length ? { recommended: f.recommended.map(r => [...r]) } : {}),
  };
  return { deal, items };
}

/** Sets that no deal uses any more are dropped, so deleting or reshaping a deal doesn't leave clutter in the JSON. */
export function pruneSets(cfg: BundleConfig): BundleConfig {
  const used = new Set(cfg.discounts.flatMap(d => d.sets));
  return { ...cfg, items: Object.fromEntries(Object.entries(cfg.items).filter(([k]) => used.has(k))) };
}

/** Insert or replace a deal (matched by id). Keeps the position of an existing deal and the priority it already had. */
export function upsertDeal(cfg: BundleConfig, f: DealForm): BundleConfig {
  const { deal, items } = formToDeal(f);
  const at = cfg.discounts.findIndex(d => d.id === f.id);
  const prev = at >= 0 ? cfg.discounts[at] : null;
  const next: BundleDeal = prev ? { ...deal, priority: prev.priority ?? 0, stackable: prev.stackable ?? false } : deal;
  const discounts = at >= 0 ? cfg.discounts.map((d, i) => (i === at ? next : d)) : [...cfg.discounts, next];
  return pruneSets({ ...cfg, items: { ...cfg.items, ...items }, discounts });
}
export const removeDeal = (cfg: BundleConfig, id: string): BundleConfig => pruneSets({ ...cfg, discounts: cfg.discounts.filter(d => d.id !== id) });
export const setDealEnabled = (cfg: BundleConfig, id: string, enabled: boolean): BundleConfig => ({ ...cfg, discounts: cfg.discounts.map(d => (d.id === id ? { ...d, enabled } : d)) });
export const stringifyBundleConfig = (cfg: BundleConfig): string => (cfg.discounts.length ? JSON.stringify(cfg, null, 2) : '');

// ── checks ───────────────────────────────────────────────────────────────────
/** Reasons the form can't be saved yet (empty = fine). */
export function formProblems(f: DealForm): string[] {
  const p: string[] = [];
  if (!f.label.trim()) p.push('Give the deal a name.');
  if (!f.slots.length) p.push('Add at least one item group.');
  f.slots.forEach((s, i) => { if (!s.ids.length) p.push(`Group ${i + 1} has no items. Pick at least one.`); if (!(s.qty >= 1)) p.push(`Group ${i + 1} needs a quantity of 1 or more.`); });
  if (f.mode === 'delta' && !(f.amountCents > 0)) p.push('Enter how much the deal takes off.');
  if (f.mode === 'fixed_price' && !(f.amountCents >= 0)) p.push('Enter the deal price.');
  if (f.mode === 'percent' && !(f.percent > 0 && f.percent <= 100)) p.push('Percent off must be between 0 and 100.');
  if (f.startsOn.trim() && !isDateText(f.startsOn)) p.push('Start date should look like 2026-12-01.');
  if (f.endsOn.trim() && !isDateText(f.endsOn)) p.push('End date should look like 2026-12-24.');
  if (isDateText(f.startsOn) && isDateText(f.endsOn) && f.startsOn > f.endsOn) p.push('The deal ends before it starts.');
  const units = totalUnits(f);
  for (const r of f.recommended) if (r.length !== units) p.push(`A recommended pair needs ${units} item(s).`);
  return [...new Set(p)];
}

/** Variants that can fill a slot: every variant of a listed product, plus listed variants. Sorted by name. */
export function slotVariants(slot: SlotForm, variants: Record<string, Variant>): Variant[] {
  const ids = new Set(slot.ids);
  return Object.values(variants).filter(v => ids.has(v.id) || ids.has(v.productId))
    .sort((a, b) => a.productTitle.localeCompare(b.productTitle) || a.variantTitle.localeCompare(b.variantTitle));
}

export const variantName = (v: Pick<Variant, 'productTitle' | 'variantTitle'>) => (v.variantTitle && v.variantTitle !== 'Default Title' ? `${v.productTitle} - ${v.variantTitle}` : v.productTitle);

/** Readable name for a product or variant GID (falls back to the id when it's no longer in the catalogue). */
export function idName(id: string, variants: Record<string, Variant>): string {
  const v = variants[id]; if (v) return variantName(v);
  const p = Object.values(variants).find(x => x.productId === id); return p ? `${p.productTitle} (all variations)` : id;
}

export const slotLabel = (s: SlotForm, variants: Record<string, Variant>): string => {
  const names = s.ids.map(i => idName(i, variants));
  const shown = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2} more` : names.join(', ') || 'nothing picked';
  return `${s.qty} × ${shown}`;
};

export function dealEffect(f: Pick<DealForm, 'mode' | 'amountCents' | 'percent'>, money: (c: number) => string): string {
  return f.mode === 'percent' ? `${f.percent}% off` : f.mode === 'fixed_price' ? `for ${money(f.amountCents)}` : `${money(f.amountCents)} off`;
}
export const dealSummary = (f: DealForm, variants: Record<string, Variant>, money: (c: number) => string): string =>
  `${f.slots.map(s => slotLabel(s, variants)).join(' + ')} → ${dealEffect(f, money)}`;

/** Which window a deal is in right now, for the list badge. */
export function dealWindow(d: Pick<BundleDeal, 'starts_at' | 'ends_at'>, now: number): 'live' | 'scheduled' | 'ended' {
  if (d.starts_at && Date.parse(d.starts_at) > now) return 'scheduled';
  if (d.ends_at && Date.parse(d.ends_at) < now) return 'ended';
  return 'live';
}
