// grid.json  {version:1, pages:[{id,name,tiles:[…]}]}  (research doc §Grid) – stored in the pos_layout metaobject.
import { uid } from './ids';

export const ACTIONS = ['custom_amount', 'add_gift_card', 'clear_cart', 'create_item', 'customers', 'discounts', 'discount', 'saved_carts', 'switch_staff', 'lock_pos', 'price_check', 'stock_check', 'check_change'] as const;
export type ActionId = (typeof ACTIONS)[number];
export const ACTION_LABEL: Record<ActionId, string> = {
  custom_amount: 'Custom amount', add_gift_card: 'Sell gift card', clear_cart: 'Clear cart', create_item: 'Create item',
  customers: 'Customers', discounts: 'Discounts', discount: 'Cart discount', saved_carts: 'Saved carts', switch_staff: 'Switch staff',
  lock_pos: 'Lock POS', price_check: 'Price check', stock_check: 'Stock check', check_change: 'Check change',
};
export type Tile =
  | { type: 'action'; action: ActionId; label?: string; color?: string }
  // A category shows its Shopify collection's items. `subs` are sub-categories (or groups) inside it, to any depth.
  | { type: 'category'; collectionId: string; label?: string; color?: string; subs?: Tile[] }
  | { type: 'item'; variantId?: string; productId?: string; label?: string; color?: string }
  | { type: 'discount'; code?: string; pct?: number; amtCents?: number; label?: string; color?: string }
  // A display group holds tiles of its own. With `collectionId` it also acts like that collection (shows its items after its tiles).
  | { type: 'group'; name: string; tiles: Tile[]; color?: string; collectionId?: string };
export type GridPage = { id: string; name: string; tiles: Tile[] };
export type Grid = { version: 1; pages: GridPage[] };

export const defaultGrid = (): Grid => ({
  version: 1,
  pages: [{ id: uid(), name: 'Home', tiles: ACTIONS.filter(a => a !== 'discount').map(a => ({ type: 'action' as const, action: a })) }],
});

const isTile = (t: any): t is Tile => {
  if (!t || typeof t !== 'object') return false;
  switch (t.type) {
    case 'action': return (ACTIONS as readonly string[]).includes(t.action);
    case 'category': return typeof t.collectionId === 'string' && (t.subs === undefined || (Array.isArray(t.subs) && t.subs.every(isTile)));
    case 'item': return typeof t.variantId === 'string' || typeof t.productId === 'string';
    case 'discount': return true;
    case 'group': return typeof t.name === 'string' && Array.isArray(t.tiles) && t.tiles.every(isTile) && (t.collectionId === undefined || typeof t.collectionId === 'string');
    default: return false;
  }
};

/** Accepts our grid.json (or a JSON string). Unknown tiles are dropped and counted, never fatal. */
export function parseGrid(input: unknown): { grid: Grid; dropped: number } {
  const raw = typeof input === 'string' ? JSON.parse(input) : (input as any);
  if (!raw || raw.version !== 1 || !Array.isArray(raw.pages)) throw new Error('Not a grid.json (expected {"version":1,"pages":[…]}).');
  let dropped = 0;
  const pages: GridPage[] = raw.pages.map((p: any, i: number) => {
    const tiles = (Array.isArray(p?.tiles) ? p.tiles : []).filter((t: any) => (isTile(t) ? true : (dropped++, false)));
    return { id: String(p?.id ?? uid()), name: String(p?.name ?? `Page ${i + 1}`), tiles };
  });
  if (!pages.length) pages.push({ id: uid(), name: 'Home', tiles: [] });
  return { grid: { version: 1, pages }, dropped };
}
export const serialiseGrid = (g: Grid) => JSON.stringify(g, null, 2);

// immutable helpers used by the Edit-grid screen
export const addPage = (g: Grid, name: string): Grid => ({ ...g, pages: [...g.pages, { id: uid(), name, tiles: [] }] });
export const movePage = (g: Grid, from: number, to: number): Grid => {
  const pages = [...g.pages]; if (to < 0 || to >= pages.length) return g;
  const [p] = pages.splice(from, 1); pages.splice(to, 0, p); return { ...g, pages };
};
export const removePage = (g: Grid, id: string): Grid => (g.pages.length > 1 ? { ...g, pages: g.pages.filter(p => p.id !== id) } : g);
export const renamePage = (g: Grid, id: string, name: string): Grid => ({ ...g, pages: g.pages.map(p => (p.id === id ? { ...p, name } : p)) });
export const addTile = (g: Grid, pageId: string, t: Tile): Grid => ({ ...g, pages: g.pages.map(p => (p.id === pageId ? { ...p, tiles: [...p.tiles, t] } : p)) });
export const removeTile = (g: Grid, pageId: string, idx: number): Grid => ({ ...g, pages: g.pages.map(p => (p.id === pageId ? { ...p, tiles: p.tiles.filter((_, i) => i !== idx) } : p)) });
export const moveTile = (g: Grid, pageId: string, from: number, to: number): Grid => ({
  ...g, pages: g.pages.map(p => { if (p.id !== pageId || to < 0 || to >= p.tiles.length) return p; const t = [...p.tiles]; const [x] = t.splice(from, 1); t.splice(to, 0, x); return { ...p, tiles: t }; }),
});
