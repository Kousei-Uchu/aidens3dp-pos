// Location: src/training/modules/discounts.ts
// "Discounts": a discount on one line, on the whole cart, a saved preset or your own % or $, an automatic deal, what can never be discounted, and taking one off.
// Practice data has two presets, a Clearance Print tagged no-discount, and an automatic deal: 20% off Keyrings from three.
import type { TrainingModule } from '../../lib/trainingModule';
import { SPOT, cartLineSpot, discountPresetSpot, gridItemSpot, lineDiscountSpot } from '../../lib/trainingSpots';

const BEE = 'train-v-bee'; const DRAGON = 'train-v-dragon'; const KEY = 'train-v-key'; const PRINT = 'train-v-print';
const PRE10 = 'train-pre-10';
const has = (s: { cart: { variantId?: string }[] }, id: string): boolean => s.cart.some(l => l.variantId === id);
const disc = (s: { cart: { variantId?: string; discounted?: boolean }[] }, id: string): boolean => s.cart.some(l => l.variantId === id && !!l.discounted);
const qtyOf = (s: { cart: { variantId?: string; qty: number }[] }, id: string): number => s.cart.filter(l => l.variantId === id).reduce((n, l) => n + l.qty, 0);
const place = { tabs: ['checkout'], routes: ['cart'], sheets: false };
const placeWin = { tabs: ['checkout'], routes: ['cart'], sheets: true };
const phoneCart = { say: 'On a phone, tap the cart bar at the bottom of the screen first.', target: SPOT.cartOpen };

export const discounts: TrainingModule = {
  id: 'discounts', title: 'Discounts', summary: 'Give a discount on one item or the whole cart, use a preset or your own amount, see how automatic deals work, and take a discount off. Eight minutes with practice data.', minutes: 8,
  flow: 'standard', tabs: ['checkout'], routes: ['cart'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 20, w: 560, h: 34, label: 'Discounts', size: 22, align: 'center' },
        { id: 'in-sub', kind: 'text', x: 60, y: 58, w: 520, h: 40, label: 'You can discount one item or the whole cart. Some deals the till applies for you.', size: 13, align: 'center', hidden: true },
        { id: 'c-line', kind: 'panel', x: 40, y: 108, w: 270, h: 96, label: 'ONE ITEM', hidden: true },
        { id: 'i-line', kind: 'icon', x: 52, y: 138, w: 44, h: 44, icon: 'pricetag', tone: 'accent', size: 34, hidden: true },
        { id: 't-line', kind: 'text', x: 104, y: 130, w: 198, h: 66, label: 'On the line', sub: 'Open the item and tap Discount.', size: 15, hidden: true },
        { id: 'c-cart', kind: 'panel', x: 330, y: 108, w: 270, h: 96, label: 'WHOLE CART', hidden: true },
        { id: 'i-cart', kind: 'icon', x: 342, y: 138, w: 44, h: 44, icon: 'cart', tone: 'accent', size: 34, hidden: true },
        { id: 't-cart', kind: 'text', x: 394, y: 130, w: 198, h: 66, label: 'From the menu', sub: 'Cart menu, then Apply cart discount.', size: 15, hidden: true },
        { id: 'c-preset', kind: 'panel', x: 40, y: 216, w: 270, h: 96, label: 'PRESET OR YOUR OWN', hidden: true },
        { id: 'i-preset', kind: 'icon', x: 52, y: 246, w: 44, h: 44, icon: 'pricetags', tone: 'accent', size: 34, hidden: true },
        { id: 't-preset', kind: 'text', x: 104, y: 238, w: 198, h: 66, label: 'Tap or type', sub: 'A saved discount, or key a % or a $ amount.', size: 15, hidden: true },
        { id: 'c-auto', kind: 'panel', x: 330, y: 216, w: 270, h: 96, label: 'AUTOMATIC DEALS', hidden: true },
        { id: 'i-auto', kind: 'icon', x: 342, y: 246, w: 44, h: 44, icon: 'flash', tone: 'accent', size: 34, hidden: true },
        { id: 't-auto', kind: 'text', x: 394, y: 238, w: 198, h: 66, label: 'The till does it', sub: 'When the cart qualifies, the deal appears by itself.', size: 15, hidden: true },
        { id: 'c-no', kind: 'panel', x: 40, y: 324, w: 560, h: 60, label: 'NEVER DISCOUNTED', hidden: true },
        { id: 't-no', kind: 'text', x: 52, y: 346, w: 536, h: 36, label: 'Gift cards, custom amounts and anything tagged no-discount. The window says Not discountable.', size: 13, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', title: 'Two places', say: 'A discount can go on one item or on the whole cart. The till works out the new prices and shows them in the cart.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub', note: 'Item or cart' },
      { id: 'where', title: 'Item or cart', say: 'For one item, tap its line and then Discount. For the whole cart, open the cart menu and tap Apply cart discount.', set: { 'c-line': { hidden: false }, 'i-line': { hidden: false }, 't-line': { hidden: false }, 'c-cart': { hidden: false }, 'i-cart': { hidden: false }, 't-cart': { hidden: false } }, focus: 'c-line', note: 'Pick where' },
      { id: 'how', title: 'Preset or your own', say: 'The Discount window offers your saved presets as buttons. Or choose percent or dollars and key the amount.', set: { 'c-preset': { hidden: false }, 'i-preset': { hidden: false }, 't-preset': { hidden: false } }, focus: 'c-preset', note: 'Quick or exact' },
      { id: 'auto', title: 'Automatic deals', say: 'Some deals need nothing from you. If the cart qualifies, for example three Keyrings, the discount appears by itself. If it does not, there is no discount and nothing to fix.', set: { 'c-auto': { hidden: false }, 'i-auto': { hidden: false }, 't-auto': { hidden: false } }, focus: 'c-auto', note: 'Hands free' },
      { id: 'never', title: 'Not discountable', say: 'Gift cards, custom amounts and items tagged no-discount never get a discount. That is correct, not a fault. The Discount row says Not discountable.', set: { 'c-no': { hidden: false }, 't-no': { hidden: false } }, focus: 'c-no', note: 'Leave it' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'cart', nodes: [
        { id: 'bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Cart', sub: 'Practice data' },
        { id: 'l-dragon', kind: 'row', x: 20, y: 52, w: 300, h: 44, label: 'Red Dragon', sub: '$25.00' },
        { id: 'l-bee', kind: 'row', x: 20, y: 100, w: 300, h: 44, label: 'Bumble Bee', sub: '$8.00' },
        { id: 'l-print', kind: 'row', x: 20, y: 148, w: 300, h: 44, label: 'Clearance Print', sub: '$15.00' },
        { id: 'total', kind: 'text', x: 20, y: 204, w: 300, h: 26, label: 'Total $48.00', size: 18 },
        { id: 'cart-badge', kind: 'chip', x: 20, y: 236, w: 300, h: 30, label: 'Cart: 10% off discountable items', tone: 'good', hidden: true },
        { id: 'win', kind: 'panel', x: 340, y: 52, w: 280, h: 190, label: 'RED DRAGON', hidden: true },
        { id: 'r-disc', kind: 'row', x: 352, y: 80, w: 256, h: 44, label: 'Discount', sub: 'Tap to set', hidden: true },
        { id: 'r-price', kind: 'row', x: 352, y: 130, w: 256, h: 44, label: 'Item price adjustment', sub: '$25.00', hidden: true },
        { id: 'menu', kind: 'panel', x: 340, y: 52, w: 280, h: 120, label: 'CART MENU', hidden: true },
        { id: 'r-cartdisc', kind: 'row', x: 352, y: 80, w: 256, h: 44, label: 'Apply cart discount', hidden: true },
        { id: 'sheet', kind: 'panel', x: 340, y: 52, w: 280, h: 250, label: 'DISCOUNT', hidden: true },
        { id: 'chip1', kind: 'button', x: 352, y: 80, w: 256, h: 32, label: 'Practice 10% off', tone: 'neutral', hidden: true },
        { id: 'chip2', kind: 'button', x: 352, y: 116, w: 256, h: 32, label: 'Practice $5 off', tone: 'neutral', hidden: true },
        { id: 'pct', kind: 'text', x: 352, y: 156, w: 256, h: 40, label: '10%', size: 28, align: 'center', hidden: true },
        { id: 'b-apply', kind: 'button', x: 352, y: 204, w: 256, h: 34, label: 'Apply discount', hidden: true },
        { id: 'b-off', kind: 'button', x: 352, y: 246, w: 256, h: 34, label: 'Remove 10% off', tone: 'neutral', hidden: true },
        { id: 'deal', kind: 'panel', x: 340, y: 52, w: 280, h: 120, label: 'AUTOMATIC DEAL', hidden: true },
        { id: 'deal-say', kind: 'text', x: 352, y: 80, w: 256, h: 70, label: '3 Keyrings, 20% off. With two in the cart there is no discount. Add the third and it appears.', size: 13, hidden: true },
        { id: 'dock', kind: 'panel', x: 0, y: 366, w: 640, h: 34 },
        { id: 'dock-say', kind: 'text', x: 14, y: 370, w: 612, h: 26, label: 'Three items in the cart, none discounted yet.', size: 13 },
      ] },
    ],
    steps: [
      { id: 'cart', title: 'A cart', say: 'Here is a cart with three items. The Clearance Print is tagged no-discount.', focus: 'l-dragon', note: 'Three items', set: { 'dock-say': { label: 'Tap a line to open its window.' } } },
      { id: 'line', title: 'Open the line', say: 'Tap the Red Dragon line. Its window opens, and the Discount row is near the top.', tap: 'l-dragon', set: { win: { hidden: false }, 'r-disc': { hidden: false }, 'r-price': { hidden: false }, 'dock-say': { label: 'Tap Discount.' } }, focus: 'r-disc', note: 'Tap Discount' },
      { id: 'sheet', title: 'Choose the amount', say: 'The Discount window offers your presets as buttons. Or use the percent and dollar keys. Here, 10%.', tap: 'r-disc', set: { win: { hidden: true }, 'r-disc': { hidden: true }, 'r-price': { hidden: true }, sheet: { hidden: false }, chip1: { hidden: false }, chip2: { hidden: false }, pct: { hidden: false }, 'b-apply': { hidden: false }, 'dock-say': { label: 'Tap a preset, or key an amount and Apply.' } }, focus: 'pct', note: '10%' },
      { id: 'apply', title: 'Apply it', say: 'Tap Apply discount. The line shows the new price. Only the Red Dragon went down.', tap: 'b-apply', set: { sheet: { hidden: true }, chip1: { hidden: true }, chip2: { hidden: true }, pct: { hidden: true }, 'b-apply': { hidden: true }, 'l-dragon': { sub: '$22.50 (10% off)' }, total: { label: 'Total $45.50' }, 'dock-say': { label: 'One item discounted.' } }, focus: 'l-dragon', note: 'New price' },
      { id: 'cart-menu', title: 'The whole cart', say: 'To discount everything at once, open the cart menu. It has Apply cart discount.', tap: 'bar', set: { menu: { hidden: false }, 'r-cartdisc': { hidden: false }, 'dock-say': { label: 'Cart menu, then Apply cart discount.' } }, focus: 'r-cartdisc', note: 'Whole cart' },
      { id: 'cart-preset', title: 'A preset', say: 'Tap Apply cart discount, then a preset such as Practice 10% off. One tap and it is on, on everything that can be discounted.', tap: 'r-cartdisc', set: { menu: { hidden: true }, 'r-cartdisc': { hidden: true }, sheet: { hidden: false }, chip1: { hidden: false }, chip2: { hidden: false }, 'cart-badge': { hidden: false }, 'l-dragon': { sub: '$20.25 (10% off, then cart 10% off)' }, 'l-bee': { sub: '$7.20 (cart 10% off)' }, total: { label: 'Total $42.45' }, 'dock-say': { label: 'Presets are one tap, and the whole cart drops.' } }, focus: 'chip1', note: 'Whole cart drops' },
      { id: 'no-discount', title: 'Not discountable', say: 'Some items cannot be discounted. The Clearance Print is tagged no-discount, so even a cart discount leaves it at $15.00. That is correct.', set: { sheet: { hidden: true }, chip1: { hidden: true }, chip2: { hidden: true }, 'l-print': { sub: '$15.00 Not discountable' }, 'dock-say': { label: 'The print stays full price.' } }, focus: 'l-print', note: 'Stays full price' },
      { id: 'auto', title: 'An automatic deal', say: 'Some deals apply by themselves, like 3 Keyrings for 20% off. With only two Keyrings there is no discount. The cart has to qualify first.', set: { deal: { hidden: false }, 'deal-say': { hidden: false }, 'dock-say': { label: 'No discount until the minimum is met.' } }, focus: 'deal-say', note: 'Needs three' },
      { id: 'remove-open', title: 'Taking it off', say: 'To remove a discount, open the window it was added in. It names the discount that is on.', tap: 'l-dragon', set: { deal: { hidden: true }, 'deal-say': { hidden: true }, sheet: { hidden: false }, 'b-off': { hidden: false }, 'dock-say': { label: 'The Remove button names the discount.' } }, focus: 'b-off', note: 'Remove it' },
      { id: 'remove', title: 'Remove it', say: 'Tap Remove. The price goes back to normal.', tap: 'b-off', set: { sheet: { hidden: true }, 'b-off': { hidden: true }, 'cart-badge': { hidden: true }, 'l-dragon': { sub: '$25.00' }, total: { label: 'Total $48.00' }, 'dock-say': { label: 'Back to full price.' } }, focus: 'l-dragon', note: 'Full price' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will give one item a discount, then the whole cart, then take them off. All with practice data on the real till.', until: { kind: 'next' } },
    { id: 'g-add', target: gridItemSpot(DRAGON), say: 'First an item to discount. Tap the Red Dragon tile to add it to the cart.', until: { kind: 'state', test: s => has(s, DRAGON) }, gesture: 'tap', allow: ['add'], recover: { say: 'On the Checkout tab, tap the Red Dragon tile.', target: SPOT.tabCheckout }, at: place },
    { id: 'g-line', target: cartLineSpot(DRAGON), say: 'Tap the Red Dragon line to open its window. On a phone, open the cart from the bar at the bottom first.', until: { kind: 'visible', id: lineDiscountSpot(DRAGON) }, gesture: 'tap', recover: phoneCart, at: place },
    { id: 'g-line-row', target: lineDiscountSpot(DRAGON), say: 'Tap Discount.', until: { kind: 'visible', id: SPOT.discountKeys }, gesture: 'tap', allow: [], at: placeWin, recoverFrom: [{ say: 'Tap the Red Dragon line, then Discount.', target: lineDiscountSpot(DRAGON) }] },
    { id: 'g-keys', target: SPOT.discountKeys, say: 'Tap 1 and then 0 on the number keys, so it reads 10%. Percent is chosen already.', until: { kind: 'state', test: s => s.discountDraft === '10' }, gesture: 'tap', allow: [], at: placeWin, recoverFrom: [{ say: 'Tap Discount on the line again.', target: lineDiscountSpot(DRAGON) }] },
    { id: 'g-apply', target: SPOT.discountApply, say: 'Check it reads the amount you want, then tap Apply discount. Presets above the keys would do the same in one tap.', until: { kind: 'state', test: s => disc(s, DRAGON) }, gesture: 'tap', allow: ['discount'], at: placeWin, recoverFrom: [{ say: 'Tap Discount on the line again, key the amount, then Apply.', target: lineDiscountSpot(DRAGON) }] },
    { id: 'g-line-done', target: SPOT.lineDone, say: 'The Red Dragon now has a discount. Tap Done to close its window.', until: { kind: 'state', test: s => s.sheets === 0 }, gesture: 'tap', allow: ['discount'], at: placeWin },
    { id: 'g-menu', target: SPOT.cartMenu, say: 'Now the whole cart. Tap the three dots in the cart.', until: { kind: 'visible', id: SPOT.cartMenuDiscount }, gesture: 'tap', allow: ['discount'], recover: phoneCart, at: place },
    { id: 'g-menu-item', target: SPOT.cartMenuDiscount, say: 'Tap Apply cart discount.', until: { kind: 'visible', id: discountPresetSpot(PRE10) }, gesture: 'tap', allow: ['discount'], at: placeWin, recoverFrom: [{ say: 'Open the cart menu again (the three dots), then tap Apply cart discount.', target: SPOT.cartMenu }] },
    { id: 'g-preset', target: discountPresetSpot(PRE10), say: 'Tap Practice 10% off. A preset is one tap, no keys.', until: { kind: 'state', test: s => s.cartDiscount }, gesture: 'tap', allow: ['discount'], at: placeWin },
    { id: 'g-seen', say: 'The cart now has 10% off everything that can be discounted, on top of the item discount. Things tagged no-discount, like gift cards, are skipped by the till. You do not have to do anything about them.', until: { kind: 'next' }, allow: ['discount'], at: place },
    { id: 'g-remove-menu', target: SPOT.cartMenu, say: 'To take it off, open the cart menu again.', until: { kind: 'visible', id: SPOT.cartMenuDiscount }, gesture: 'tap', allow: ['discount'], recover: phoneCart, at: place },
    { id: 'g-remove-open', target: SPOT.cartMenuDiscount, say: 'Tap Apply cart discount. It shows the discount that is on.', until: { kind: 'visible', id: SPOT.cartDiscountOff }, gesture: 'tap', allow: ['discount'], at: placeWin, recoverFrom: [{ say: 'Open the cart menu again (the three dots), then tap Apply cart discount.', target: SPOT.cartMenu }] },
    { id: 'g-remove', target: SPOT.cartDiscountOff, say: 'Tap Remove. The cart goes back to full price.', until: { kind: 'state', test: s => !s.cartDiscount }, gesture: 'tap', allow: ['discount'], at: placeWin },
    { id: 'g-done', say: 'You can discount an item or the cart, use a preset or key an amount, and take it off. Automatic deals and no-discount items look after themselves.', until: { kind: 'next' }, allow: ['discount'], at: place },
  ],
  check1: [
    { id: 'c1-line', title: 'Give the Red Dragon 10% off. The Bumble Bee stays full price', until: { kind: 'state', test: s => disc(s, DRAGON) && !disc(s, BEE) }, inject: [{ kind: 'cart', items: [{ variantId: DRAGON, qty: 1 }, { variantId: BEE, qty: 1 }] }],
      ladder: ['A discount on one item goes on that item\'s line.', 'Tap the Red Dragon line, then the Discount row.', 'Key 1 and 0, then tap Apply discount. A preset would do too.'], reveal: SPOT.discountApply, via: lineDiscountSpot(DRAGON), gesture: 'tap', allow: ['discount'], at: placeWin },
    { id: 'c1-cart', title: 'Now give the whole cart the Practice 10% off preset', until: { kind: 'state', test: s => s.cartDiscount },
      ladder: ['The whole cart is discounted from the cart menu.', 'The three dots, then Apply cart discount.', 'Tap the Practice 10% off button.'], reveal: discountPresetSpot(PRE10), via: SPOT.cartMenuDiscount, gesture: 'tap', allow: ['discount'], at: placeWin },
    { id: 'c1-off', title: 'The customer is not entitled to that discount. Take the cart discount off', until: { kind: 'state', test: s => !s.cartDiscount },
      ladder: ['Open the same place you used to add it.', 'The window has a Remove button that names the discount.', 'Tap the three dots, Apply cart discount, then Remove.'], reveal: SPOT.cartDiscountOff, via: SPOT.cartMenuDiscount, gesture: 'tap', allow: ['discount'], at: placeWin },
  ],
  check2: [
    { id: 'c2-never', title: 'The customer asks for 10% off both the Clearance Print and the Bumble Bee', until: { kind: 'state', test: s => disc(s, BEE) && !disc(s, PRINT) }, inject: [{ kind: 'cart', items: [{ variantId: PRINT, qty: 1 }, { variantId: BEE, qty: 1 }] }], taughtBy: 'no-discount',
      ladder: ['Open the Clearance Print and look at its Discount row.', 'It says Not discountable, so it cannot be changed.', 'Open the Bumble Bee line, tap Discount, key 10 and Apply.'], reveal: lineDiscountSpot(BEE), via: cartLineSpot(BEE), gesture: 'tap', allow: ['discount'], at: placeWin },
    { id: 'c2-deal', title: 'The sign says 3 Keyrings get 20% off, but there are only two. Make it three so the deal applies', until: { kind: 'state', test: s => qtyOf(s, KEY) >= 3 }, inject: [{ kind: 'cart', items: [{ variantId: KEY, qty: 2 }] }], taughtBy: 'auto',
      ladder: ['An automatic deal needs the cart to qualify.', 'The deal needs three Keyrings. You have two.', 'Tap the Keyring tile once more, or open its line and tap +.'], reveal: gridItemSpot(KEY), via: SPOT.tabCheckout, gesture: 'tap', allow: ['add', 'qty'], at: place },
    { id: 'c2-mistake', title: 'A 15% cart discount was put on by mistake. Take it off', until: { kind: 'state', test: s => !s.cartDiscount }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: DRAGON, qty: 1 }], discountPct: 15 }], taughtBy: 'g-remove',
      ladder: ['A discount is on the whole cart.', 'It is removed from the same place it is added.', 'Tap the three dots, Apply cart discount, then Remove.'], reveal: SPOT.cartDiscountOff, via: SPOT.cartMenuDiscount, gesture: 'tap', allow: ['discount'], at: placeWin },
  ],
  recap: ['You discount one item from its line window, or the whole cart from the cart menu.', 'You use a preset in one tap, or key a percent or dollar amount.', 'Automatic deals appear by themselves when the cart qualifies, and Not discountable items are skipped, which is correct.', 'You take a discount off from the same window that added it.'],
};
