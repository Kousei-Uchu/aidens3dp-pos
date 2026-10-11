// Location: src/lib/trainingSpots.ts
// Names for the things training can point at. A spot is any button, tile or row that carries `spot="..."` in the UI.
// tests/trainingspots.test.ts scans the source, so a module can never point at a spot that is not really there.
export const SPOT = {
  cartCharge: 'cart.charge', // the Charge button (cart pane, or the bar on a phone)
  cartOpen: 'cart.open',     // the bar that opens the cart on a phone
  tabCheckout: 'tab.checkout',
  tabMore: 'tab.more',
  moreTraining: 'more.training',
} as const;
export const STATIC_SPOTS: readonly string[] = Object.values(SPOT);
/** Spots whose id ends in a record id: a grid tile, or a cart line. */
export const DYNAMIC_PREFIXES = ['grid.item:', 'grid.cat:', 'grid.action:', 'cart.line:'] as const;
export const isKnownSpot = (id: string): boolean => STATIC_SPOTS.includes(id) || DYNAMIC_PREFIXES.some(p => id.startsWith(p) && id.length > p.length);
export const gridItemSpot = (id: string): string => `grid.item:${id}`;
export const gridCatSpot = (collectionId: string): string => `grid.cat:${collectionId}`;
export const gridActionSpot = (action: string): string => `grid.action:${action}`;
export const cartLineSpot = (variantId: string): string => `cart.line:${variantId}`;
/** The spot id a grid tile carries, or undefined for tile types training does not point at. */
export function tileSpotId(t: { type: string; variantId?: string; productId?: string; collectionId?: string; action?: string }): string | undefined {
  if (t.type === 'item') { const id = t.variantId ?? t.productId; return id ? gridItemSpot(id) : undefined; }
  if (t.type === 'category' && t.collectionId) return gridCatSpot(t.collectionId);
  if (t.type === 'action' && t.action) return gridActionSpot(t.action);
  return undefined;
}
