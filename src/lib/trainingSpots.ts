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
  cartCustomerOff: 'cart.customerx',   // the small x that takes the customer off the cart
  payCash: 'pay.cash',                 // the Cash button on the Payment page
  payGift: 'pay.gift',                 // the Gift card button on the Payment page
  paySplit: 'pay.split',               // the Split button on the Payment page
  payCard: 'pay.card',                 // the Card button on the Payment page
  payRetry: 'pay.retry',               // Try card again, in the Not approved window
  payOther: 'pay.other',               // Use another method, in the Not approved window
  receiptNone: 'receipt.none',         // No receipt, in the Receipt window after a sale
} as const;
/** Spots that only exist inside a window (a sheet). A step that points at one must say windows are allowed (`at.sheets: true`). */
export const WINDOW_SPOTS: readonly string[] = [SPOT.sheetClose, SPOT.switchLock, SPOT.passScan, SPOT.searchField, SPOT.payRetry, SPOT.payOther, SPOT.receiptNone];
/** Spots inside a window, including the ones whose id ends in a record (a row in the Search window). */
export const isWindowSpot = (id: string): boolean => WINDOW_SPOTS.includes(id) || id.startsWith('search.result:') || id.startsWith('line.minus:') || id.startsWith('line.remove:') || id.startsWith('line.disc') || id.startsWith('line.price') || id.startsWith('line.adj');
export const STATIC_SPOTS: readonly string[] = Object.values(SPOT);
/** Spots whose id ends in a record id: a grid tile, or a cart line. */
export const DYNAMIC_PREFIXES = ['grid.item:', 'grid.cat:', 'grid.action:', 'cart.line:', 'grid.page:', 'find.tab:', 'all.product:', 'pick.variant:', 'search.result:', 'find.key:', 'line.minus:', 'line.remove:', 'line.discount:', 'line.discountoff:', 'line.price:', 'line.priceoff:', 'line.adjust:', 'line.adjustoff:'] as const;
export const isKnownSpot = (id: string): boolean => STATIC_SPOTS.includes(id) || DYNAMIC_PREFIXES.some(p => id.startsWith(p) && id.length > p.length);
export const gridItemSpot = (id: string): string => `grid.item:${id}`;
export const gridCatSpot = (collectionId: string): string => `grid.cat:${collectionId}`;
export const gridActionSpot = (action: string): string => `grid.action:${action}`;
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
export const lineKeyOf = (l: { variantId?: string; lineId?: string }): string | undefined => l.variantId ?? l.lineId;
/** One key on the Keypad tab: a digit, 'C' (clear) or 'del' (delete). */
export const findKeySpot = (key: string): string => `find.key:${key}`;
/** A product row on All products. */
export const allProductSpot = (productId: string): string => `all.product:${productId}`;
/** A variation tile in the variation picker. */
export const pickVariantSpot = (variantId: string): string => `pick.variant:${variantId}`;
/** An item row in the Search window. */
export const searchResultSpot = (variantId: string): string => `search.result:${variantId}`;
/** The spot id a grid tile carries, or undefined for tile types training does not point at. */
export function tileSpotId(t: { type: string; variantId?: string; productId?: string; collectionId?: string; action?: string }): string | undefined {
  if (t.type === 'item') { const id = t.variantId ?? t.productId; return id ? gridItemSpot(id) : undefined; }
  if (t.type === 'category' && t.collectionId) return gridCatSpot(t.collectionId);
  if (t.type === 'action' && t.action) return gridActionSpot(t.action);
  return undefined;
}
