import { useCallback, useMemo } from 'react';
import { useApp } from './store';
import { priceCart } from '../lib/pricing';
import { collectionTitlesByProduct } from '../lib/saleBuilder';
import { bundleConfig } from '../lib/sync';
import type { Cart, Variant } from '../lib/types';

/** Indexes derived from the catalogue (memoised on the catalogue object). */
export function useCatalogue() {
  const data = useApp(s => s.data);
  return useMemo(() => {
    const all = Object.values(data.variants); // every variant incl. draft/archived (Inventory)
    const list = all.filter(v => v.active); // sellable (everything else)
    const byProduct: Record<string, Variant[]> = {};
    for (const v of list) (byProduct[v.productId] ??= []).push(v);
    const collectionsOfProduct: Record<string, string[]> = {};
    for (const c of data.collections) for (const p of c.productIds) (collectionsOfProduct[p] ??= []).push(c.id);
    return { all, list, byProduct, collectionsOfProduct, titles: collectionTitlesByProduct(data.collections), collections: data.collections, variants: data.variants };
  }, [data]);
}

export function usePriced() {
  const cart = useApp(s => s.pos.cart); const cat = useCatalogue(); const autos = useApp(s => s.data.autos); const bundlesJson = useApp(s => s.settings.bundlesJson);
  return useMemo(() => priceCart(cart, { variants: cat.variants, collectionsOfProduct: cat.collectionsOfProduct, autoDiscounts: autos, bundles: bundleConfig() }), [cart, cat, autos, bundlesJson]);
}

/** Prices any cart the way the live cart is priced (for what-if numbers, e.g. the cart with no adjustments). */
export function usePricer() {
  const cat = useCatalogue(); const autos = useApp(s => s.data.autos); const bundlesJson = useApp(s => s.settings.bundlesJson);
  return useCallback((cart: Cart) => priceCart(cart, { variants: cat.variants, collectionsOfProduct: cat.collectionsOfProduct, autoDiscounts: autos, bundles: bundleConfig() }), [cat, autos, bundlesJson]);
}

/** Display name for a product with its variants collapsed. */
export const productName = (v: Variant) => v.productTitle;
export const stockTone = (v: Variant): 'none' | 'ok' | 'low' | 'neg' => (v.stock === null ? 'none' : v.stock < 0 ? 'neg' : v.stock <= 2 ? 'low' : 'ok');
