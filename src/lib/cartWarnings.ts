// Location: src/lib/cartWarnings.ts
// Cart warnings: prompts the cashier sees on Charge, before payment, when the cart holds a configured item or
// category (or on every sale, for a warning set to always show), and the list of warnings that were queued instead.
// Pure, so it is testable.
import type { Cart, CartWarning, CartWarningScope, Variant } from './types';
import { fmt } from './money';
import { type TemplateVars } from './textTemplates';

export type CartWarningMatch = { lineId: string; title: string; variantId?: string; productId?: string };
export type MatchedCartWarning = { warning: CartWarning; matches: CartWarningMatch[] };
export type CartWarningCatalog = { variants: Record<string, Variant>; collectionsOfProduct: Record<string, string[]> };

/** `category` is another name for `collection`. */
export const normaliseScope = (s: CartWarningScope): 'variant' | 'product' | 'collection' => (s === 'category' ? 'collection' : s);

/** What a person sees as the warning's header when they left it blank. */
export const DEFAULT_WARNING_TITLE = 'Customer Warning';
export const warningTitle = (w: Pick<CartWarning, 'title'>): string => w.title.trim() || DEFAULT_WARNING_TITLE;

/**
 * The warnings that apply to this cart, in the order they should be shown. A warning applies when it is on and either
 * set to always show, or one of its item lines is the variant, product or collection it is for. Gift cards and custom
 * amounts never trigger one.
 */
export function matchCartWarnings(cart: Cart, warnings: CartWarning[] | undefined, catalog: CartWarningCatalog): MatchedCartWarning[] {
  const result: Array<MatchedCartWarning & { at: number }> = [];
  (warnings ?? []).forEach((w, at) => {
    if (!w.enabled) return;
    if (!w.alwaysShow && !w.targetId) return;
    const matches: CartWarningMatch[] = [];
    if (w.targetId) {
      const scope = normaliseScope(w.scope);
      for (const line of cart.lines) {
        if (line.kind !== 'item' || !line.variantId) continue;
        const v = catalog.variants[line.variantId];
        if (!v) continue;
        const hit = scope === 'variant' ? v.id === w.targetId
          : scope === 'product' ? v.productId === w.targetId
          : (catalog.collectionsOfProduct[v.productId] ?? []).includes(w.targetId);
        if (hit) matches.push({ lineId: line.id, title: line.title, variantId: line.variantId, productId: v.productId });
      }
    }
    if (matches.length > 0 || w.alwaysShow) result.push({ warning: w, matches, at });
  });
  return result.sort((a, b) => (a.warning.order ?? 0) - (b.warning.order ?? 0) || a.at - b.at).map(({ warning, matches }) => ({ warning, matches }));
}

/** Names of the items that set a warning off, each once, for "Triggered by". */
export const triggerNames = (m: MatchedCartWarning): string[] => Array.from(new Set(m.matches.map(x => x.title)));

/**
 * Fingerprint of one warning as it applies to this sale. Editing the warning, or changing which lines set it off,
 * changes it, so a warning already seen comes back when it is different.
 */
export const warningKey = (m: MatchedCartWarning): string =>
  [m.warning.id, m.matches.map(x => x.lineId).sort().join(','), warningTitle(m.warning), m.warning.body, m.warning.requireAcknowledgement ? '1' : '0'].join('|');

/**
 * The warnings to show now: those not yet seen on this sale, plus every one set to always show (those come up on each
 * press of Charge). `seen` holds the `warningKey` of each warning the cashier already carried on from.
 */
export const pendingCartWarnings = (matched: MatchedCartWarning[], seen: string[]): MatchedCartWarning[] =>
  matched.filter(m => m.warning.alwaysShow || !seen.includes(warningKey(m)));

/** The pages (by key) that still need ticking before payment can start, given what the cashier has ticked. */
export const unacknowledged = (pages: MatchedCartWarning[], ticked: string[]): MatchedCartWarning[] =>
  pages.filter(m => m.warning.requireAcknowledgement && !ticked.includes(warningKey(m)));

// ── templates ───────────────────────────────────────────────────────────────
/**
 * The values a warning can put in `{{ … }}` (see `textTemplates.ts`): the first item that set it off, the sale it is
 * about, and who is on the till. Names are lower case, which is how `renderTemplate` looks them up. When several items
 * set one warning off, the templates use the first and the popup or list still shows all of their names.
 */
export function warningVars(m: MatchedCartWarning | undefined, o: {
  cat: CartWarningCatalog; cart?: Cart; staff?: string; register?: string; cartTotalCents?: number; now?: Date;
}): TemplateVars {
  const first = m?.matches[0]; const v = first?.variantId ? o.cat.variants[first.variantId] : undefined;
  const line = first ? o.cart?.lines.find(l => l.id === first.lineId) : undefined;
  const qty = (m?.matches ?? []).reduce((n, x) => n + (o.cart?.lines.find(l => l.id === x.lineId)?.qty ?? 0), 0);
  const now = o.now ?? new Date();
  const time = (() => { try { return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } })();
  const date = (() => { try { return now.toLocaleDateString(); } catch { return ''; } })();
  return {
    'item.name': line ? [line.title].filter(Boolean).join(' · ') : (first?.title ?? ''),
    'item.product': v?.productTitle ?? '',
    'item.variant': v?.variantTitle ?? '',
    'item.sku': v?.sku ?? '',
    'item.price': fmt(line ? (line.overrideCents ?? line.unitCents) : (v?.priceCents ?? 0)),
    qty: String(qty),
    'cart.total': fmt(o.cartTotalCents ?? 0),
    staff: o.staff ?? '',
    register: o.register ?? '',
    time, date,
  };
}
