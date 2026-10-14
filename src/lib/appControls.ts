// Location: src/lib/appControls.ts
// Every control training can point at, and where on the graph it lives. The graph itself (src/app.navgraph) holds the
// screens and the way between them. This file holds the control level: which screen a control is on, and how it is
// used (a tap, a hold, a swipe). Guidance reads it to answer "the fix is that control, where is it?".
//
// It is deliberately a plain table: it never touches React or the DOM, so it is testable and it cannot change how
// anything looks. The tests in tests/appnavgraph.test.ts check that every spot in trainingSpots.ts has a home here.
import { SPOT, DYNAMIC_PREFIXES } from './trainingSpots';
import type { Gesture } from './pointerGesture';

/** A control's place on the graph: the screen it lives on, and how a person uses it. */
export type ControlPlace = { screen: string; gesture?: Gesture };

/**
 * Where each static spot lives. Universal controls (`page.back`, `sheet.close`) are not listed: they are always on
 * screen in the place they are used, so guidance never needs to walk to them.
 *
 * Checkout domain controls all sit on the Checkout tab, because the cart is part of Checkout (inline on a wide
 * screen, a pushed page on a phone, which base guidance already copes with). Payment and refund controls sit on the
 * pages that own them.
 */
export const SPOT_SCREEN: Record<string, string> = {
  // Checkout tab: the grid, search, the cart and everything opened from it.
  [SPOT.cartCharge]: 'tab_checkout',
  [SPOT.cartOpen]: 'tab_checkout',
  [SPOT.tabCheckout]: 'tab_checkout',
  [SPOT.findSearch]: 'tab_checkout',
  [SPOT.findTabs]: 'tab_checkout',
  [SPOT.findBack]: 'tab_checkout',
  [SPOT.findFilter]: 'view_all',
  [SPOT.findKeypad]: 'view_keypad',
  [SPOT.findKeypadAdd]: 'view_keypad',
  [SPOT.searchField]: 'tab_checkout',
  [SPOT.cartMenu]: 'tab_checkout',
  [SPOT.cartMenuDiscount]: 'tab_checkout',
  [SPOT.cartMenuOrder]: 'tab_checkout',
  [SPOT.cartDiscountOff]: 'tab_checkout',
  [SPOT.cartOrderOff]: 'tab_checkout',
  [SPOT.cartCustomerOff]: 'tab_checkout',
  [SPOT.cartCustomer]: 'tab_checkout',
  [SPOT.customerSearch]: 'tab_checkout',
  [SPOT.customerCreate]: 'tab_checkout',
  [SPOT.customerForm]: 'tab_checkout',
  [SPOT.customerSave]: 'tab_checkout',
  [SPOT.discountKeys]: 'tab_checkout',
  [SPOT.discountApply]: 'tab_checkout',
  [SPOT.priceItemKeys]: 'tab_checkout',
  [SPOT.priceItemSet]: 'tab_checkout',
  [SPOT.priceLineKeys]: 'tab_checkout',
  [SPOT.priceLineSet]: 'tab_checkout',
  [SPOT.priceOrderKeys]: 'tab_checkout',
  [SPOT.priceOrderSet]: 'tab_checkout',
  [SPOT.priceReason]: 'tab_checkout',
  [SPOT.priceScopeQty]: 'tab_checkout',
  [SPOT.priceScopeAll]: 'tab_checkout',
  [SPOT.reviewContinue]: 'tab_checkout',
  [SPOT.reviewKeep]: 'tab_checkout',
  [SPOT.reviewAdjust]: 'tab_checkout',
  [SPOT.reviewRemove]: 'tab_checkout',
  [SPOT.cartBundles]: 'tab_checkout',
  [SPOT.cartDeals]: 'tab_checkout',
  [SPOT.bundleContinue]: 'tab_checkout',
  [SPOT.bundleEdit]: 'tab_checkout',
  [SPOT.lineDone]: 'tab_checkout',
  [SPOT.scanCamera]: 'tab_checkout',
  [SPOT.scanDone]: 'tab_checkout',
  [SPOT.scanResult]: 'tab_checkout',
  // More tab.
  [SPOT.tabMore]: 'tab_more',
  [SPOT.moreTraining]: 'tab_more',
  [SPOT.moreOrders]: 'tab_more',
  [SPOT.switchLock]: 'tab_more',
  // Payment page.
  [SPOT.payTotal]: 'page_pay',
  [SPOT.payCash]: 'page_pay',
  [SPOT.payGift]: 'page_pay',
  [SPOT.paySplit]: 'page_pay',
  [SPOT.payCard]: 'page_pay',
  [SPOT.payRetry]: 'page_pay',
  [SPOT.payOther]: 'page_pay',
  [SPOT.receiptNone]: 'page_pay',
  [SPOT.receiptQr]: 'page_pay',
  [SPOT.receiptEmail]: 'page_pay',
  [SPOT.receiptText]: 'page_pay',
  [SPOT.receiptShare]: 'page_pay',
  [SPOT.receiptQrBack]: 'page_pay',
  [SPOT.cashPad]: 'page_pay',
  [SPOT.cashUndo]: 'page_pay',
  [SPOT.cashTake]: 'page_pay',
  [SPOT.cashNext]: 'page_pay',
  [SPOT.cashGave]: 'page_pay',
  [SPOT.cashSmaller]: 'page_pay',
  [SPOT.cashPartCash]: 'page_pay',
  [SPOT.terminalTap]: 'page_pay',
  [SPOT.terminalInsert]: 'page_pay',
  [SPOT.terminalRemove]: 'page_pay',
  [SPOT.terminalPinpad]: 'page_pay',
  [SPOT.terminalPinOk]: 'page_pay',
  [SPOT.terminalCancel]: 'page_pay',
  [SPOT.terminalDone]: 'page_pay',
  // Orders and refunds.
  [SPOT.ordersRefund]: 'page_orders',
  [SPOT.refundMode]: 'page_orders',
  [SPOT.refundMethod]: 'page_orders',
  [SPOT.refundRestock]: 'page_orders',
  [SPOT.refundReplace]: 'page_orders',
  [SPOT.refundGo]: 'page_orders',
  [SPOT.refundDone]: 'page_orders',
  // Sign in and passes.
  [SPOT.loginPinpad]: 'overlay_lock',
  [SPOT.loginUnlock]: 'overlay_lock',
  [SPOT.loginScanPass]: 'overlay_lock',
  [SPOT.passScan]: 'overlay_lock',
};

/** Where each dynamic (per record) spot lives, by its id prefix. */
export const PREFIX_SCREEN: { prefix: string; screen: string }[] = [
  { prefix: 'grid.item:', screen: 'tab_checkout' },
  { prefix: 'grid.cat:', screen: 'tab_checkout' },
  { prefix: 'grid.action:', screen: 'tab_checkout' },
  { prefix: 'grid.page:', screen: 'tab_checkout' },
  { prefix: 'cart.line:', screen: 'tab_checkout' },
  { prefix: 'cart.deal:', screen: 'tab_checkout' },
  { prefix: 'discount.preset:', screen: 'tab_checkout' },
  { prefix: 'search.result:', screen: 'tab_checkout' },
  { prefix: 'customer.row:', screen: 'tab_checkout' },
  { prefix: 'pick.variant:', screen: 'tab_checkout' },
  { prefix: 'line.minus:', screen: 'tab_checkout' },
  { prefix: 'line.remove:', screen: 'tab_checkout' },
  { prefix: 'line.note:', screen: 'tab_checkout' },
  { prefix: 'line.discount:', screen: 'tab_checkout' },
  { prefix: 'line.discountoff:', screen: 'tab_checkout' },
  { prefix: 'line.price:', screen: 'tab_checkout' },
  { prefix: 'line.priceoff:', screen: 'tab_checkout' },
  { prefix: 'line.adjust:', screen: 'tab_checkout' },
  { prefix: 'line.adjustoff:', screen: 'tab_checkout' },
  { prefix: 'find.tab:', screen: 'tab_checkout' },
  { prefix: 'find.key:', screen: 'view_keypad' },
  { prefix: 'all.product:', screen: 'view_all' },
  { prefix: 'cash.denom:', screen: 'page_pay' },
  { prefix: 'order.row:', screen: 'page_orders' },
  { prefix: 'refund.mode:', screen: 'page_orders' },
  { prefix: 'refund.method:', screen: 'page_orders' },
  { prefix: 'refund.plus:', screen: 'page_orders' },
  { prefix: 'refund.minus:', screen: 'page_orders' },
  { prefix: 'refund.reason:', screen: 'page_orders' },
  { prefix: 'refund.pick:', screen: 'page_orders' },
  { prefix: 'refund.repl:', screen: 'page_orders' },
  { prefix: 'scan.card:', screen: 'overlay_practice_camera' },
];

/** The screen a spot lives on, or undefined when it is universal (always on screen where it is used) or unknown. */
export function screenOfSpot(spot: string): string | undefined {
  if (SPOT_SCREEN[spot]) return SPOT_SCREEN[spot];
  for (const { prefix, screen } of PREFIX_SCREEN) if (spot.startsWith(prefix)) return screen;
  return undefined;
}

/** Controls that are a swipe on a line rather than a tap: a cart line is swiped left to reveal Remove. */
export function gestureOfSpot(spot: string): Gesture {
  if (spot.startsWith('cart.line:')) return 'swipe-left';
  return 'tap';
}

/** True for the spots that are part of the checkout domain (used by tests and by wording). */
export const isCheckoutSpot = (spot: string): boolean => screenOfSpot(spot) === 'tab_checkout';

/** Every dynamic prefix trainingSpots.ts declares must have a screen here, or guidance cannot place it. */
export const prefixScreens = (): Record<string, string> => Object.fromEntries(PREFIX_SCREEN.map(p => [p.prefix, p.screen]));
export const declaredPrefixes = (): readonly string[] => DYNAMIC_PREFIXES;
