// Location: src/training/modules/gift-sell.ts
// "Sell a gift card": the cart menu, the Sell gift card window (a preset or a keyed amount), handing the card over or
// emailing it, and paying for it like any other line. Check 2 covers a declined card and an emailed card.
// Practice data only: nothing is charged and the practice card code is never sent anywhere.
import type { TrainingModule } from '../../lib/trainingModule';
import { SPOT, giftHowSpot, giftPresetSpot } from '../../lib/trainingSpots';

/** The cart holds a gift card of this amount. */
const hasGift = (s: { cart: { kind: string; unitCents?: number }[] }, cents: number): boolean => s.cart.some(l => l.kind === 'gift_card' && l.unitCents === cents);
/** A sale finished and the Receipt window is closed again, so the next goal starts on a clear screen. */
const saleDone = (n: number) => (s: { sales: number; sheets: number }): boolean => s.sales >= n && s.sheets === 0;
/** A finished sale whose gift card was emailed rather than handed over. */
const emailedSale = (n: number) => (s: { sales: number; sheets: number; lastGift?: { how: string } }): boolean => s.sales >= n && s.sheets === 0 && s.lastGift?.how === 'email';

const place = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: false };
const placeWin = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: true };

export const giftSell: TrainingModule = {
  id: 'gift-sell', title: 'Sell a gift card', summary: 'Sell a prepaid gift card: choose the amount, hand it over or email it, take the payment, and know where the code and QR come from. Eight minutes with practice data, nothing is charged.', minutes: 8,
  flow: 'standard', tabs: ['checkout'], routes: ['cart', 'pay'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 20, w: 560, h: 34, label: 'Sell a gift card', size: 22, align: 'center' },
        { id: 'in-sub', kind: 'text', x: 60, y: 56, w: 520, h: 40, label: 'A gift card is money put on a card the customer spends later. You sell it like an item and it is paid for at once.', size: 12, align: 'center', hidden: true },
        { id: 'c-what', kind: 'panel', x: 40, y: 104, w: 270, h: 92, label: 'WHAT IT IS', hidden: true },
        { id: 'i-what', kind: 'icon', x: 52, y: 132, w: 44, h: 44, icon: 'gift', tone: 'accent', size: 34, hidden: true },
        { id: 't-what', kind: 'text', x: 104, y: 122, w: 198, h: 64, label: 'Prepaid balance', sub: 'Spent later in the shop or online.', size: 15, hidden: true },
        { id: 'c-amount', kind: 'panel', x: 330, y: 104, w: 270, h: 92, label: 'CHOOSE AN AMOUNT', hidden: true },
        { id: 'i-amount', kind: 'icon', x: 342, y: 132, w: 44, h: 44, icon: 'calculator', tone: 'accent', size: 34, hidden: true },
        { id: 't-amount', kind: 'text', x: 394, y: 122, w: 198, h: 64, label: 'Preset or your own', sub: 'Tap $25, $50 or $100, or key an amount.', size: 15, hidden: true },
        { id: 'c-how', kind: 'panel', x: 40, y: 212, w: 270, h: 92, label: 'HOW THEY GET IT', hidden: true },
        { id: 'i-how', kind: 'icon', x: 52, y: 240, w: 44, h: 44, icon: 'mail', tone: 'accent', size: 34, hidden: true },
        { id: 't-how', kind: 'text', x: 104, y: 230, w: 198, h: 64, label: 'Hand over or email', sub: 'Printed at the counter, or sent by Shopify.', size: 15, hidden: true },
        { id: 'c-pay', kind: 'panel', x: 330, y: 212, w: 270, h: 92, label: 'PAID FOR NOW', hidden: true },
        { id: 'i-pay', kind: 'icon', x: 342, y: 240, w: 44, h: 44, icon: 'card', tone: 'accent', size: 34, hidden: true },
        { id: 't-pay', kind: 'text', x: 394, y: 230, w: 198, h: 64, label: 'Like any other sale', sub: 'Charge, then take the payment.', size: 15, hidden: true },
        { id: 'c-code', kind: 'panel', x: 40, y: 320, w: 560, h: 56, label: 'THE CODE', hidden: true },
        { id: 'i-code', kind: 'icon', x: 52, y: 332, w: 36, h: 36, icon: 'qr-code', tone: 'accent', size: 28, hidden: true },
        { id: 't-code', kind: 'text', x: 98, y: 332, w: 490, h: 40, label: 'After payment the receipt shows the code and a QR to hand over or print.', size: 13, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', title: 'What a gift card is', say: 'A gift card is money put on a card the customer spends later, in the shop or online. You sell it and it is paid for at once.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub', note: 'Money for later' },
      { id: 'amount', title: 'Choose an amount', say: 'You start by choosing the amount. There are preset buttons, or you key your own with the number pad.', set: { 'c-amount': { hidden: false }, 'i-amount': { hidden: false }, 't-amount': { hidden: false } }, focus: 'c-amount', note: 'Preset or keyed' },
      { id: 'how', title: 'Hand over or email', say: 'Next you choose how the customer gets the card: hand it over printed, or have Shopify email it to them.', set: { 'c-how': { hidden: false }, 'i-how': { hidden: false }, 't-how': { hidden: false } }, focus: 'c-how', note: 'Two ways to get it' },
      { id: 'pay', title: 'Paid for at once', say: 'The card then waits in the cart as a line, like an item. The customer pays for it the usual way, by card or cash.', set: { 'c-pay': { hidden: false }, 'i-pay': { hidden: false }, 't-pay': { hidden: false } }, focus: 'c-pay', note: 'A normal sale' },
      { id: 'code', title: 'The code and QR', say: 'After the payment, the receipt carries the code and a QR. Hand it over or print it, so the customer has the card.', set: { 'c-code': { hidden: false }, 'i-code': { hidden: false }, 't-code': { hidden: false } }, focus: 'c-code', note: 'The code and QR' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'checkout', nodes: [
        { id: 'bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Checkout', sub: 'Practice data' },
        { id: 'pane', kind: 'panel', x: 20, y: 56, w: 600, h: 290, label: 'CART' },
        { id: 'dots', kind: 'icon', x: 596, y: 64, w: 32, h: 24, icon: 'ellipsis-horizontal' },
        { id: 'menu', kind: 'panel', x: 340, y: 84, w: 268, h: 132, label: 'CART', hidden: true },
        { id: 'menu-gift', kind: 'row', x: 354, y: 140, w: 240, h: 44, label: 'Sell gift card', icon: 'gift-outline', hidden: true },
        { id: 'giftwin', kind: 'panel', x: 120, y: 50, w: 400, h: 300, label: 'SELL GIFT CARD', hidden: true },
        { id: 'p25', kind: 'chip', x: 138, y: 96, w: 110, h: 38, label: '$25.00', hidden: true },
        { id: 'p50', kind: 'chip', x: 256, y: 96, w: 110, h: 38, label: '$50.00', hidden: true },
        { id: 'p100', kind: 'chip', x: 374, y: 96, w: 128, h: 38, label: '$100.00', hidden: true },
        { id: 'amount', kind: 'text', x: 138, y: 148, w: 364, h: 46, label: '$0.00', size: 28, align: 'center', hidden: true },
        { id: 'keys', kind: 'panel', x: 138, y: 206, w: 364, h: 84, label: 'Number pad', hidden: true },
        { id: 'next', kind: 'button', x: 138, y: 300, w: 364, h: 36, label: 'Next', hidden: true },
        { id: 'detwin', kind: 'panel', x: 120, y: 50, w: 400, h: 300, label: 'GIFT CARD $25.00', hidden: true },
        { id: 'seg-hand', kind: 'button', x: 138, y: 100, w: 180, h: 38, label: 'Hand over / print', hidden: true },
        { id: 'seg-email', kind: 'button', x: 326, y: 100, w: 180, h: 38, label: 'Email it', tone: 'neutral', hidden: true },
        { id: 'field-email', kind: 'field', x: 138, y: 150, w: 368, h: 40, label: 'Recipient email', hidden: true },
        { id: 'add', kind: 'button', x: 138, y: 236, w: 368, h: 40, label: 'Add gift card to cart', hidden: true },
        { id: 'change', kind: 'button', x: 138, y: 286, w: 368, h: 32, label: 'Change amount', tone: 'neutral', hidden: true },
        { id: 'cart-line', kind: 'row', x: 40, y: 120, w: 560, h: 54, label: 'Gift card', sub: '1 x $25.00', value: '$25.00', hidden: true },
        { id: 'rc', kind: 'panel', x: 120, y: 50, w: 400, h: 300, label: 'RECEIPT', hidden: true },
        { id: 'rc-total', kind: 'text', x: 138, y: 96, w: 364, h: 40, label: 'Gift card $25.00', size: 20, align: 'center', hidden: true },
        { id: 'rc-code', kind: 'text', x: 138, y: 142, w: 364, h: 26, label: 'Code 88F2-AC10', size: 14, align: 'center', hidden: true },
        { id: 'rc-qr', kind: 'icon', x: 280, y: 184, w: 80, h: 80, icon: 'qr-code', hidden: true },
        { id: 'rc-none', kind: 'button', x: 138, y: 286, w: 368, h: 36, label: 'No receipt', hidden: true },
        { id: 'nap', kind: 'panel', x: 120, y: 50, w: 400, h: 300, label: 'NOT APPROVED', hidden: true },
        { id: 'nap-sub', kind: 'text', x: 138, y: 132, w: 364, h: 40, label: 'Insufficient funds', size: 18, align: 'center', hidden: true },
        { id: 'nap-retry', kind: 'button', x: 138, y: 224, w: 364, h: 40, label: 'Try card again', hidden: true },
        { id: 'dock', kind: 'panel', x: 0, y: 366, w: 640, h: 34 },
        { id: 'dock-say', kind: 'text', x: 14, y: 370, w: 612, h: 26, label: 'A gift card is sold from the cart menu.', size: 13 },
      ] },
    ],
    steps: [
      { id: 'menu', title: 'The cart menu', say: 'A gift card is sold from Checkout. Tap the three dots in the cart to open the cart menu.', tap: 'dots', set: { menu: { hidden: false }, 'menu-gift': { hidden: false }, 'dock-say': { label: 'The cart menu has Sell gift card.' } }, focus: 'menu-gift', note: 'Cart menu' },
      { id: 'sell', title: 'Sell gift card', say: 'Tap Sell gift card to open its window.', tap: 'menu-gift', set: { menu: { hidden: true }, 'menu-gift': { hidden: true }, giftwin: { hidden: false }, p25: { hidden: false }, p50: { hidden: false }, p100: { hidden: false }, amount: { hidden: false }, keys: { hidden: false }, next: { hidden: false }, 'dock-say': { label: 'Choose an amount.' } }, focus: 'giftwin', note: 'Sell gift card' },
      { id: 'amount', title: 'Choose the amount', say: 'Tap a preset amount, or key your own with the number pad. The customer wants $25.00.', tap: 'p25', set: { amount: { label: '$25.00' }, 'dock-say': { label: 'The amount is set.' } }, focus: 'amount', note: '$25.00' },
      { id: 'how', title: 'Hand over or email', say: 'Next choose how the customer gets the card: hand it over printed, or have Shopify email it.', set: { giftwin: { hidden: true }, p25: { hidden: true }, p50: { hidden: true }, p100: { hidden: true }, amount: { hidden: true }, keys: { hidden: true }, next: { hidden: true }, detwin: { hidden: false }, 'seg-hand': { hidden: false }, 'seg-email': { hidden: false }, add: { hidden: false }, change: { hidden: false }, 'dock-say': { label: 'Hand over or email.' } }, focus: 'seg-hand', note: 'How they get it' },
      { id: 'email', title: 'Email it', say: 'For an emailed card, choose Email it and key the recipient address. Shopify sends it once the payment completes.', tap: 'seg-email', set: { 'field-email': { hidden: false }, 'dock-say': { label: 'The address must be valid.' } }, focus: 'field-email', note: 'Recipient email' },
      { id: 'add', title: 'A line in the cart', say: 'Either way, the card becomes a line in the cart and the customer pays for it like any item.', set: { detwin: { hidden: true }, 'seg-hand': { hidden: true }, 'seg-email': { hidden: true }, 'field-email': { hidden: true }, add: { hidden: true }, change: { hidden: true }, 'cart-line': { hidden: false }, 'dock-say': { label: 'Pay for the card as usual.' } }, focus: 'cart-line', note: 'A line in the cart' },
      { id: 'code', title: 'The code and QR', say: 'After payment the receipt carries the code and a QR. Hand it over or print it, so the customer has the card.', set: { 'cart-line': { hidden: true }, rc: { hidden: false }, 'rc-total': { hidden: false }, 'rc-code': { hidden: false }, 'rc-qr': { hidden: false }, 'rc-none': { hidden: false }, 'dock-say': { label: 'The code is on the receipt.' } }, focus: 'rc-qr', note: 'Code and QR' },
      { id: 'declined', title: 'If the card is declined', say: 'If the card is declined, the Not approved window appears. The gift card stays in the cart. Try card again takes the card once more.', set: { rc: { hidden: true }, 'rc-total': { hidden: true }, 'rc-code': { hidden: true }, 'rc-qr': { hidden: true }, 'rc-none': { hidden: true }, nap: { hidden: false }, 'nap-sub': { hidden: false }, 'nap-retry': { hidden: false }, 'dock-say': { label: 'The card stays in the cart.' } }, focus: 'nap-retry', note: 'Try the card again' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will sell one gift card on the real till with practice data. Nothing is charged, and the card code is made up. The customer pays for the card like any other sale.', until: { kind: 'next' } },
    { id: 'g-menu', target: SPOT.cartMenu, say: 'A gift card is sold from Checkout. Tap the three dots in the cart to open the cart menu.', until: { kind: 'press', id: SPOT.cartMenu }, gesture: 'tap', allow: [], recover: { say: 'On the Checkout tab, tap the three dots in the cart.', target: SPOT.tabCheckout }, at: { tabs: ['checkout'], routes: ['cart'], sheets: false } },
    { id: 'g-gift', target: SPOT.cartMenuGift, say: 'Tap Sell gift card. The window opens on the amount.', until: { kind: 'press', id: SPOT.cartMenuGift }, gesture: 'tap', allow: [], at: placeWin },
    { id: 'g-window', target: SPOT.giftKeys, say: 'This is the Sell gift card window. You can tap a preset amount, or key your own with the number pad and tap Next.', until: { kind: 'next' }, allow: [], at: placeWin },
    { id: 'g-preset', target: giftPresetSpot(2500), say: 'The customer wants $25.00. Tap the $25.00 preset.', until: { kind: 'press', id: giftPresetSpot(2500) }, gesture: 'tap', allow: [], recover: { say: 'In the Sell gift card window, tap the $25.00 preset.', target: SPOT.cartMenuGift }, at: placeWin },
    { id: 'g-how', target: SPOT.giftHow, say: 'Now choose how the customer gets the card. Leave it on Hand over / print for a card over the counter.', until: { kind: 'press', id: giftHowSpot('hand') }, gesture: 'tap', allow: [], at: placeWin },
    { id: 'g-add', target: SPOT.giftAdd, say: 'Tap Add gift card to cart. The card becomes a line in the cart, ready to be paid for.', until: { kind: 'state', test: s => hasGift(s, 2500) }, gesture: 'tap', allow: ['add'], recover: { say: 'In the Gift card window, tap Add gift card to cart.', target: SPOT.cartMenuGift }, at: placeWin },
    { id: 'g-charge', target: SPOT.cartCharge, say: 'The Gift card is now a $25.00 line in the cart, like any item. Tap Charge to open the Payment page.', until: { kind: 'press', id: SPOT.cartCharge }, gesture: 'tap', allow: [], at: { tabs: ['checkout'], routes: ['cart'], sheets: false } },
    { id: 'g-card', target: SPOT.payCard, say: 'The customer pays by card. Tap Card. The terminal beside the till takes the payment.', until: { kind: 'press', id: SPOT.payCard }, gesture: 'tap', allow: ['tender'], recover: { say: 'Tap Card on the Payment page.', target: SPOT.payCard }, at: { tabs: ['checkout'], routes: ['pay'], sheets: false } },
    { id: 'g-wait', say: 'When the card is approved the sale finishes by itself. Wait for the Receipt window: it carries the gift card code and a QR.', until: { kind: 'visible', id: SPOT.receiptNone }, allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-receipt', target: SPOT.receiptNone, say: 'The sale is complete and the code is on the receipt. For practice, tap No receipt.', until: { kind: 'state', test: s => s.sales >= 1 && s.sheets === 0 }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-done', say: 'The cart is clear. If the card is ever declined, Try card again on the Not approved window takes the card once more, and the gift card stays in the cart. You will practise an emailed card and a decline next.', until: { kind: 'next' }, at: { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: false } },
  ],
  check1: [
    { id: 'keyed-amount', title: 'Sell a $30.00 gift card to hand over at the counter', until: { kind: 'state', test: s => hasGift(s, 3000) && s.sheets === 0 }, inject: [{ kind: 'cart', items: [] }],
      ladder: ['A gift card starts in the cart menu.', 'In the Sell gift card window you can key an amount as well as tap a preset.', 'Tap the three dots, Sell gift card, key 3 0 0, tap Next, leave Hand over / print, then Add gift card to cart.'], reveal: SPOT.giftKeys, via: SPOT.cartMenu, gesture: 'tap', allow: ['add'], at: placeWin },
    { id: 'sell-and-pay', title: 'Sell a $25.00 gift card and take the payment by card', until: { kind: 'state', test: saleDone(1) }, inject: [{ kind: 'cart', items: [] }],
      ladder: ['Sell the card first, then pay for it like any item.', 'The $25.00 preset is the quickest amount.', 'Tap the three dots, Sell gift card, $25.00, Next, Add gift card to cart, then Charge, Card and No receipt.'], reveal: SPOT.giftAdd, via: SPOT.cartMenu, gesture: 'tap', allow: ['add', 'tender', 'sale'], at: placeWin },
  ],
  check2: [
    { id: 'declined-card', title: 'Sell a $25.00 gift card and pay by card. The card will be declined once', until: { kind: 'state', test: saleDone(1) }, inject: [{ kind: 'cart', items: [] }, { kind: 'decline', times: 1 }], taughtBy: 'declined',
      ladder: ['The card is declined once, but the sale is not lost.', 'The Not approved window keeps the gift card in the cart. One button tries the card again.', 'Sell a $25.00 gift card, then Charge and Card, then Try card again on the Not approved window, then No receipt.'], reveal: SPOT.payRetry, via: SPOT.cartCharge, gesture: 'tap', allow: ['add', 'tender', 'sale'], at: placeWin },
    { id: 'emailed-card', title: 'Sell a $50.00 gift card and email it to priya@example.com', until: { kind: 'state', test: emailedSale(2) }, inject: [{ kind: 'cart', items: [] }], taughtBy: 'email',
      ladder: ['This customer wants the card emailed, not handed over.', 'In the Gift card window, choose Email it and key a valid address.', 'Tap the three dots, Sell gift card, $50.00, Next, Email it, key priya@example.com, then Add gift card to cart, Charge, Card and No receipt.'], reveal: SPOT.giftEmail, via: SPOT.cartMenu, gesture: 'tap', allow: ['add', 'tender', 'sale'], at: placeWin },
  ],
  recap: ['You sell a gift card from the cart menu, choosing a preset amount or keying your own.', 'You choose whether the customer gets it handed over printed or emailed by Shopify.', 'The card becomes a paid-for line in the cart, and the code and QR are on the receipt afterwards.', 'A declined card keeps the gift card in the cart, and Try card again takes the card once more.'],
};
