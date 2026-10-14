// Location: src/lib/trainingSpots.ts
// Names for the things training can point at. A spot is any button, tile or row that carries `spot="..."` in the UI.
// tests/trainingspots.test.ts scans the source, so a module can never point at a spot that is not really there.
export const SPOT = {
  cartCharge: 'cart.charge', // the Charge button (cart pane, or the bar on a phone)
  cartOpen: 'cart.open',     // the bar that opens the cart on a phone
  tabCheckout: 'tab.checkout',
  tabMore: 'tab.more',
  moreTraining: 'more.training',
  back: 'page.back',           // the Back arrow at the top of every pushed page
  sheetClose: 'sheet.close',   // the Close button of a sheet
  terminalTap: 'terminal.tap',         // the customer's Tap card button under the practice terminal (manual mode)
  terminalInsert: 'terminal.insert',   // Insert card
  terminalRemove: 'terminal.remove',   // Take card out
  terminalPinpad: 'terminal.pinpad',   // the PIN keys on the terminal's screen (any digit)
  terminalPinOk: 'terminal.pinok',     // OK on the PIN screen
  terminalCancel: 'terminal.cancel',   // Cancel on the terminal's screen
  terminalDone: 'terminal.done',       // Done on the terminal's receipt screen
  loginPinpad: 'login.pinpad',         // the PIN keys on the Sign in screen and in the Switch staff window (any digit)
  loginUnlock: 'login.unlock',         // Unlock under the PIN keys
  loginScanPass: 'login.scanpass',     // Scan pass under the PIN keys
  switchLock: 'switch.lock',           // Lock register inside the Switch staff window
  passScan: 'pass.scan',               // the practice pass sheet's Scan this pass button (only in training)
  findSearch: 'find.search',           // the Search bar at the top of Checkout (opens the Search window)
  findTabs: 'find.tabs',               // the Keypad | Quick Menu | All products switch (ring the whole switch; a tap on a part of it is `find.tab:<keypad|quick|all>`)
  findBack: 'find.back',               // the back arrow above the grid (one level up, or out of the variation picker)
  findFilter: 'find.filter',           // the Filter products box on All products
  findKeypad: 'find.keypad',           // the number keys on the Keypad tab (any key)
  findKeypadAdd: 'find.keypad.add',    // the Add button under the Keypad tab's keys
  searchField: 'search.field',         // the box in the Search window
  payTotal: 'pay.total',               // the amount due at the top of the Payment page
  cartMenu: 'cart.menu',                 // the three dots in the cart
  cartMenuDiscount: 'cart.menu.discount', // Apply cart discount, in the cart menu
  cartMenuOrder: 'cart.menu.order',       // Whole order price, in the cart menu
  cartDiscountOff: 'cart.discountoff',    // Remove, in the cart discount window
  cartOrderOff: 'cart.orderoff',          // Remove adjustment, in the whole order price window
  cartCustomerOff: 'cart.customerx',   // the small x that takes the customer off the cart
  payCash: 'pay.cash',                 // the Cash button on the Payment page
  payGift: 'pay.gift',                 // the Gift card button on the Payment page
  paySplit: 'pay.split',               // the Split button on the Payment page
  payCard: 'pay.card',                 // the Card button on the Payment page
  payRetry: 'pay.retry',               // Try card again, in the Not approved window
  payOther: 'pay.other',               // Use another method, in the Not approved window
  receiptNone: 'receipt.none',         // No receipt, in the Receipt window after a sale
  receiptQr: 'receipt.qr',             // Show QR code, in the Receipt window
  receiptEmail: 'receipt.email',       // Email link (Email receipt when receipts are not published), in the Receipt window
  receiptText: 'receipt.text',         // Text link (Text receipt), in the Receipt window
  receiptShare: 'receipt.share',       // Share, in the Receipt window
  cartCustomer: 'cart.customer',       // the customer row at the top of the cart (tap it to attach someone)
  customerSearch: 'customer.search',   // the search box in the Customer window
  customerCreate: 'customer.create',   // Create customer, in the Customer window
  customerForm: 'customer.form',       // the four boxes in the New customer window (ring the whole form)
  customerSave: 'customer.save',       // Create & attach, in the New customer window
  discountKeys: 'discount.keys',       // the number keys in the Discount window (any key)
  discountApply: 'discount.apply',     // Apply discount, in the Discount window
  cashPad: 'cash.pad',                 // the notes and coins pad in the Cash window (a tap on one is `cash.denom:<cents>`)
  cashUndo: 'cash.undo',               // Undo under the pad
  cashTake: 'cash.take',               // Take cash, when the amount handed over is exact
  cashNext: 'cash.next',               // Next: give change
  cashGave: 'cash.gave',               // Gave this, on the change step
  cashSmaller: 'cash.smaller',         // Use that smaller handover, when the drawer cannot make change
  cashPartCash: 'cash.partcash',       // Cash $x + the rest another way, when the drawer cannot make change
  priceItemKeys: 'price.item.keys',    // the number keys in the Item price adjustment window (any key)
  priceItemSet: 'price.item.set',      // Set price, in the Item price adjustment window
  priceLineKeys: 'price.line.keys',    // the number keys in the Line price adjustment window
  priceLineSet: 'price.line.set',      // Set line price
  priceOrderKeys: 'price.order.keys',  // the number keys in the Whole order price window
  priceOrderSet: 'price.order.set',    // Set order total
  priceReason: 'price.reason',         // the Reason box in any of the three price windows
  priceScopeQty: 'price.scope.qty',    // Fixed quantity, in the Item price adjustment window
  priceScopeAll: 'price.scope.all',    // All in cart, in the Item price adjustment window
  reviewContinue: 'review.continue',   // Continue to payment, in Check the price adjustments
  reviewKeep: 'review.keep',           // Keep, on a flagged adjustment in the review
  reviewAdjust: 'review.adjust',       // Adjust, on an adjustment in the review
  reviewRemove: 'review.remove',       // Remove, on an adjustment in the review
  lineDone: 'line.done',               // Done at the bottom of a line's window (it also saves the note)
  receiptQrBack: 'receipt.qr.back',     // Back, on the QR code page of the Receipt window
  moreOrders: 'more.orders',           // the Orders row on the More tab
  ordersRefund: 'orders.refund',       // Refund or return, in an order's window
  refundMode: 'refund.mode',           // the Items | Amount switch on the Return page (a tap on a part of it is `refund.mode:<items|amount>`)
  refundMethod: 'refund.method',       // the Original | Cash | Gift card switch ("Refund to"; a part of it is `refund.method:<original|cash|gift>`)
  refundRestock: 'refund.restock',     // the Restock returned items switch
  refundReplace: 'refund.replace',     // Add replacement item
  refundGo: 'refund.go',               // the big button at the bottom: Refund $X, Charge $X or Even exchange
  refundDone: 'refund.done',           // OK, in the Done window after a refund
} as const;
/** Spots that only exist inside a window (a sheet). A step that points at one must say windows are allowed (`at.sheets: true`). */
export const WINDOW_SPOTS: readonly string[] = [SPOT.sheetClose, SPOT.discountKeys, SPOT.discountApply, SPOT.cartMenuDiscount, SPOT.cartMenuOrder, SPOT.cartDiscountOff, SPOT.cartOrderOff, SPOT.switchLock, SPOT.passScan, SPOT.customerSearch, SPOT.customerCreate, SPOT.customerForm, SPOT.customerSave, SPOT.lineDone, SPOT.priceItemKeys, SPOT.priceItemSet, SPOT.priceLineKeys, SPOT.priceLineSet, SPOT.priceOrderKeys, SPOT.priceOrderSet, SPOT.priceReason, SPOT.priceScopeQty, SPOT.priceScopeAll, SPOT.reviewContinue, SPOT.reviewKeep, SPOT.reviewAdjust, SPOT.reviewRemove, SPOT.cashPad, SPOT.cashUndo, SPOT.cashTake, SPOT.cashNext, SPOT.cashGave, SPOT.cashSmaller, SPOT.cashPartCash, SPOT.searchField, SPOT.payRetry, SPOT.payOther, SPOT.receiptNone, SPOT.receiptQr, SPOT.receiptEmail, SPOT.receiptText, SPOT.receiptShare, SPOT.receiptQrBack, SPOT.ordersRefund, SPOT.refundDone];
/** Spots inside a window, including the ones whose id ends in a record (a row in the Search window). */
export const isWindowSpot = (id: string): boolean => WINDOW_SPOTS.includes(id) || id.startsWith('search.result:') || id.startsWith('refund.pick:') || id.startsWith('discount.preset:') || id.startsWith('cash.denom:') || id.startsWith('customer.row:') || id.startsWith('line.minus:') || id.startsWith('line.remove:') || id.startsWith('line.note:') || id.startsWith('line.disc') || id.startsWith('line.price') || id.startsWith('line.adj');
export const STATIC_SPOTS: readonly string[] = Object.values(SPOT);
/** Spots whose id ends in a record id: a grid tile, or a cart line. */
export const DYNAMIC_PREFIXES = ['discount.preset:', 'grid.item:', 'grid.cat:', 'grid.action:', 'cart.line:', 'grid.page:', 'find.tab:', 'customer.row:', 'cash.denom:', 'all.product:', 'pick.variant:', 'search.result:', 'find.key:', 'line.minus:', 'line.remove:', 'line.discount:', 'line.discountoff:', 'line.price:', 'line.priceoff:', 'line.adjust:', 'line.adjustoff:', 'line.note:', 'order.row:', 'refund.mode:', 'refund.method:', 'refund.plus:', 'refund.minus:', 'refund.reason:', 'refund.pick:', 'refund.repl:'] as const;
export const isKnownSpot = (id: string): boolean => STATIC_SPOTS.includes(id) || DYNAMIC_PREFIXES.some(p => id.startsWith(p) && id.length > p.length);
export const gridItemSpot = (id: string): string => `grid.item:${id}`;
export const gridCatSpot = (collectionId: string): string => `grid.cat:${collectionId}`;
export const gridActionSpot = (action: string): string => `grid.action:${action}`;
/** One customer row in the Customer window. */
export const customerRowSpot = (id: string): string => `customer.row:${id}`;
export const cartLineSpot = (variantId: string): string => `cart.line:${variantId}`;
/** A page chip above the grid. */
export const gridPageSpot = (pageId: string): string => `grid.page:${pageId}`;
/** One part of the Keypad | Quick Menu | All products switch: 'keypad', 'quick' or 'all'. */
export const findTabSpot = (tab: 'keypad' | 'quick' | 'all'): string => `find.tab:${tab}`;
/** The minus and Remove item buttons in ONE line's window. Each line has its own, so the guide can tell which item's window is open. The key is the variant, or the line's own id for a custom amount. */
export const lineMinusSpot = (key: string): string => `line.minus:${key}`;
export const lineRemoveSpot = (key: string): string => `line.remove:${key}`;
/** The rows and buttons inside ONE line's window and its sub-windows (discount, item price, whole-line price): used to walk a person to the fix for an unwanted discount or price change. */
export const lineDiscountSpot = (key: string): string => `line.discount:${key}`;
export const lineDiscountOffSpot = (key: string): string => `line.discountoff:${key}`;
export const linePriceSpot = (key: string): string => `line.price:${key}`;
export const linePriceOffSpot = (key: string): string => `line.priceoff:${key}`;
export const lineAdjustSpot = (key: string): string => `line.adjust:${key}`;
export const lineAdjustOffSpot = (key: string): string => `line.adjustoff:${key}`;
/** The note field in ONE line's window. */
export const lineNoteSpot = (key: string): string => `line.note:${key}`;
export const lineKeyOf = (l: { variantId?: string; lineId?: string }): string | undefined => l.variantId ?? l.lineId;
/** One key on the Keypad tab: a digit, 'C' (clear) or 'del' (delete). */
export const findKeySpot = (key: string): string => `find.key:${key}`;
/** A product row on All products. */
export const allProductSpot = (productId: string): string => `all.product:${productId}`;
/** A variation tile in the variation picker. */
export const pickVariantSpot = (variantId: string): string => `pick.variant:${variantId}`;
/** One note or coin on the Cash window's pad, by its value in cents ($20 is 2000). */
export const cashDenomSpot = (cents: number): string => `cash.denom:${cents}`;
/** A preset chip (for example Practice 10% off) in the Discount window. */
export const discountPresetSpot = (presetId: string): string => `discount.preset:${presetId}`;
/** An item row in the Search window. */
export const searchResultSpot = (variantId: string): string => `search.result:${variantId}`;
/** A row on the Orders page. */
export const orderRowSpot = (orderId: string): string => `order.row:${orderId}`;
/** One part of the Items | Amount switch on the Return page. */
export const refundModeSpot = (mode: 'items' | 'amount'): string => `refund.mode:${mode}`;
/** One part of the "Refund to" switch: 'original', 'cash' or 'gift'. */
export const refundMethodSpot = (m: 'original' | 'cash' | 'gift'): string => `refund.method:${m}`;
/** The + and − buttons on one line of the Return page (the key is the order line's own id). */
export const refundPlusSpot = (lineId: string): string => `refund.plus:${lineId}`;
export const refundMinusSpot = (lineId: string): string => `refund.minus:${lineId}`;
/** A reason chip on the Return page (the reason's own words). */
export const refundReasonSpot = (reason: string): string => `refund.reason:${reason}`;
/** A result in the Replacement item window, and a replacement line already added on the Return page. */
export const refundPickSpot = (variantId: string): string => `refund.pick:${variantId}`;
export const refundReplSpot = (variantId: string): string => `refund.repl:${variantId}`;
/** The spot id a grid tile carries, or undefined for tile types training does not point at. */
export function tileSpotId(t: { type: string; variantId?: string; productId?: string; collectionId?: string; action?: string }): string | undefined {
  if (t.type === 'item') { const id = t.variantId ?? t.productId; return id ? gridItemSpot(id) : undefined; }
  if (t.type === 'category' && t.collectionId) return gridCatSpot(t.collectionId);
  if (t.type === 'action' && t.action) return gridActionSpot(t.action);
  return undefined;
}
