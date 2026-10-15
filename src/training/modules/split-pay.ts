// Location: src/training/modules/split-pay.ts
// "Split a payment": Charge, the Payment page, the Split window (equal parts or a chosen first amount), paying each part a
// different way, and the receipt. Check 2 covers a card that is declined on its part and a customer who changes their mind.
// Practice data only: nothing is charged and the practice drawer is separate from the real one.
import type { TrainingModule } from '../../lib/trainingModule';
import { SPOT, gridItemSpot, cashDenomSpot, splitEqualSpot } from '../../lib/trainingSpots';

const BEE = 'train-v-bee'; const EGG = 'train-v-egg'; const COW_L = 'train-v-cow-l';
const has = (s: { cart: { variantId?: string }[] }, id: string): boolean => s.cart.some(l => l.variantId === id);
/** The sale is done and the Receipt window is closed again, so the next goal starts on a clear screen. */
const saleDone = (n: number) => (s: { sales: number; sheets: number }): boolean => s.sales >= n && s.sheets === 0;
/** A finished sale that was paid both ways (a split): the kinds of money it went through. */
const splitDone = (n: number) => (s: { sales: number; sheets: number; lastSaleKinds?: string[] }): boolean => s.sales >= n && s.sheets === 0 && !!s.lastSaleKinds && s.lastSaleKinds.includes('cash') && s.lastSaleKinds.includes('card');
/** The whole sale paid one way (used to tell "cancel the split" finished too). */
const oneWayDone = (n: number, kind: string) => (s: { sales: number; sheets: number; lastSaleKinds?: string[] }): boolean => s.sales >= n && s.sheets === 0 && !!s.lastSaleKinds?.length && s.lastSaleKinds.every(k => k === kind);

const place = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: false };
const placeWin = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: true };

export const splitPay: TrainingModule = {
  id: 'split-pay', title: 'Split a payment', summary: 'When one customer pays part cash and part card. Split the total into parts, take each one, and know what to do when a part is declined or the customer changes their mind. Eight minutes with practice data, nothing is charged.', minutes: 8,
  flow: 'standard', card: 'manual', tabs: ['checkout'], routes: ['cart', 'pay'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 20, w: 560, h: 34, label: 'Split a payment', size: 22, align: 'center' },
        { id: 'in-sub', kind: 'text', x: 60, y: 58, w: 520, h: 40, label: 'One sale, more than one way to pay. Split the total, then take each part.', size: 13, align: 'center', hidden: true },
        { id: 'c-when', kind: 'panel', x: 40, y: 108, w: 270, h: 96, label: 'WHEN YOU SPLIT', hidden: true },
        { id: 'i-when', kind: 'icon', x: 52, y: 138, w: 44, h: 44, icon: 'git-branch', tone: 'accent', size: 34, hidden: true },
        { id: 't-when', kind: 'text', x: 104, y: 130, w: 198, h: 66, label: 'Part cash, part card', sub: 'Or a card that only covers part of it.', size: 15, hidden: true },
        { id: 'c-how', kind: 'panel', x: 330, y: 108, w: 270, h: 96, label: 'HOW YOU SPLIT', hidden: true },
        { id: 'i-how', kind: 'icon', x: 342, y: 138, w: 44, h: 44, icon: 'calculator', tone: 'accent', size: 34, hidden: true },
        { id: 't-how', kind: 'text', x: 394, y: 130, w: 198, h: 74, label: 'Equal or a first amount', sub: 'Two, three or four parts, or key the first.', size: 15, hidden: true },
        { id: 'c-take', kind: 'panel', x: 40, y: 216, w: 270, h: 96, label: 'TAKE EACH PART', hidden: true },
        { id: 'i-take', kind: 'icon', x: 52, y: 246, w: 44, h: 44, icon: 'card', tone: 'accent', size: 34, hidden: true },
        { id: 't-take', kind: 'text', x: 104, y: 238, w: 198, h: 66, label: 'One way at a time', sub: 'The page shows what is left after each part.', size: 15, hidden: true },
        { id: 'c-fix', kind: 'panel', x: 330, y: 216, w: 270, h: 96, label: 'IF A PART FAILS', hidden: true },
        { id: 'i-fix', kind: 'icon', x: 342, y: 246, w: 44, h: 44, icon: 'refresh', tone: 'accent', size: 34, hidden: true },
        { id: 't-fix', kind: 'text', x: 394, y: 238, w: 198, h: 66, label: 'Try again or change it', sub: 'A declined part keeps the rest of the plan.', size: 15, hidden: true },
        { id: 'c-note', kind: 'panel', x: 40, y: 324, w: 560, h: 60, label: 'CANCEL SPLIT', hidden: true },
        { id: 'i-note', kind: 'icon', x: 52, y: 338, w: 36, h: 36, icon: 'close-circle', tone: 'accent', size: 28, hidden: true },
        { id: 't-note', kind: 'text', x: 98, y: 338, w: 490, h: 40, label: 'Changed your mind? Cancel split puts the whole amount back on one payment.', size: 13, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', title: 'One sale, more than one way', say: 'Sometimes a customer pays part cash and part card, or their card only covers part of the bill. You split the total, then take each part a different way.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub', note: 'What a split is' },
      { id: 'when', title: 'When you split', say: 'Use it when one payment will not cover everything and the customer wants to use more than one way to pay.', set: { 'c-when': { hidden: false }, 'i-when': { hidden: false }, 't-when': { hidden: false } }, focus: 'c-when', note: 'Part cash, part card' },
      { id: 'how', title: 'How you split', say: 'The Split window offers two, three or four equal parts, or you key the first amount and the rest follows.', set: { 'c-how': { hidden: false }, 'i-how': { hidden: false }, 't-how': { hidden: false } }, focus: 'c-how', note: 'Equal or a first amount' },
      { id: 'take', title: 'Take each part', say: 'The Payment page now asks for the first part. Take it by cash or card, then the page asks for what is left until nothing remains.', set: { 'c-take': { hidden: false }, 'i-take': { hidden: false }, 't-take': { hidden: false } }, focus: 'c-take', note: 'One part at a time' },
      { id: 'fix', title: 'If a part fails', say: 'A part can be declined or the customer can change their mind. The rest of the plan is kept, and Cancel split puts the whole amount back on one payment.', set: { 'c-fix': { hidden: false }, 'i-fix': { hidden: false }, 't-fix': { hidden: false } }, focus: 'c-fix', note: 'Nothing is lost' },
      { id: 'cancel', title: 'Cancel split', say: 'If the customer pays another way instead, tap Cancel split. The whole amount goes back to being one payment.', set: { 'c-note': { hidden: false }, 'i-note': { hidden: false }, 't-note': { hidden: false } }, focus: 'c-note', note: 'Back to one payment' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'pay', nodes: [
        { id: 'bar', kind: 'bar', x: 0, y: 0, w: 440, h: 40, label: 'Payment', sub: 'Practice data' },
        { id: 'due-label', kind: 'text', x: 20, y: 48, w: 400, h: 18, label: 'Total due', size: 13, align: 'center' },
        { id: 'due', kind: 'text', x: 20, y: 66, w: 400, h: 50, label: '$14.00', size: 38, align: 'center' },
        { id: 'next-pay', kind: 'text', x: 20, y: 118, w: 400, h: 20, label: 'Next payment: $7.00 · then $7.00', size: 14, align: 'center', hidden: true },
        { id: 'btn-card', kind: 'button', x: 40, y: 148, w: 360, h: 36, label: 'Card', icon: 'card' },
        { id: 'btn-cash', kind: 'button', x: 40, y: 192, w: 360, h: 36, label: 'Cash', icon: 'cash', tone: 'neutral' },
        { id: 'btn-gift', kind: 'button', x: 40, y: 236, w: 360, h: 36, label: 'Gift card', icon: 'gift', tone: 'neutral' },
        { id: 'btn-split', kind: 'button', x: 40, y: 280, w: 360, h: 36, label: 'Split', icon: 'git-branch', tone: 'neutral' },
        { id: 'btn-cancel', kind: 'button', x: 40, y: 324, w: 360, h: 32, label: 'Cancel split', tone: 'neutral', hidden: true },
        { id: 'win', kind: 'panel', x: 430, y: 40, w: 200, h: 300, label: 'SPLIT AMOUNT', hidden: true },
        { id: 'win-first', kind: 'text', x: 440, y: 60, w: 180, h: 18, label: 'First payment', size: 12, align: 'center', hidden: true },
        { id: 'win-amt', kind: 'text', x: 440, y: 78, w: 180, h: 40, label: '$7.00', size: 30, align: 'center', hidden: true },
        { id: 'win-eq2', kind: 'button', x: 452, y: 126, w: 156, h: 32, label: 'Split equally 2', tone: 'neutral', hidden: true },
        { id: 'win-eq3', kind: 'button', x: 452, y: 164, w: 156, h: 32, label: 'Split equally 3', tone: 'neutral', hidden: true },
        { id: 'win-keys', kind: 'panel', x: 452, y: 206, w: 156, h: 80, label: '1 2 3\n4 5 6\n7 8 9', hidden: true },
        { id: 'win-cont', kind: 'button', x: 452, y: 292, w: 156, h: 32, label: 'Continue', hidden: true },
        { id: 'dock', kind: 'panel', x: 0, y: 366, w: 640, h: 34 },
        { id: 'dock-say', kind: 'text', x: 14, y: 370, w: 612, h: 26, label: 'Split the total, then take each part.', size: 13 },
      ] },
    ],
    steps: [
      { id: 'page', title: 'The Payment page', say: 'This is a $14.00 sale and the customer wants to pay half cash and half card. Tap Split.', focus: 'btn-split', note: 'Split is alongside the other ways', set: { 'dock-say': { label: 'Tap Split to begin.' } } },
      { id: 'window', title: 'The Split window', say: 'Split asks how the total is cut up. Split equally divides it into two, three or four parts that match. Or key the first amount and the rest follows.', tap: 'btn-split', set: { win: { hidden: false }, 'win-first': { hidden: false }, 'win-amt': { hidden: false }, 'win-eq2': { hidden: false }, 'win-eq3': { hidden: false }, 'win-keys': { hidden: false }, 'win-cont': { hidden: false }, 'dock-say': { label: 'Choose equal parts, or key a first amount.' } }, focus: 'win', note: 'How it is cut up' },
      { id: 'equal', title: 'Split equally 2', say: '$14.00 in two equal parts is $7.00 and $7.00. Tap Split equally 2.', tap: 'win-eq2', set: { win: { hidden: true }, 'win-first': { hidden: true }, 'win-amt': { hidden: true }, 'win-eq2': { hidden: true }, 'win-eq3': { hidden: true }, 'win-keys': { hidden: true }, 'win-cont': { hidden: true }, 'next-pay': { hidden: false }, 'btn-cancel': { hidden: false }, 'dock-say': { label: 'The first part is $7.00.' } }, focus: 'next-pay', note: 'The plan is set' },
      { id: 'first', title: 'Take the first part', say: 'The page now shows Next payment: $7.00. Take it by cash or card, exactly as for a whole payment.', tap: 'btn-cash', set: { 'next-pay': { label: 'Next payment: $7.00' }, 'dock-say': { label: 'Tap Cash to take the first part.' } }, focus: 'btn-cash', note: 'First part by cash' },
      { id: 'second', title: 'Take what is left', say: 'After the first part, the page asks for the rest. Tap Card and the customer finishes it on the terminal. The sale then finishes and offers a receipt.', set: { 'due-label': { label: 'Remaining' }, 'due': { label: '$7.00' }, 'dock-say': { label: 'Now the second half by card.' } }, focus: 'due', note: 'Then the last part' },
      { id: 'declined', title: 'If a part is declined', say: 'A card part can be declined. The Not approved window appears and the rest of the plan is kept. Try card again, or use another method for that part.', set: { 'next-pay': { hidden: true }, 'dock-say': { label: 'The plan is kept. Choose what happens next.' } }, focus: 'btn-cancel', note: 'The plan is kept' },
      { id: 'cancel', title: 'Cancel split', say: 'If the customer decides to pay another way instead, tap Cancel split. The whole amount goes back to being one payment.', set: { 'due-label': { label: 'Total due' }, 'due': { label: '$14.00' }, 'btn-cancel': { hidden: true }, 'dock-say': { label: 'Cancel split puts it all back on one payment.' } }, focus: 'due', note: 'Back to one payment' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will take one sale paid half in cash and half by card, on the real till with practice data. Nothing is charged. For the card half you play the customer on the terminal that appears beside the till.', until: { kind: 'next' } },
    { id: 'g-add-bee', target: gridItemSpot(BEE), say: 'First a sale to split. Tap the Bumble Bee tile to add it to the cart.', until: { kind: 'state', test: s => has(s, BEE) }, gesture: 'tap', allow: ['add'], recover: { say: 'On the Checkout tab, tap the Bumble Bee tile.', target: SPOT.tabCheckout }, at: { tabs: ['checkout'], routes: ['cart'], sheets: false } },
    { id: 'g-add-egg', target: gridItemSpot(EGG), say: 'And the Dragon Egg, so the total is $14.00 and divides evenly.', until: { kind: 'state', test: s => has(s, EGG) }, gesture: 'tap', allow: ['add'], recover: { say: 'Tap the Dragon Egg tile to add it.', target: SPOT.tabCheckout }, at: { tabs: ['checkout'], routes: ['cart'], sheets: false } },
    { id: 'g-charge', target: SPOT.cartCharge, say: 'The cart is ready. Tap Charge to open the Payment page. On a phone, open the cart from the bar at the bottom first.', until: { kind: 'press', id: SPOT.cartCharge }, gesture: 'tap', allow: [], recover: { say: 'On a phone, tap the cart bar at the bottom of the screen, then tap Charge.', target: SPOT.cartOpen }, at: { tabs: ['checkout'], routes: ['cart'], sheets: false } },
    { id: 'g-page', target: SPOT.payTotal, say: 'This is the Payment page. The whole $14.00 is due. Instead of one way, the customer wants to split it.', until: { kind: 'next' }, at: { tabs: ['checkout'], routes: ['pay'], sheets: false } },
    { id: 'g-split', target: SPOT.paySplit, say: 'Tap Split. It sits with the other ways to pay.', until: { kind: 'press', id: SPOT.paySplit }, gesture: 'tap', allow: ['tender'], recover: { say: 'Tap Charge to open the Payment page, then tap Split.', target: SPOT.cartCharge }, at: { tabs: ['checkout'], routes: ['pay'], sheets: false } },
    { id: 'g-window', target: SPOT.splitKeys, say: 'The Split window asks how the total is cut up. Split equally divides it into matching parts. You can also key a first amount and the rest follows.', until: { kind: 'next' }, allow: [], at: placeWin },
    { id: 'g-equal', target: splitEqualSpot(2), say: 'Tap Split equally 2. That is $7.00 now and $7.00 after.', until: { kind: 'press', id: splitEqualSpot(2) }, gesture: 'tap', allow: [], recover: { say: 'Tap Split on the Payment page again, then tap Split equally 2.', target: SPOT.paySplit }, at: placeWin },
    { id: 'g-first', target: SPOT.payCash, say: 'The first part is $7.00. Take it in cash. Tap Cash.', until: { kind: 'press', id: SPOT.payCash }, gesture: 'tap', allow: [], recover: { say: 'Tap Cash on the Payment page for the first part.', target: SPOT.payCash }, at: { tabs: ['checkout'], routes: ['pay'], sheets: false } },
    { id: 'g-tap5', target: cashDenomSpot(500), say: 'The customer hands over a $5 note. Tap it.', until: { kind: 'state', test: s => s.cash?.received === 500 }, gesture: 'tap', allow: [], recover: { say: 'Tap the $5 note on the pad.', target: SPOT.cashPad }, at: placeWin },
    { id: 'g-tap2', target: cashDenomSpot(200), say: 'And a $2 coin, so $7.00 in all is exact.', until: { kind: 'state', test: s => s.cash?.received === 700 }, gesture: 'tap', allow: [], recover: { say: 'Tap the $2 coin so the amount is exact.', target: SPOT.cashPad }, at: placeWin },
    { id: 'g-take', target: SPOT.cashTake, say: 'The amount is exact, so tap Take cash. Only the first part is paid; the sale does not finish yet.', until: { kind: 'press', id: SPOT.cashTake }, gesture: 'tap', allow: ['tender'], at: placeWin },
    { id: 'g-second', target: SPOT.payCard, say: 'The page now asks for the rest: Next payment $7.00. The customer wants this part by card, so tap Card.', until: { kind: 'press', id: SPOT.payCard }, gesture: 'tap', allow: ['tender'], recover: { say: 'Tap Card for the remaining $7.00.', target: SPOT.payCard }, at: { tabs: ['checkout'], routes: ['pay'], sheets: false } },
    { id: 'g-tap', target: SPOT.terminalTap, say: 'This is the customer\'s terminal. For this part you are the customer. Tap card to pay the last $7.00.', until: { kind: 'press', id: SPOT.terminalTap }, gesture: 'tap', allow: ['tender', 'sale'], recoverFrom: [{ say: 'The card part was cancelled. Tap Card to start it again.', target: SPOT.payCard }], recover: { say: 'Tap Card on the Payment page, then tap card on the terminal.', target: SPOT.payCard }, at: place },
    { id: 'g-wait', say: 'The terminal checks the card. When it is approved the till finishes the whole sale by itself. Wait for the Receipt window.', until: { kind: 'visible', id: SPOT.receiptNone }, allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-receipt', target: SPOT.receiptNone, say: 'The sale is complete, paid half cash and half card. For practice, tap No receipt.', until: { kind: 'state', test: s => s.sales >= 1 && s.sheets === 0 }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-done', say: 'The cart is clear. If a card part is ever declined, the Not approved window keeps the rest of the plan, and Cancel split puts the whole amount back on one payment. You will practise both next.', until: { kind: 'next' }, at: { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: false } },
  ],
  check1: [
    { id: 'equal-cash-card', title: 'Split this $14.00 sale in two equal parts: the first in cash, the second by card', until: { kind: 'state', test: splitDone(1) }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }],
      ladder: ['The total divides evenly.', 'Split, then Split equally 2, makes two $7.00 parts.', 'Take the first $7.00 in cash ($5 + $2), then tap Card and tap card on the terminal, then No receipt.'], reveal: SPOT.paySplit, via: SPOT.cartCharge, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'first-amount', title: 'The customer pays $5.00 in cash first, and the rest by card. Key the first amount yourself', until: { kind: 'state', test: splitDone(2) }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }],
      ladder: ['You do not need equal parts this time.', 'In the Split window, key 5 0 0 and tap Continue: the first part is $5.00.', 'Take $5.00 in cash (a $5 note), then tap Card and tap card on the terminal, then No receipt.'], reveal: SPOT.splitContinue, via: SPOT.paySplit, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
  ],
  check2: [
    { id: 'declined-part', title: 'Split this $14.00 sale in two. The card is declined on the first part', until: { kind: 'state', test: splitDone(1) }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }, { kind: 'decline', times: 1 }], taughtBy: 'declined',
      ladder: ['A declined card keeps the whole plan.', 'The Not approved window has Use another method. Take this part in cash instead.', 'Split equally 2, tap Card, tap card on the terminal (declined), Use another method, then Cash, $5 + $2, Take cash, then Card and card again, then No receipt.'], reveal: SPOT.payOther, via: SPOT.paySplit, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'changed-mind', title: 'The customer starts to split a $12.00 sale, then decides to pay it all by card', until: { kind: 'state', test: oneWayDone(1, 'card') }, inject: [{ kind: 'cart', items: [{ variantId: COW_L, qty: 1 }] }], taughtBy: 'cancel',
      ladder: ['A split can be undone before any part is taken.', 'Cancel split puts the whole amount back on one payment.', 'Split, Split equally 2, then tap Cancel split, then Card, tap card on the terminal, then No receipt.'], reveal: SPOT.splitCancel, via: SPOT.paySplit, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
  ],
  recap: ['You split a total into equal parts, or key the first amount and let the rest follow.', 'You take each part a different way, and the page shows what is left after each one.', 'You know a declined part keeps the rest of the plan, and Cancel split puts the whole amount back on one payment.', 'You know the sale only finishes when nothing remains.'],
};
