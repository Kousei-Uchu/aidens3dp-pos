// Location: src/training/modules/gift-pay.ts
// "Pay with a gift card": checking a card's balance, paying with it, what happens when the card holds less than the
// total, and the card that cannot pay at all. Practice data only: the cards are made up and nothing is charged.
import type { TrainingModule, TrainSnap } from '../../lib/trainingModule';
import { SPOT, gridItemSpot } from '../../lib/trainingSpots';

const BEE = 'train-v-bee', EGG = 'train-v-egg';

const has = (s: { cart: readonly { variantId?: string }[] }, id: string): boolean => s.cart.some(l => l.variantId === id);
/** The code as the till treats it: letters and digits only, upper case. */
const typedCode = (s: { giftCode?: string }): string => (s.giftCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const checkedCode = (s: { giftCheck?: { code: string } }): string => s.giftCheck?.code ?? '';
/** A finished sale (the Receipt window closed again) whose tenders were exactly these kinds, in any order. */
const paidKinds = (n: number, kinds: readonly string[]) => (s: TrainSnap): boolean => {
  if (s.sales < n || s.sheets !== 0 || !s.lastSaleKinds) return false;
  return [...s.lastSaleKinds].sort().join('+') === [...kinds].sort().join('+');
};

const place = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: false };
const page = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: false };
const placeWin = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: true };

export const giftPay: TrainingModule = {
  id: 'gift-pay', title: 'Check and pay with a gift card', summary: 'Look up what is left on a gift card, take a payment with it, and know what to do when the card holds less than the total or cannot pay at all. Seven minutes with practice cards, nothing is charged.', minutes: 7,
  flow: 'standard', tabs: ['checkout'], routes: ['cart', 'pay'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 18, w: 560, h: 34, label: 'Pay with a gift card', size: 22, align: 'center' },
        { id: 'in-sub', kind: 'text', x: 60, y: 54, w: 520, h: 34, label: 'A gift card is money already on a card. The customer spends it like cash, and the balance comes off straight away.', size: 12, align: 'center', hidden: true },
        { id: 'c-check', kind: 'panel', x: 40, y: 106, w: 270, h: 96, label: 'CHECK THE BALANCE', hidden: true },
        { id: 'i-check', kind: 'icon', x: 52, y: 134, w: 44, h: 44, icon: 'calculator', tone: 'accent', size: 34, hidden: true },
        { id: 't-check', kind: 'text', x: 104, y: 126, w: 198, h: 66, label: 'Look it up first', sub: 'The card window shows how much is left and whether it can pay.', size: 13, hidden: true },
        { id: 'c-pay', kind: 'panel', x: 330, y: 106, w: 270, h: 96, label: 'USE IT TO PAY', hidden: true },
        { id: 'i-pay', kind: 'icon', x: 342, y: 134, w: 44, h: 44, icon: 'cart', tone: 'accent', size: 34, hidden: true },
        { id: 't-pay', kind: 'text', x: 394, y: 126, w: 198, h: 66, label: 'Use as payment', sub: 'Takes the total off the card like another tender.', size: 13, hidden: true },
        { id: 'c-straight', kind: 'panel', x: 40, y: 216, w: 270, h: 96, label: 'CHARGED AT ONCE', hidden: true },
        { id: 'i-straight', kind: 'icon', x: 52, y: 244, w: 44, h: 44, icon: 'flash', tone: 'good', size: 34, hidden: true },
        { id: 't-straight', kind: 'text', x: 104, y: 236, w: 198, h: 66, label: 'No card reader', sub: 'A gift card is charged straight away, so there is no terminal.', size: 13, hidden: true },
        { id: 'c-part', kind: 'panel', x: 330, y: 216, w: 270, h: 96, label: 'PART OF THE TOTAL', hidden: true },
        { id: 'i-part', kind: 'icon', x: 342, y: 244, w: 44, h: 44, icon: 'cash-outline', tone: 'neutral', size: 34, hidden: true },
        { id: 't-part', kind: 'text', x: 394, y: 236, w: 198, h: 66, label: 'The rest stays due', sub: 'If the card holds less, take the rest another way.', size: 13, hidden: true },
        { id: 'c-off', kind: 'panel', x: 200, y: 326, w: 240, h: 62, label: 'CANNOT PAY', hidden: true },
        { id: 'i-off', kind: 'icon', x: 210, y: 340, w: 34, h: 34, icon: 'close-circle', tone: 'bad', size: 28, hidden: true },
        { id: 't-off', kind: 'text', x: 250, y: 336, w: 182, h: 46, label: 'Disabled or empty', sub: 'Ask for another way to pay.', size: 13, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', say: 'A gift card is money the customer has already put on a card. Take the total off it like cash or card.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub' },
      { id: 'check', say: 'Start by looking the card up: the code is on the back. The window shows the balance and says whether the card is active.', set: { 'c-check': { hidden: false }, 'i-check': { hidden: false }, 't-check': { hidden: false } }, focus: 't-check' },
      { id: 'pay', say: 'If there is enough on the card, Use as payment takes the total and the sale is paid.', set: { 'c-pay': { hidden: false }, 'i-pay': { hidden: false }, 't-pay': { hidden: false } }, focus: 't-pay' },
      { id: 'straight', say: 'A gift card is charged straight away. There is no card reader and no terminal for it, unlike a bank card.', set: { 'c-straight': { hidden: false }, 'i-straight': { hidden: false }, 't-straight': { hidden: false } }, focus: 't-straight' },
      { id: 'part', say: 'A card can hold less than the total. It covers what it has and the rest is still due, so take that another way.', set: { 'c-part': { hidden: false }, 'i-part': { hidden: false }, 't-part': { hidden: false } }, focus: 't-part' },
      { id: 'off', say: 'A card that is disabled or empty cannot pay. The window says so and leaves Use as payment out. Ask for another way.', set: { 'c-off': { hidden: false }, 'i-off': { hidden: false }, 't-off': { hidden: false } }, focus: 't-off' },
      { id: 'recap', say: 'So: check the balance, use the card for what it holds, and take the rest another way when it is short or off.', focus: 't-off' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'pay', nodes: [
        { id: 'bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Payment', sub: 'Practice data' },
        { id: 'due-label', kind: 'text', x: 20, y: 54, w: 290, h: 18, label: 'Total due', size: 13, align: 'center' },
        { id: 'due', kind: 'text', x: 20, y: 74, w: 290, h: 52, label: '$14.00', size: 38, align: 'center' },
        { id: 'btn-gift', kind: 'button', x: 340, y: 74, w: 270, h: 44, label: 'Gift card', tone: 'accent' },
        { id: 'win', kind: 'panel', x: 140, y: 126, w: 360, h: 246, label: 'CHECK GIFT CARD', hidden: true },
        { id: 'win-code', kind: 'text', x: 158, y: 158, w: 324, h: 30, label: 'GIFT25', size: 20, align: 'center', hidden: true },
        { id: 'win-scan', kind: 'button', x: 158, y: 200, w: 156, h: 34, label: 'Scan', hidden: true },
        { id: 'win-check', kind: 'button', x: 326, y: 200, w: 156, h: 34, label: 'Check', tone: 'accent', hidden: true },
        { id: 'win-last', kind: 'text', x: 158, y: 244, w: 324, h: 18, label: 'Card ••••0025', size: 13, align: 'center', hidden: true },
        { id: 'win-bal-label', kind: 'text', x: 158, y: 264, w: 324, h: 16, label: 'Balance', size: 12, align: 'center', hidden: true },
        { id: 'win-bal', kind: 'text', x: 158, y: 282, w: 324, h: 40, label: '$25.00', size: 30, align: 'center', hidden: true },
        { id: 'win-state', kind: 'text', x: 158, y: 322, w: 324, h: 18, label: 'Active', size: 13, align: 'center', tone: 'good', hidden: true },
        { id: 'win-use', kind: 'button', x: 158, y: 344, w: 324, h: 30, label: 'Use as payment', tone: 'good', hidden: true },
        { id: 'dock', kind: 'panel', x: 0, y: 376, w: 640, h: 24 },
        { id: 'dock-say', kind: 'text', x: 14, y: 379, w: 612, h: 20, label: 'Tap Gift card.', size: 13 },
      ] },
    ],
    steps: [
      { id: 'due', say: 'This is a $14.00 sale, and the customer wants to pay with a gift card.', focus: 'due', note: 'The total to pay' },
      { id: 'window', say: 'Tap Gift card. The Check gift card window opens.', tap: 'btn-gift', set: { win: { hidden: false }, 'win-code': { hidden: false }, 'win-scan': { hidden: false }, 'win-check': { hidden: false }, 'dock-say': { label: 'Key the code and tap Check.' } }, focus: 'win', note: 'The card window' },
      { id: 'code', say: 'The code is on the back of the card. Key it, or tap Scan to read it with the camera.', tap: 'win-code', focus: 'win-code', note: 'Type or scan the code' },
      { id: 'balance', say: 'Tap Check. The window looks the card up and shows the balance and whether it can pay.', tap: 'win-check', set: { 'win-last': { hidden: false }, 'win-bal-label': { hidden: false }, 'win-bal': { hidden: false }, 'win-state': { hidden: false }, 'win-use': { hidden: false } }, focus: 'win-bal', note: 'Its balance' },
      { id: 'use', say: 'Use as payment takes the total off the card. A gift card is charged straight away, so there is no card reader and no terminal.', tap: 'win-use', set: { win: { hidden: true }, 'win-code': { hidden: true }, 'win-scan': { hidden: true }, 'win-check': { hidden: true }, 'win-last': { hidden: true }, 'win-bal-label': { hidden: true }, 'win-bal': { hidden: true }, 'win-state': { hidden: true }, 'win-use': { hidden: true }, due: { label: '$0.00' }, 'dock-say': { label: 'Paid straight away from the card.' } }, focus: 'due', note: 'Paid in full' },
      { id: 'short', say: 'A card can hold less than the total. Use as payment covers what it has and the rest is still due, so take the rest another way.', set: { due: { label: '$9.00' }, 'dock-say': { label: 'The rest is still due.' } }, focus: 'due', note: 'The rest is due' },
      { id: 'off', say: 'A card that is disabled or empty cannot pay. The window says so and leaves Use as payment out, so ask for another way.', tap: 'btn-gift', set: { win: { hidden: false }, 'win-code': { hidden: false }, 'win-scan': { hidden: false }, 'win-check': { hidden: false }, 'win-last': { hidden: false, label: 'Card ••••0009' }, 'win-bal-label': { hidden: false }, 'win-bal': { hidden: false, label: '$10.00' }, 'win-state': { hidden: false, label: 'Disabled' }, 'dock-say': { label: 'Ask for another way to pay.' } }, focus: 'win-state', note: 'Cannot pay' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will take one sale paid with a gift card on the real till, using a made-up card. Nothing is charged, and you will check the balance before you use it.', until: { kind: 'next' } },
    { id: 'g-add-bee', target: gridItemSpot(BEE), say: 'First a sale to pay for. Tap the Bumble Bee tile to add it to the cart.', until: { kind: 'state', test: s => has(s, BEE) }, gesture: 'tap', allow: ['add'], recover: { say: 'On the Checkout tab, tap the Bumble Bee tile.', target: SPOT.tabCheckout }, at: place },
    { id: 'g-add-egg', target: gridItemSpot(EGG), say: 'And the Dragon Egg, so the total is $14.00.', until: { kind: 'state', test: s => has(s, EGG) }, gesture: 'tap', allow: ['add'], recover: { say: 'Tap the Dragon Egg tile to add it.', target: SPOT.tabCheckout }, at: place },
    { id: 'g-charge', target: SPOT.cartCharge, say: 'The cart is ready. Tap Charge to open the Payment page. On a phone, open the cart from the bar at the bottom first.', until: { kind: 'press', id: SPOT.cartCharge }, gesture: 'tap', allow: [], recover: { say: 'On a phone, tap the cart bar at the bottom, then tap Charge.', target: SPOT.cartOpen }, at: place },
    { id: 'g-page', target: SPOT.payTotal, say: 'This is the Payment page. Gift card is one of the ways to pay, beside Cash and Card.', until: { kind: 'next' }, allow: [], at: page },
    { id: 'g-gift', target: SPOT.payGift, say: 'Tap Gift card. The Check gift card window opens.', until: { kind: 'press', id: SPOT.payGift }, gesture: 'tap', allow: [], recover: { say: 'Tap Gift card on the Payment page.', target: SPOT.payGift }, at: page },
    { id: 'g-window', target: SPOT.giftCheckCode, say: 'This is the Check gift card window. Key the code from the back of the card, or tap Scan. The code on this practice card is GIFT25.', until: { kind: 'next' }, allow: [], at: placeWin },
    { id: 'g-code', target: SPOT.giftCheckCode, say: 'Key GIFT25 in the code box.', until: { kind: 'state', test: s => typedCode(s) === 'GIFT25' }, gesture: 'tap', typing: true, allow: [], at: placeWin },
    { id: 'g-check', target: SPOT.giftCheckCheck, say: 'Tap Check. The card is looked up and its balance shows.', until: { kind: 'state', test: s => s.giftCheck?.found === true && checkedCode(s) === 'GIFT25' && s.giftCheck?.balanceCents === 2500 }, gesture: 'tap', allow: [], at: placeWin },
    { id: 'g-balance', target: SPOT.giftCheckUse, say: 'The balance is $25.00 and the card is Active, more than the $14.00 sale. Use as payment is offered because the card can pay.', until: { kind: 'next' }, allow: [], at: placeWin },
    { id: 'g-use', target: SPOT.giftCheckUse, say: 'Tap Use as payment. The $14.00 comes off the card straight away. Unlike a bank card there is no terminal to wait for.', until: { kind: 'state', test: s => s.sales >= 1 }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-wait', say: 'The card covered the whole total, so the sale finished by itself. Wait for the Receipt window.', until: { kind: 'visible', id: SPOT.receiptNone }, allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-receipt', target: SPOT.receiptNone, say: 'The sale is complete. For practice, tap No receipt.', until: { kind: 'state', test: s => s.sales >= 1 && s.sheets === 0 }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-done', say: 'The cart is clear. Next you will do it without the hints: check a balance, then pay, then a card that is short and one that cannot pay at all.', until: { kind: 'next' }, at: place },
  ],
  check1: [
    { id: 'balance', title: 'Check the balance on the customer\'s card', until: { kind: 'state', test: s => s.giftCheck?.found === true && checkedCode(s) === 'GIFT25' && s.giftCheck?.balanceCents === 2500 }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }] }],
      ladder: ['A customer can ask what is left on a gift card.', 'Charge opens the Payment page, and Gift card opens the card window.', 'Tap Charge, Gift card, key GIFT25, then Check.'], reveal: SPOT.giftCheckCheck, via: SPOT.payGift, gesture: 'tap', allow: ['add', 'tender', 'sale'], at: placeWin },
    { id: 'pay-full', title: 'Take this $14.00 sale with the customer\'s gift card', until: { kind: 'state', test: paidKinds(1, ['gift_card']) }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }],
      ladder: ['The whole total can come off a gift card that holds enough.', 'Check the card, then Use as payment, and the sale is paid at once.', 'Tap Charge, Gift card, key GIFT25, Check, Use as payment, then No receipt.'], reveal: SPOT.giftCheckUse, via: SPOT.payGift, gesture: 'tap', allow: ['add', 'tender', 'sale'], at: placeWin },
  ],
  check2: [
    { id: 'part', title: 'The card only holds $5.00. Take the $14.00 sale, with the rest on card', until: { kind: 'state', test: paidKinds(1, ['gift_card', 'card']) }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }], taughtBy: 'short',
      ladder: ['A gift card can hold less than the total.', 'Use the card first: it takes what it can and the rest stays due.', 'Tap Charge, Gift card, key GIFT05, Check, Use as payment, then Card for the rest, then No receipt.'], reveal: SPOT.giftCheckUse, via: SPOT.payGift, gesture: 'tap', allow: ['add', 'tender', 'sale'], at: placeWin },
    { id: 'off', title: 'The customer\'s card is disabled. Check it, then take the whole $14.00 by card', until: { kind: 'state', test: s => checkedCode(s) === 'GIFTOFF' && s.giftCheck?.enabled === false && paidKinds(2, ['card'])(s) }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }], taughtBy: 'off',
      ladder: ['Not every gift card can pay.', 'Check the card first: a disabled card says so and has no Use as payment.', 'Tap Charge, Gift card, key GIFTOFF, Check, close the window, then Card, then No receipt.'], reveal: SPOT.giftCheckCheck, via: SPOT.payGift, gesture: 'tap', allow: ['add', 'tender', 'sale'], at: placeWin },
  ],
  recap: ['You check a gift card\'s balance before you use it, and the window tells you whether it can pay.', 'Use as payment takes the total off the card, charged straight away with no terminal.', 'A card that holds less covers part of the total and the rest is still due, so take it another way.', 'A card that is disabled or empty cannot pay, so ask for another way.'],
};
