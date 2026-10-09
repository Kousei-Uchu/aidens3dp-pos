import { useApp, type SavedCart } from '../state/store';
import { mergeCarts, emptyCart } from './cartOps';
import { confirm } from '../ui/kit';
import { updateSaved } from './sync';

/** Open a saved cart: into an empty cart directly, otherwise ask "Merge Carts?". */
export async function openSavedCart(sc: SavedCart): Promise<boolean> {
  const s = useApp.getState(); const cur = s.pos.cart;
  if (cur.tenders?.length) { await confirm('Payment in progress', 'Finish or cancel the current payment first.', 'OK'); return false; }
  if (cur.lines.length) {
    if (!(await confirm('Merge Carts?', `Add the items from “${sc.name}” to the current cart?`, 'Merge'))) return false;
    s.setCart(mergeCarts(cur, sc.cart, s.settings.consolidate)); return true;
  }
  s.setCart({ ...emptyCart(), ...sc.cart, id: cur.id, savedFrom: sc.id, tenders: undefined, saleUuid: undefined });
  return true;
}
export const deleteSavedCart = (id: string) => updateSaved(id, { status: 'void' });
export const assignSavedCart = (id: string, to: string | undefined) => updateSaved(id, { assignedTo: to });
