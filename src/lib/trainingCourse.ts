// Location: src/lib/trainingCourse.ts
// Check stages: spots when a person has gone off course and says how to get back. Pure, tested (tests/trainingcourse.test.ts).
//
// How it works. When a goal starts, the driver remembers what the practice till looked like (the baseline). From then on it compares the till with that baseline.
// Anything the goal did not say may change (`allow`), and anywhere the goal does not happen (`at`), counts as off course. On top of that a module can add
// its own `watch` rules for mistakes specific to one goal. Every deviation says what happened, how to undo it, and which control to point at.
// Some cannot be undone with a tap (a finished sale), and for those, and for anything the person cannot work out, "Start this part again" puts the
// practice till back exactly as the goal began. So nobody can ever get stuck.
import type { Allow, Goal, SnapLine, TrainSnap } from './trainingModule';
import { SPOT, cartLineSpot, gridItemSpot } from './trainingSpots';

export type DeviationKind = 'sale' | 'watch' | 'place' | 'sheet' | 'lost' | 'extra' | 'qty' | 'discount' | 'adjust' | 'customer' | 'note' | 'tender';
export type Deviation = {
  /** Stable while the same mistake continues, so the driver can tell "still the same problem" from "a new one". */
  id: string; kind: DeviationKind;
  title: string; say: string;
  /** What to point at, and what to point at first when that is not on screen (for example the bar that opens the cart on a phone). */
  target?: string; via?: string;
  /** `undo`: the person can put it right with the control pointed at. `restart`: only starting this part again fixes it. */
  fix: 'undo' | 'restart';
};

/** The tabs and pages a goal's work happens on, falling back to the module's own. */
export type CourseFrame = { tabs: readonly string[]; routes: readonly string[] };

const keyOf = (l: SnapLine): string => l.variantId ?? `${l.kind}:${l.title}`;
const tally = (lines: readonly SnapLine[]): Map<string, { qty: number; line: SnapLine }> => {
  const m = new Map<string, { qty: number; line: SnapLine }>();
  for (const l of lines) { const k = keyOf(l); const cur = m.get(k); m.set(k, { qty: (cur?.qty ?? 0) + l.qty, line: cur?.line ?? l }); }
  return m;
};
const name = (l: SnapLine): string => l.title || 'item';
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The first thing wrong with where the person is now, compared with where the goal began. Null means they are on course. Pure. */
export function diagnose(goal: Pick<Goal, 'allow' | 'at' | 'watch'>, frame: CourseFrame, base: TrainSnap, now: TrainSnap): Deviation | null {
  const allow = new Set<Allow>(goal.allow ?? []);

  // A finished sale cannot be undone.
  if (now.sales > base.sales && !allow.has('sale')) {
    return { id: 'sale', kind: 'sale', fix: 'restart', title: 'That sale went through', say: 'A sale was completed, and this part did not need one. Tap Start this part again to set it up fresh.' };
  }

  // Mistakes the module author knows about.
  for (const w of goal.watch ?? []) { let hit = false; try { hit = !!w.when(now); } catch { hit = false; } if (hit) return { id: `watch:${w.id}`, kind: 'watch', fix: 'undo', title: 'Not quite', say: w.say, target: w.target, via: w.via }; }

  // The wrong place.
  const tabs = goal.at?.tabs ?? frame.tabs; const routes = goal.at?.routes ?? frame.routes;
  if (!tabs.includes(now.tab)) {
    return { id: 'place:tab', kind: 'place', fix: 'undo', title: 'Wrong screen', say: tabs.includes('checkout') ? 'That is not where this part happens. Tap Checkout to go back.' : 'That is not where this part happens. Tap the tab for this task to go back.', target: tabs.includes('checkout') ? SPOT.tabCheckout : undefined };
  }
  if (now.route && !routes.includes(now.route)) {
    return { id: `place:route:${now.route}`, kind: 'place', fix: 'undo', title: 'Wrong screen', say: 'This screen is not part of this task. Tap Back to return.', target: SPOT.back };
  }
  if (goal.at?.sheets === false && now.sheets > 0) {
    return { id: 'sheet', kind: 'sheet', fix: 'undo', title: 'Not needed here', say: 'This task does not need this window. Close it to carry on.', target: SPOT.sheetClose };
  }

  // The cart.
  const was = tally(base.cart); const is = tally(now.cart);
  for (const [k, b] of was) {
    const n = is.get(k)?.qty ?? 0;
    if (n < b.qty && !(allow.has('remove') && n === 0) && !(allow.has('qty') && n > 0)) {
      const l = b.line; const gone = n === 0;
      return { id: `lost:${k}`, kind: 'lost', fix: 'undo', title: gone ? `${name(l)} was taken out` : `${name(l)} was reduced`, say: gone ? `This sale still needs the ${name(l)}. Tap its tile to add it back.` : `This sale needs ${plural(b.qty, name(l))}. Tap its tile to add one back.`, target: l.variantId ? gridItemSpot(l.variantId) : undefined };
    }
  }
  for (const [k, c] of is) {
    const b = was.get(k)?.qty ?? 0; const l = c.line; const target = l.variantId ? cartLineSpot(l.variantId) : undefined;
    if (b === 0 && !allow.has('add')) {
      return { id: `extra:${k}`, kind: 'extra', fix: 'undo', title: `${name(l)} was added`, say: `The ${name(l)} is not part of this task. Swipe its line to the left, then tap Remove.`, target, via: SPOT.cartOpen };
    }
    const wanted = b === 0 ? 1 : b;
    if (c.qty > wanted && !allow.has('qty')) {
      const extra = c.qty - wanted;
      return { id: `qty:${k}`, kind: 'qty', fix: 'undo', title: `Too many ${name(l)}`, say: b === 0 ? `You have ${c.qty} of the ${name(l)}, and one is enough here. Take ${extra === 1 ? 'one' : plural(extra, 'unit')} out.` : `The ${name(l)} was only meant to be ${b}. Take ${extra === 1 ? 'one' : plural(extra, 'unit')} out.`, target, via: SPOT.cartOpen };
    }
  }

  // Things added to the sale that the goal did not ask for.
  const lineNow = (f: (l: SnapLine) => boolean): SnapLine | undefined => now.cart.find(f);
  if (!allow.has('discount')) {
    const newLine = lineNow(l => l.discounted && !base.cart.some(b => keyOf(b) === keyOf(l) && b.discounted));
    if ((now.cartDiscount && !base.cartDiscount) || newLine) return { id: 'discount', kind: 'discount', fix: 'undo', title: 'A discount was added', say: 'This task does not use a discount. Open the discount and remove it.', target: newLine?.variantId ? cartLineSpot(newLine.variantId) : undefined, via: SPOT.cartOpen };
  }
  if (!allow.has('adjust')) {
    const newLine = lineNow(l => l.adjusted && !base.cart.some(b => keyOf(b) === keyOf(l) && b.adjusted));
    if ((now.orderAdjusted && !base.orderAdjusted) || newLine) return { id: 'adjust', kind: 'adjust', fix: 'undo', title: 'A price was changed', say: 'This task does not change any prices. Open the item or the order price and remove the adjustment.', target: newLine?.variantId ? cartLineSpot(newLine.variantId) : undefined, via: SPOT.cartOpen };
  }
  if (!allow.has('customer') && now.hasCustomer && !base.hasCustomer) return { id: 'customer', kind: 'customer', fix: 'undo', title: 'A customer was added', say: 'This task does not need a customer on the sale. Open the cart and take the customer off.', via: SPOT.cartOpen };
  if (!allow.has('note') && now.hasNote && !base.hasNote) return { id: 'note', kind: 'note', fix: 'undo', title: 'A note was added', say: 'This task does not need a note. Open the cart and clear the note.', via: SPOT.cartOpen };
  if (!allow.has('tender') && now.tenders > base.tenders) return { id: 'tender', kind: 'tender', fix: 'restart', title: 'A payment was started', say: 'A payment was started that this part did not need. Tap Start this part again to set it up fresh.' };
  return null;
}

/** A deviation must keep happening this long before the person is told, so the moment between two taps of a normal path is never flagged. */
export const STRAY_GRACE_MS = 900;
/** After this long off course the dock offers "Start this part again" even for mistakes that can be undone by hand. */
export const STRAY_OFFER_RESTART_MS = 12_000;

export type StrayTracker = { id: string | null; since: number };
export const freshStray = (): StrayTracker => ({ id: null, since: 0 });
/** Feed it the latest diagnosis. It says what to show (nothing until the grace has passed) and whether to offer starting again. */
export function trackStray(t: StrayTracker, d: Deviation | null, now: number): { tracker: StrayTracker; show: Deviation | null; offerRestart: boolean } {
  if (!d) return { tracker: freshStray(), show: null, offerRestart: false };
  const same = t.id === d.id; const tracker = same ? t : { id: d.id, since: now }; const age = now - tracker.since;
  return { tracker, show: age >= STRAY_GRACE_MS ? d : null, offerRestart: d.fix === 'restart' || age >= STRAY_OFFER_RESTART_MS };
}
