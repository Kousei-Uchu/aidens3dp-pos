// Location: src/lib/cartWarnings.ts
// Cart warning logic: detect which warnings match cart items
import type { Cart, CartWarning, Variant } from './types';

export type MatchedCartWarning = {
  warning: CartWarning;
  matches: Array<{ lineId: string; title: string; variantId?: string; productId?: string; collectionIds?: string[] }>;
};

export function matchCartWarnings(cart: Cart, warnings: CartWarning[] | undefined, catalog: {
  variants: Record<string, Variant>;
  collectionsOfProduct: Record<string, string[]>;
}): MatchedCartWarning[] {
  const list = warnings ?? [];
  const enabled = list.filter(w => w.enabled && w.targetId);
  const result: MatchedCartWarning[] = [];
  
  for (const w of enabled) {
    const matches: MatchedCartWarning['matches'] = [];
    for (const line of cart.lines) {
      if (line.kind !== 'item' || !line.variantId) continue;
      const v = catalog.variants[line.variantId];
      if (!v) continue;
      let isMatch = false;
      switch (w.scope) {
        case 'variant':
          isMatch = v.id === w.targetId;
          break;
        case 'product':
          isMatch = v.productId === w.targetId;
          break;
        case 'collection':
        case 'category':
          {
            const cols = catalog.collectionsOfProduct[v.productId] ?? [];
            isMatch = cols.includes(w.targetId);
          }
          break;
      }
      if (isMatch) {
        matches.push({
          lineId: line.id,
          title: line.title,
          variantId: line.variantId,
          productId: v.productId,
          collectionIds: catalog.collectionsOfProduct[v.productId],
        });
      }
    }
    if (matches.length > 0) {
      result.push({ warning: w, matches });
    }
  }
  // Sort by order if specified
  return result.sort((a, b) => {
    const ao = a.warning.order ?? 0;
    const bo = b.warning.order ?? 0;
    if (ao !== bo) return ao - bo;
    return 0;
  });
}

/** Fingerprint of matched warnings for acknowledgment tracking. */
export const warningsKey = (matched: MatchedCartWarning[]): string =>
  matched.map(w => `${w.warning.id}|${w.matches.map(m => m.lineId).join(',')}|${w.warning.requireAcknowledgement ? '1' : '0'}`).sort().join('~');

/** Check if cart warnings need to be shown (unacknowledged or alwaysShow). */
export const needsCartWarnings = (matched: MatchedCartWarning[], acknowledgedKey: string): boolean => {
  const key = warningsKey(matched);
  if (key === '') return false;
  if (key === acknowledgedKey) return false;
  // If any warning has alwaysShow, it should always appear
  if (matched.some(m => m.warning.alwaysShow)) return true;
  return true;
};
