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
 * A control sits on the screen it is really on. Page and tab controls sit on their page or tab. A control inside a
 * window sits on that window's screen (`sheet_*`), so when the window is open the walk knows the person is already
 * there instead of telling them to close it. The cart is part of Checkout (inline on a wide screen, a pushed page on
 * a phone), and a cart line's editor is its own per line node (see `lineWindowScreen`).
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
  [SPOT.cartMenuDiscount]: 'sheet_cart_menu',
  [SPOT.cartMenuOrder]: 'sheet_cart_menu',
  [SPOT.cartDiscountOff]: 'tab_checkout',
  [SPOT.cartOrderOff]: 'tab_checkout',
  [SPOT.cartCustomerOff]: 'tab_checkout',
  [SPOT.cartCustomer]: 'tab_checkout',
  [SPOT.customerSearch]: 'sheet_customer',
  [SPOT.customerCreate]: 'sheet_customer',
  [SPOT.customerForm]: 'sheet_customer_new',
  [SPOT.customerSave]: 'sheet_customer_new',
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
  [SPOT.reviewContinue]: 'sheet_review',
  [SPOT.reviewKeep]: 'sheet_review',
  [SPOT.reviewAdjust]: 'sheet_review',
  [SPOT.reviewRemove]: 'sheet_review',
  [SPOT.cartBundles]: 'tab_checkout',
  [SPOT.cartDeals]: 'tab_checkout',
  [SPOT.bundleContinue]: 'sheet_bundles',
  [SPOT.bundleEdit]: 'sheet_bundles',
  [SPOT.lineDone]: 'tab_checkout',
  [SPOT.scanCamera]: 'tab_checkout',
  [SPOT.scanDone]: 'tab_checkout',
  [SPOT.scanResult]: 'tab_checkout',
  [SPOT.lookupSearch]: 'sheet_lookup',
  [SPOT.lookupScan]: 'sheet_lookup',
  [SPOT.lookupClear]: 'sheet_lookup',
  // More tab.
  [SPOT.tabMore]: 'tab_more',
  [SPOT.moreTraining]: 'tab_more',
  [SPOT.moreOrders]: 'tab_more',
  [SPOT.moreSaved]: 'tab_more',
  [SPOT.savedOpen]: 'page_saved',
  [SPOT.switchLock]: 'tab_more',
  // Payment page.
  [SPOT.payTotal]: 'page_pay',
  [SPOT.payCash]: 'page_pay',
  [SPOT.payGift]: 'page_pay',
  [SPOT.paySplit]: 'page_pay',
  [SPOT.payCard]: 'page_pay',
  [SPOT.payRetry]: 'page_pay',
  [SPOT.payOther]: 'page_pay',
  [SPOT.receiptNone]: 'sheet_receipt',
  [SPOT.receiptQr]: 'sheet_receipt',
  [SPOT.receiptEmail]: 'sheet_receipt',
  [SPOT.receiptText]: 'sheet_receipt',
  [SPOT.receiptShare]: 'sheet_receipt',
  [SPOT.receiptQrBack]: 'sheet_receipt',
  [SPOT.cashPad]: 'sheet_cash_receive',
  [SPOT.cashUndo]: 'sheet_cash_receive',
  [SPOT.cashTake]: 'sheet_cash_receive',
  [SPOT.cashNext]: 'sheet_cash_receive',
  [SPOT.cashGave]: 'sheet_cash_give',
  [SPOT.cashSmaller]: 'sheet_cash_receive',
  [SPOT.cashPartCash]: 'sheet_cash_receive',
  [SPOT.splitKeys]: 'sheet_split',
  [SPOT.splitContinue]: 'sheet_split',
  [SPOT.splitCancel]: 'page_pay',
  [SPOT.cartMenuGift]: 'sheet_cart_menu',
  [SPOT.cartMenuSave]: 'sheet_cart_menu',
  [SPOT.savedName]: 'sheet_save_cart',
  [SPOT.savedSave]: 'sheet_save_cart',
  [SPOT.giftKeys]: 'sheet_gift_sell',
  [SPOT.giftNext]: 'sheet_gift_sell',
  [SPOT.giftHow]: 'sheet_gift_sell_details',
  [SPOT.giftEmail]: 'sheet_gift_sell_details',
  [SPOT.giftAdd]: 'sheet_gift_sell_details',
  [SPOT.giftChange]: 'sheet_gift_sell_details',
  [SPOT.giftCheckCode]: 'sheet_gift_check',
  [SPOT.giftCheckScan]: 'sheet_gift_check',
  [SPOT.giftCheckCheck]: 'sheet_gift_check',
  [SPOT.giftCheckUse]: 'sheet_gift_check',
  [SPOT.terminalTap]: 'page_pay',
  [SPOT.terminalInsert]: 'page_pay',
  [SPOT.terminalRemove]: 'page_pay',
  [SPOT.terminalPinpad]: 'page_pay',
  [SPOT.terminalPinOk]: 'page_pay',
  [SPOT.terminalCancel]: 'page_pay',
  [SPOT.terminalDone]: 'page_pay',
  // Orders and refunds.
  [SPOT.ordersRefund]: 'sheet_order',
  [SPOT.ordersTabOpen]: 'page_orders',
  [SPOT.ordersTabUnfulfilled]: 'page_orders',
  [SPOT.ordersTabCompleted]: 'page_orders',
  [SPOT.ordersMarkFulfilled]: 'sheet_order',
  [SPOT.ordersReceipt]: 'sheet_order',
  [SPOT.refundMode]: 'sheet_refund',
  [SPOT.refundMethod]: 'sheet_refund',
  [SPOT.refundRestock]: 'sheet_refund',
  [SPOT.refundReplace]: 'sheet_refund',
  [SPOT.refundGo]: 'sheet_refund',
  [SPOT.refundDone]: 'sheet_refund_done',
  // Cash drawer
  [SPOT.moreDrawer]: 'tab_more',
  [SPOT.drawerOpen]: 'page_drawer',
  [SPOT.drawerPaidIn]: 'page_drawer',
  [SPOT.drawerPaidOut]: 'page_drawer',
  [SPOT.drawerCountClose]: 'page_drawer',
  [SPOT.drawerCorrect]: 'page_drawer',
  [SPOT.drawerFloatReport]: 'page_drawer',
  [SPOT.drawerSwapCash]: 'page_drawer',
  [SPOT.drawerDenom]: 'page_drawer',
  [SPOT.drawerNote]: 'page_drawer',
  [SPOT.drawerConfirm]: 'page_drawer',
  [SPOT.checkChangeAmount]: 'sheet_check_change',
  [SPOT.checkChangeUseCart]: 'sheet_check_change',
  [SPOT.checkChangeContinue]: 'sheet_check_change',
  [SPOT.checkChangeAmountBtn]: 'sheet_check_change',
  [SPOT.checkChangeClose]: 'sheet_check_change',
  [SPOT.swapPad]: 'sheet_drawer_swap',
  [SPOT.swapRecord]: 'sheet_drawer_swap',
  [SPOT.swapClose]: 'sheet_drawer_swap',
  // Sign in and passes.
  [SPOT.loginPinpad]: 'overlay_lock',
  [SPOT.loginUnlock]: 'overlay_lock',
  [SPOT.loginScanPass]: 'overlay_lock',
  [SPOT.passScan]: 'overlay_practice_pass',
  // Inventory: the list, its chips and the item window opened from a row.
  [SPOT.tabInventory]: 'tab_inventory',
  [SPOT.invSearch]: 'tab_inventory',
  [SPOT.invFilters]: 'tab_inventory',
  [SPOT.invLayout]: 'tab_inventory',
  [SPOT.invModes]: 'sheet_inventory_product',
  [SPOT.invSign]: 'sheet_inventory_product',
  [SPOT.invKeys]: 'sheet_inventory_product',
  [SPOT.invApply]: 'sheet_inventory_product',
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
  { prefix: 'customer.row:', screen: 'sheet_customer' },
  { prefix: 'pick.variant:', screen: 'tab_checkout' },
  { prefix: 'find.tab:', screen: 'tab_checkout' },
  { prefix: 'find.key:', screen: 'view_keypad' },
  { prefix: 'all.product:', screen: 'view_all' },
  { prefix: 'cash.denom:', screen: 'sheet_cash_receive' },
  { prefix: 'order.row:', screen: 'page_orders' },
  { prefix: 'refund.mode:', screen: 'sheet_refund' },
  { prefix: 'refund.method:', screen: 'sheet_refund' },
  { prefix: 'refund.plus:', screen: 'sheet_refund' },
  { prefix: 'refund.minus:', screen: 'sheet_refund' },
  { prefix: 'refund.reason:', screen: 'sheet_refund' },
  { prefix: 'refund.pick:', screen: 'sheet_refund_pick' },
  { prefix: 'refund.repl:', screen: 'sheet_refund' },
  { prefix: 'scan.card:', screen: 'overlay_practice_camera' },
  { prefix: 'inv.chip:', screen: 'tab_inventory' },
  { prefix: 'inv.row:', screen: 'tab_inventory' },
  { prefix: 'inv.group:', screen: 'tab_inventory' },
  { prefix: 'inv.mode:', screen: 'sheet_inventory_product' },
  { prefix: 'inv.reason:', screen: 'sheet_inventory_product' },
  { prefix: 'split.equal:', screen: 'sheet_split' },
  { prefix: 'gift.preset:', screen: 'sheet_gift_sell' },
  { prefix: 'gift.how:', screen: 'sheet_gift_sell_details' },
  { prefix: 'saved.row:', screen: 'page_saved' },
  { prefix: 'saved.assign:', screen: 'page_saved' },
  { prefix: 'drawer.denom:', screen: 'page_drawer' },
];

/**
 * Controls that live in ONE line's window (the item editor and its sub windows). The key names the line (its
 * variant, or the line's own id for a custom amount), so each line's window is its own node: a walk can plan into
 * the exact window a fix is in (`sheet_line:<key>`, a copy of the `sheet_line` template registered at runtime by
 * `ensureLineWindow` in appGraph), instead of every line window's controls hanging off the one shared screen. The
 * sub windows (discount, item price, line price) are layers over the line window, so their controls fold into it.
 */
const LINE_WINDOW_PREFIXES = ['line.minus:', 'line.remove:', 'line.note:', 'line.discount:', 'line.discountoff:', 'line.price:', 'line.priceoff:', 'line.adjust:', 'line.adjustoff:'] as const;
/** The graph node for one line's window, from the line key. Registered on demand; see `ensureLineWindow` in appGraph. */
export const lineWindowScreen = (key: string): string => `sheet_line:${key}`;

/** The screen a spot lives on, or undefined when it is universal (always on screen where it is used) or unknown. */
export function screenOfSpot(spot: string): string | undefined {
  if (SPOT_SCREEN[spot]) return SPOT_SCREEN[spot];
  if (spot.startsWith('line.variant:')) return lineWindowScreen(spot.slice('line.variant:'.length).split(':')[0]);
  for (const prefix of LINE_WINDOW_PREFIXES) if (spot.startsWith(prefix)) return lineWindowScreen(spot.slice(prefix.length));
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
