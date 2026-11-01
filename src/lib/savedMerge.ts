// Location: src/lib/savedMerge.ts
// CloudKit patch 5 (saved carts with conflict merging). Pure code: how a saved cart read from the shared store is turned into a
// SavedCart, and what happens when this register and another have both changed the same cart. It serves both backends, since saved
// carts go through the shared-state seam, so the metaobject path gets the same fixes.
//
// The rules, in the order they apply (guesses 1 to 4 in dev_docs/GUESSES.md, 'Saved carts'):
//  1. A deleted (void) cart stays deleted. A void from another register beats an unsent edit here, so a cart that was sold or thrown
//     away is not brought back by a late save. A delete made here is sent over any edit another register made.
//  2. A cart nobody here has changed takes the shared copy when that is the same version or newer.
//  3. A cart changed here that nobody else has touched since we last saw it is just sent.
//  4. A cart changed both here and elsewhere is merged in three groups, each judged against `base` (what both sides last agreed):
//     the name and note, who it is assigned to, and the contents (lines, discount, customer). A group only one side changed takes
//     that side's change. A group both changed takes the later edit (`updatedAt`), the shared copy on a tie.
import type { SavedCart } from '../state/store';
import type { Cart } from './types';
import type { BackendRow } from './syncBackend';

type Groups = { info: string; assign: string; contents: string };
const j = (v: unknown): string => JSON.stringify(v ?? null);

/** A cart's content as three comparable strings. Undefined parts drop out of JSON, so a cart and its read-back copy compare equal. */
export function groupsOf(c: SavedCart): Groups {
  return { info: j([c.name, c.note ?? null]), assign: j(c.assignedTo ?? null), contents: j([c.cart.lines, c.cart.discount ?? null, c.cart.customer ?? null]) };
}
/** What `SavedCart.base` holds: the content both sides last agreed on. */
export const baseOf = (c: SavedCart): string => JSON.stringify(groupsOf(c));

function parseBase(s: string | undefined): Groups | null {
  if (!s) return null;
  try { const g = JSON.parse(s); return g && typeof g.info === 'string' && typeof g.assign === 'string' && typeof g.contents === 'string' ? g : null; } catch { return null; }
}

function withGroups(c: SavedCart, g: Groups): SavedCart {
  const [name, note] = JSON.parse(g.info); const [lines, discount, customer] = JSON.parse(g.contents);
  return { ...c, name: name ?? '', note: note ?? undefined, assignedTo: JSON.parse(g.assign) ?? undefined, cart: { ...c.cart, lines: lines ?? [], discount: discount ?? undefined, customer: customer ?? undefined } };
}

/** A shared row as a SavedCart, or null when it cannot be read. One bad record must not stop the others coming in. */
export function parseSavedRow(row: BackendRow): SavedCart | null {
  try {
    const f = row.f; const id = f.cart_uuid || String(row.handle ?? '').replace(/^cart-/, ''); if (!id) return null;
    const lines = f.lines_json ? JSON.parse(f.lines_json) : []; if (!Array.isArray(lines)) return null;
    const cart: Cart = { id, lines, discount: f.discount_json ? JSON.parse(f.discount_json) : undefined, customer: f.customer_json ? JSON.parse(f.customer_json) : undefined };
    return {
      id, name: f.name ?? '', note: f.note || undefined, cart, ts: f.created_at || row.updatedAt, employee: f.employee || undefined,
      status: f.status === 'void' ? 'void' : 'open', assignedTo: f.status?.startsWith('assigned:') ? f.status.slice(9) : undefined,
      remoteId: row.id, version: Number(f.version) || 1, updatedAt: f.updated_at || row.updatedAt,
    };
  } catch { return null; }
}

export type Merged = {
  /** What to keep here, or null to drop the cart from this register. */
  cart: SavedCart | null;
  /** Whether the kept cart still has to be sent. */
  push: boolean;
};

const clean = (c: SavedCart): SavedCart => ({ ...c, dirty: false, base: baseOf(c) });

export function mergeSaved(local: SavedCart | undefined, remote: SavedCart): Merged {
  if (remote.status === 'void') return { cart: null, push: false };                                   // rule 1
  if (!local) return { cart: clean(remote), push: false };
  const lv = local.version ?? 0, rv = remote.version ?? 0;
  if (local.status === 'void') return local.dirty ? { cart: { ...local, version: Math.max(lv, rv) }, push: true } : { cart: null, push: false };
  if (!local.dirty) return rv >= lv ? { cart: clean(remote), push: false } : { cart: local, push: false }; // rule 2
  if (rv <= lv) return { cart: local, push: true };                                                    // rule 3
  const base = parseBase(local.base); const l = groupsOf(local); const r = groupsOf(remote);          // rule 4
  const lt = Date.parse(local.updatedAt ?? '') || 0; const rt = Date.parse(remote.updatedAt ?? '') || 0;
  const pick = (k: keyof Groups): string =>
    l[k] === r[k] ? l[k] : base && l[k] === base[k] ? r[k] : base && r[k] === base[k] ? l[k] : lt > rt ? l[k] : r[k];
  const merged = withGroups({ ...remote }, { info: pick('info'), assign: pick('assign'), contents: pick('contents') });
  if (baseOf(merged) === baseOf(remote)) return { cart: clean(remote), push: false };                  // everything here was already there
  return { cart: { ...merged, dirty: true, version: rv, base: baseOf(remote), updatedAt: local.updatedAt ?? remote.updatedAt }, push: true };
}

/** The saved carts here after reading the shared list, newest first, and whether any still need sending. */
export function applyPulled(local: SavedCart[], rows: BackendRow[]): { next: SavedCart[]; push: boolean } {
  const next = [...local]; let push = false;
  for (const row of rows) {
    const remote = parseSavedRow(row); if (!remote) continue;
    const i = next.findIndex(c => c.id === remote.id);
    const m = mergeSaved(i >= 0 ? next[i] : undefined, remote);
    if (!m.cart) { if (i >= 0) next.splice(i, 1); continue; }
    if (m.push) push = true;
    if (i >= 0) next[i] = m.cart; else next.push(m.cart);
  }
  return { next: next.sort((a, b) => b.ts.localeCompare(a.ts)), push };
}
