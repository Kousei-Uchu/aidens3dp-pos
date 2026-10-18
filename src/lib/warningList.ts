// Location: src/lib/warningList.ts
// The warning list: warnings set to "Add to the list" (Settings ▸ Cart warnings) are recorded here instead of being
// shown on Charge, so someone can read them later from a Quick Menu tile or the cart menu - "someone bought an item
// from a fixed number display, put another out". Pure, so it is testable in tests/warninglist.test.ts. Putting the
// entries into the store and sharing them with the other registers lives in src/lib/sync.ts.
import { uid } from './ids';
import { matchCartWarnings, warningTitle, warningVars, type CartWarningCatalog } from './cartWarnings';
import { renderTemplate } from './textTemplates';
import type { Cart, CartWarning, WarningListEntry } from './types';

/** How many lines the list keeps before the oldest are dropped. */
export const MAX_LIST_ENTRIES = 200;

/**
 * The lines this sale adds to the list: one for each warning that applies to the cart and is set to "Add to the list".
 * The message is rendered now, with the item's name filled in, so the list reads the same later even if the warning is
 * edited. Returns them newest first.
 */
export function buildWarningListEntries(cart: Cart, warnings: CartWarning[] | undefined, cat: CartWarningCatalog, o: {
  staff?: string; register?: string; cartTotalCents?: number; now?: Date; newId?: () => string;
} = {}): WarningListEntry[] {
  const now = o.now ?? new Date(); const ts = now.toISOString(); const newId = o.newId ?? uid;
  return matchCartWarnings(cart, warnings, cat)
    .filter(m => m.warning.mode === 'queue')
    .map(m => {
      const vars = warningVars(m, { cat, cart, staff: o.staff, register: o.register, cartTotalCents: o.cartTotalCents, now });
      return {
        id: newId(), ts, warningId: m.warning.id, title: warningTitle(m.warning),
        message: renderTemplate(m.warning.body, vars), items: Array.from(new Set(m.matches.map(x => x.title))),
        staff: o.staff, register: o.register,
      };
    });
}

/**
 * The list with entries another register added folded in, newest first and capped. Entries are matched by id, so the
 * same sale recorded on two registers is never listed twice and nothing already there is lost.
 */
export function mergeWarningList(local: WarningListEntry[] | undefined, remote: WarningListEntry[] | undefined): WarningListEntry[] {
  const byId = new Map<string, WarningListEntry>();
  for (const e of [...(local ?? []), ...(remote ?? [])]) if (e && typeof e.id === 'string' && e.id && !byId.has(e.id)) byId.set(e.id, e);
  return Array.from(byId.values()).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, MAX_LIST_ENTRIES);
}
