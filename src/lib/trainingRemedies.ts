// Location: src/lib/trainingRemedies.ts
// For each way a person can stray in a Guide step or a Check (see trainingCourse.ts), the module that teaches the fix and the plain steps to do it.
// When someone strays, the card shows these steps straight away if they have not finished that module. If they have, the card offers a small
// "How do I do this?" button, so a person who did the module a while ago is never stuck. Pure, tested (tests/trainingremedies.test.ts).
import type { DeviationKind } from './trainingCourse';

/** The modules that are planned, with the titles the hub will show. A module that is not built yet still has a title here, so a remedy can name it. The built ones win (see `moduleTitle`). */
export const PLANNED_TITLES: Record<string, string> = {
  welcome: 'How training works',
  'sign-in': 'Sign in, lock and switch staff',
  cart: 'Build a cart',
  'find-items': 'Find the right item',
  discounts: 'Discounts',
  'price-adjust': 'Change a price',
  customer: 'Customers and notes',
  'pay-card': 'Take a card payment',
};
export type Remedy = { module?: string; how: string[] };
/** `module` is where the skill is taught. Left out, there is nothing to learn: the only fix is starting the part again. */
export const REMEDIES: Record<Exclude<DeviationKind, 'watch'>, Remedy> = {
  sale: { how: ['Tap Start this part again.', 'The practice till goes back to how this part began.'] },
  tender: { how: ['Tap Start this part again.', 'The practice till goes back to how this part began.'] },
  place: { module: 'welcome', how: ['Use the tabs along the bottom to change screen.', 'On a page you opened, tap Back at the top left to return.'] },
  sheet: { module: 'welcome', how: ['Tap Close at the top of the window.'] },
  lost: { module: 'cart', how: ['Find the item on the grid.', 'Tap its tile once to add it back.'] },
  extra: { module: 'cart', how: ['Open the cart. On a phone it is the bar at the bottom.', 'Swipe the line you do not want to the left.', 'Tap Remove.'] },
  qty: { module: 'cart', how: ['Open the cart. On a phone it is the bar at the bottom.', 'Tap the line to open it.', 'Tap the minus button until the quantity is right. Or swipe the line to the left and tap Remove to take it out.'] },
  discount: { module: 'discounts', how: ['Open the cart.', 'For a discount on one line, tap the line, tap Discount and take it off.', 'For a discount on the whole cart, tap the three dots, tap Apply cart discount and take it off.'] },
  adjust: { module: 'price-adjust', how: ['Open the cart and tap the line.', 'Tap Item price adjustment or Line price adjustment, then tap Remove.', 'For a whole order price, tap the three dots in the cart, tap Whole order price, then tap Remove adjustment.'] },
  customer: { module: 'customer', how: ['Open the cart.', 'Tap the small x next to the customer name at the top.'] },
  note: { module: 'customer', how: ['Open the cart.', 'Tap the line the note is on, clear the note, then tap Done.'] },
};

/** What a stray shows about its fix. `how` is empty for a module's own `watch` rule that wrote none. */
export type Teach = { how: string[]; taught?: { id: string; title: string } };
export function remedyOf(kind: DeviationKind, own?: { how?: string[]; taughtIn?: string }): { how: string[]; taughtIn?: string } {
  if (kind === 'watch') return { how: own?.how ?? [], taughtIn: own?.taughtIn };
  const r = REMEDIES[kind]; return { how: r.how, taughtIn: r.module };
}
/** A built module's own title wins; otherwise the planned one; otherwise the id itself so nothing is ever blank. */
export const moduleTitle = (id: string, built?: { title: string }): string => built?.title ?? PLANNED_TITLES[id] ?? id;
/** Show the steps at once when the person has not finished the module that teaches this (or nothing teaches it). Otherwise they wait behind the "How do I do this?" button. */
export const showHowAtOnce = (taughtIn: string | undefined, done: boolean): boolean => !taughtIn || !done;
