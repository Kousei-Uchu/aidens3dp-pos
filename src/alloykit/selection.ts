// Location: src/alloykit/selection.ts
// 0250: pure rules for the app's choice of Alloy per Element. No storage, no network, no React: the picker, the router and the
// Smelter all use these, and the tests pin them.
import { ELEMENTS, REQUIRED_ELEMENTS } from './elements';
import { ALLOY_POLICY, type AlloyPolicy } from './policy';
import { OFF, type Alloy, type ElementId, type Selection } from './types';

/** The Alloy that implements an Element, or undefined. */
export const alloyFor = (alloys: Alloy[], id: string | undefined): Alloy | undefined => (id ? alloys.find(a => a.id === id) : undefined);
export const supports = (a: Alloy, e: ElementId): boolean => !!a.elements[e];

/** Which optional functions an Element implements, by name. The picker shows these: an Alloy cannot claim what it does not have. */
export function featuresOf(a: Alloy, e: ElementId): string[] {
  const api = a.elements[e]?.api as Record<string, unknown> | undefined;
  return api ? Object.keys(api).filter(k => typeof api[k] === 'function').sort() : [];
}

/**
 * Applies the build's policy to the Alloys: with `icloudCustomers: 'disabled'` the iCloud Alloy loses its Customers Element, so the
 * picker never offers it and a saved selection of it is reported as unsupported.
 */
export function applyPolicy(alloys: Alloy[], policy: AlloyPolicy = ALLOY_POLICY): Alloy[] {
  if (policy.icloudCustomers !== 'disabled') return alloys;
  return alloys.map(a => {
    if (a.id !== 'icloud' || !a.elements.customers) return a;
    const { customers: _removed, ...rest } = a.elements;
    return { ...a, elements: rest };
  });
}

export type Problem =
  | { kind: 'unchosen'; element: ElementId }                       // a required Element has nothing selected
  | { kind: 'unknown_alloy'; element: ElementId; alloy: string }   // saved choice names an Alloy this build does not have
  | { kind: 'unsupported'; element: ElementId; alloy: string };    // the Alloy cannot do that Element (or the policy removed it)

export type Validation = { ok: boolean; problems: Problem[]; off: ElementId[] };

/** What setup checks before Next: every required Element has a working choice; optional ones may be unset or Off. */
export function validateSelection(sel: Selection, alloys: Alloy[]): Validation {
  const problems: Problem[] = []; const off: ElementId[] = [];
  for (const { id } of ELEMENTS) {
    const v = sel[id];
    if (v === OFF) { if (REQUIRED_ELEMENTS.includes(id)) problems.push({ kind: 'unchosen', element: id }); else off.push(id); continue; }
    if (!v) { if (REQUIRED_ELEMENTS.includes(id)) problems.push({ kind: 'unchosen', element: id }); else off.push(id); continue; }
    const a = alloyFor(alloys, v);
    if (!a) { problems.push({ kind: 'unknown_alloy', element: id, alloy: v }); continue; }
    if (!supports(a, id)) problems.push({ kind: 'unsupported', element: id, alloy: v });
  }
  return { ok: problems.length === 0, problems, off };
}

/** What an install that has never chosen reads as: today's behaviour. Facts come from the app (is there a Shopify login, which shared backend). */
export type LegacyFacts = { shopifyConnected: boolean; sharedBackend: 'metaobject' | 'cloudkit'; zellerPaired: boolean };
export function legacySelection(f: LegacyFacts): Selection {
  const sel: Selection = {};
  if (f.shopifyConnected) for (const e of ['catalogue', 'stock', 'discounts', 'customers', 'orders', 'giftCards'] as const) sel[e] = 'shopify';
  sel.sharedState = f.sharedBackend === 'cloudkit' ? 'icloud' : 'shopify';
  if (f.zellerPaired) sel.cardTerminal = 'zeller';
  return sel;
}

export type SelectionChange = { element: ElementId; from: string | undefined; to: string | undefined };
/** The Elements whose Alloy differs. The Smelter works from this list. An unset Element and Off count as the same. */
export function diffSelection(from: Selection, to: Selection): SelectionChange[] {
  const norm = (v: string | undefined) => (v === OFF ? undefined : v);
  return ELEMENTS.flatMap(({ id }) => (norm(from[id]) === norm(to[id]) ? [] : [{ element: id, from: norm(from[id]), to: norm(to[id]) }]));
}
