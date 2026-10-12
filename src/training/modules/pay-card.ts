// Location: src/training/modules/pay-card.ts
// "Take a card payment": Charge, the Payment page, the customer's side on the virtual Zeller terminal (manual mode), the result, and the receipt.
// Check 2 declines the card (51, then 54) so the person has to retry. Practice data only: nothing is charged and no receipt is sent.
import type { TrainingModule } from '../../lib/trainingModule';
import { SPOT, gridItemSpot } from '../../lib/trainingSpots';

const BEE = 'train-v-bee'; const EGG = 'train-v-egg'; const DRAGON = 'train-v-dragon'; const KEY = 'train-v-key';
const has = (s: { cart: { variantId?: string }[] }, id: string): boolean => s.cart.some(l => l.variantId === id);
/** A sale finished and the Receipt window is closed again, so the next goal starts on a clear screen. */
const saleDone = (n: number) => (s: { sales: number; sheets: number; lastSaleKinds?: string[] }): boolean => s.sales >= n && s.sheets === 0 && !!s.lastSaleKinds?.length && s.lastSaleKinds.every(k => k === 'card');
/** Paying a card sale another way. While the Cash, Gift card or Split choice is open the person is walked back to Card; once a sale has gone through another way it can only be started again. */
const NOT_CARD = ['cash', 'gift_card', 'exchange_credit'];
const wrongWays = [
  { id: 'wrong-way-open', when: (s: { payOpen?: string }) => !!s.payOpen, say: 'The customer is paying by card, not by cash, gift card or split. Close this window, then tap Card.', target: SPOT.sheetClose, how: ['Tap Close at the top of the window.', 'Tap Card on the Payment page.'], taughtIn: 'welcome' },
  { id: 'wrong-way-done', when: (s: { lastSaleKinds?: string[] }) => !!s.lastSaleKinds?.some(k => NOT_CARD.includes(k)), say: 'That sale was paid another way, and this part needs a card payment. Tap Start this part again.', fix: 'restart' as const, how: ['Tap Start this part again.'] },
];
const place = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: false };
const placeWin = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: true };

export const payCard: TrainingModule = {
  id: 'pay-card', title: 'Take a card payment', summary: 'Charge a sale by card, play the customer at the terminal, and know what to do when a card is declined. Eight minutes with practice data, nothing is charged.', minutes: 8,
  flow: 'standard', card: 'manual', tabs: ['checkout'], routes: ['cart', 'pay'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 20, w: 560, h: 34, label: 'Take a card payment', size: 22, align: 'center' },
        { id: 'in-sub', kind: 'text', x: 60, y: 58, w: 520, h: 40, label: 'Two screens work together: the till in your hands and the terminal in the customer\'s.', size: 13, align: 'center', hidden: true },
        { id: 'c-page', kind: 'panel', x: 40, y: 108, w: 270, h: 96, label: 'THE PAYMENT PAGE', hidden: true },
        { id: 'i-page', kind: 'icon', x: 52, y: 138, w: 44, h: 44, icon: 'card', tone: 'accent', size: 34, hidden: true },
        { id: 't-page', kind: 'text', x: 104, y: 130, w: 198, h: 66, label: 'Charge', sub: 'Shows what is left to pay and the ways to pay it.', size: 15, hidden: true },
        { id: 'c-term', kind: 'panel', x: 330, y: 108, w: 270, h: 96, label: 'THE TERMINAL', hidden: true },
        { id: 'i-term', kind: 'icon', x: 342, y: 138, w: 44, h: 44, icon: 'wifi', tone: 'accent', size: 34, hidden: true },
        { id: 't-term', kind: 'text', x: 394, y: 130, w: 198, h: 66, label: 'Customer side', sub: 'They tap or insert a card. Over $100 they key a PIN.', size: 15, hidden: true },
        { id: 'c-ok', kind: 'panel', x: 40, y: 216, w: 270, h: 96, label: 'APPROVED', hidden: true },
        { id: 'i-ok', kind: 'icon', x: 52, y: 246, w: 44, h: 44, icon: 'checkmark-circle', tone: 'good', size: 34, hidden: true },
        { id: 't-ok', kind: 'text', x: 104, y: 238, w: 198, h: 66, label: 'The sale finishes', sub: 'The till is told at once and offers a receipt.', size: 15, hidden: true },
        { id: 'c-bad', kind: 'panel', x: 330, y: 216, w: 270, h: 96, label: 'NOT APPROVED', hidden: true },
        { id: 'i-bad', kind: 'icon', x: 342, y: 246, w: 44, h: 44, icon: 'close-circle', tone: 'bad', size: 34, hidden: true },
        { id: 't-bad', kind: 'text', x: 394, y: 238, w: 198, h: 66, label: 'The cart is kept', sub: 'Try the card again or pay another way.', size: 15, hidden: true },
        { id: 'c-unk', kind: 'panel', x: 40, y: 324, w: 560, h: 60, label: 'NO ANSWER YET', hidden: true },
        { id: 'i-unk', kind: 'icon', x: 52, y: 338, w: 36, h: 36, icon: 'help-circle', tone: 'accent', size: 28, hidden: true },
        { id: 't-unk', kind: 'text', x: 98, y: 338, w: 490, h: 40, label: 'If the till cannot tell whether the card was charged, never charge again until it is settled.', size: 13, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', title: 'Two screens', say: 'A card payment uses the till and the Zeller terminal. You start it on the till. The customer finishes it on the terminal.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub', note: 'Till and terminal' },
      { id: 'page', title: 'The Payment page', say: 'Charge opens the Payment page. It shows the total still to pay and a button for each way to pay. Card starts the terminal.', set: { 'c-page': { hidden: false }, 'i-page': { hidden: false }, 't-page': { hidden: false } }, focus: 'c-page', note: 'Tap Card' },
      { id: 'terminal', title: 'The customer taps', say: 'The terminal wakes and shows the amount. The customer taps or inserts a card. For more than $100 it asks for a PIN as well.', set: { 'c-term': { hidden: false }, 'i-term': { hidden: false }, 't-term': { hidden: false } }, focus: 'c-term', note: 'Their part' },
      { id: 'approved', title: 'Approved', say: 'When the bank approves, the sale finishes by itself and the till offers a receipt. You do not tap anything to confirm it.', set: { 'c-ok': { hidden: false }, 'i-ok': { hidden: false }, 't-ok': { hidden: false } }, focus: 'c-ok', note: 'All done' },
      { id: 'declined', title: 'Not approved', say: 'A card can be declined. The terminal says why and the till keeps the cart. You choose what happens next.', set: { 'c-bad': { hidden: false }, 'i-bad': { hidden: false }, 't-bad': { hidden: false } }, focus: 'c-bad', note: 'Nothing is lost' },
      { id: 'unknown', title: 'No answer yet', say: 'Rarely, the till does not hear back. It says so and checks by itself. Do not charge again until it is settled, or the customer may pay twice.', set: { 'c-unk': { hidden: false }, 'i-unk': { hidden: false }, 't-unk': { hidden: false } }, focus: 'c-unk', note: 'Wait, then check' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'pay', nodes: [
        { id: 'bar', kind: 'bar', x: 0, y: 0, w: 440, h: 40, label: 'Payment', sub: 'Practice data' },
        { id: 'due-label', kind: 'text', x: 20, y: 48, w: 400, h: 18, label: 'Total due', size: 13, align: 'center' },
        { id: 'due', kind: 'text', x: 20, y: 66, w: 400, h: 50, label: '$8.00', size: 38, align: 'center' },
        { id: 'wait', kind: 'row', x: 20, y: 120, w: 400, h: 44, label: 'Waiting on terminal $8.00', sub: 'Customer is paying', hidden: true },
        { id: 'btn-card', kind: 'button', x: 40, y: 168, w: 360, h: 38, label: 'Card', icon: 'card' },
        { id: 'btn-cash', kind: 'button', x: 40, y: 214, w: 360, h: 38, label: 'Cash', icon: 'cash', tone: 'neutral' },
        { id: 'btn-gift', kind: 'button', x: 40, y: 260, w: 360, h: 38, label: 'Gift card', icon: 'gift', tone: 'neutral' },
        { id: 'btn-split', kind: 'button', x: 40, y: 306, w: 360, h: 38, label: 'Split', icon: 'git-branch', tone: 'neutral' },
        { id: 'term', kind: 'terminal', x: 470, y: 40, w: 150, h: 300, value: 'sleep', amount: 800, on: true },
        { id: 'term-cap', kind: 'text', x: 450, y: 344, w: 190, h: 18, label: 'The customer\'s terminal', size: 12, align: 'center' },
        { id: 'rc', kind: 'panel', x: 30, y: 60, w: 380, h: 250, label: 'RECEIPT', hidden: true },
        { id: 'rc-total', kind: 'text', x: 50, y: 88, w: 340, h: 40, label: '$8.00 Sale complete', size: 22, align: 'center', hidden: true },
        { id: 'btn-email', kind: 'button', x: 60, y: 140, w: 320, h: 34, label: 'Email receipt', tone: 'neutral', hidden: true },
        { id: 'btn-text', kind: 'button', x: 60, y: 182, w: 320, h: 34, label: 'Text receipt', tone: 'neutral', hidden: true },
        { id: 'btn-none', kind: 'button', x: 60, y: 238, w: 320, h: 34, label: 'No receipt', hidden: true },
        { id: 'nap', kind: 'panel', x: 30, y: 60, w: 380, h: 250, label: 'NOT APPROVED', hidden: true },
        { id: 'nap-text', kind: 'text', x: 50, y: 90, w: 340, h: 26, label: 'Insufficient funds', size: 18, align: 'center', hidden: true },
        { id: 'nap-sub', kind: 'text', x: 50, y: 120, w: 340, h: 22, label: 'Code 51. The cart is kept.', size: 13, align: 'center', hidden: true },
        { id: 'btn-retry', kind: 'button', x: 60, y: 168, w: 320, h: 36, label: 'Try card again', hidden: true },
        { id: 'btn-other', kind: 'button', x: 60, y: 212, w: 320, h: 36, label: 'Use another method', tone: 'neutral', hidden: true },
        { id: 'unk', kind: 'panel', x: 30, y: 60, w: 380, h: 270, label: 'PAYMENT STATUS UNKNOWN', hidden: true },
        { id: 'unk-text', kind: 'text', x: 50, y: 90, w: 340, h: 24, label: 'Checking', size: 16, align: 'center', hidden: true },
        { id: 'unk-sub', kind: 'text', x: 50, y: 118, w: 340, h: 54, label: 'The customer may have been charged $8.00. Do not charge again until this is resolved.', size: 13, align: 'center', hidden: true },
        { id: 'btn-check', kind: 'button', x: 60, y: 184, w: 320, h: 34, label: 'Check again', tone: 'neutral', hidden: true },
        { id: 'btn-charged', kind: 'button', x: 60, y: 226, w: 320, h: 34, label: 'Customer WAS charged', tone: 'neutral', hidden: true },
        { id: 'btn-not', kind: 'button', x: 60, y: 268, w: 320, h: 34, label: 'Customer was NOT charged', tone: 'neutral', hidden: true },
        { id: 'dock', kind: 'panel', x: 0, y: 366, w: 640, h: 34 },
        { id: 'dock-say', kind: 'text', x: 14, y: 370, w: 612, h: 26, label: 'The total to pay is at the top.', size: 13 },
      ] },
    ],
    steps: [
      { id: 'total', title: 'What is left to pay', say: 'This is the Payment page. The big number is what is still to pay. The terminal on the right is the customer\'s.', focus: 'due', note: 'Still to pay', set: { 'dock-say': { label: 'Tap Card to start.' } } },
      { id: 'card', title: 'Tap Card', say: 'Tap Card. The terminal wakes and shows the amount, and the till waits for it.', tap: 'btn-card', set: { wait: { hidden: false }, 'term': { value: 'amount' }, 'dock-say': { label: 'Now the customer taps their card.' } }, focus: 'term', note: 'Amount shown' },
      { id: 'tap', title: 'The customer taps', say: 'The customer taps their card on the terminal. Under $100 that is all it takes.', tap: 'term', set: { term: { value: 'processing' }, 'dock-say': { label: 'The bank is checking the card.' } }, focus: 'term', note: 'Checking' },
      { id: 'pin', title: 'Over $100: a PIN', say: 'For $125 the terminal asks for a PIN. The customer keys it on the terminal and taps OK. You stand back.', set: { term: { value: 'pin', amount: 12500 }, 'due': { label: '$125.00' }, 'dock-say': { label: 'Over $100 the customer keys a PIN.' } }, focus: 'term', note: 'Their PIN' },
      { id: 'approved', title: 'Approved', say: 'The terminal says Approved. The till finishes the sale by itself.', set: { term: { value: 'approved', amount: 800 }, 'due': { label: '$8.00' }, 'dock-say': { label: 'Approved. The sale is finished.' } }, focus: 'term', note: 'Approved' },
      { id: 'receipt', title: 'The receipt', say: 'The Receipt window opens. Choose how the customer gets it, or tap No receipt. The cart then clears for the next customer.', set: { wait: { hidden: true }, rc: { hidden: false }, 'rc-total': { hidden: false }, 'btn-email': { hidden: false }, 'btn-text': { hidden: false }, 'btn-none': { hidden: false }, 'dock-say': { label: 'Tap No receipt, or send one.' } }, focus: 'btn-none', note: 'Done' },
      { id: 'declined', title: 'If the card is declined', say: 'Sometimes the card is declined. The Not approved window says why and keeps the cart. Try card again for the same card or another one, or Use another method.', set: { rc: { hidden: true }, 'rc-total': { hidden: true }, 'btn-email': { hidden: true }, 'btn-text': { hidden: true }, 'btn-none': { hidden: true }, term: { value: 'declined' }, nap: { hidden: false }, 'nap-text': { hidden: false }, 'nap-sub': { hidden: false }, 'btn-retry': { hidden: false }, 'btn-other': { hidden: false }, 'dock-say': { label: 'Read the reason, then choose.' } }, focus: 'nap-text', note: 'Read the reason' },
      { id: 'retry', title: 'Try card again', say: 'If the customer has another card, or wants to try the same one, tap Try card again. The terminal asks for the card once more. The cart stays as it was.', tap: 'btn-retry', set: { nap: { hidden: true }, 'nap-text': { hidden: true }, 'nap-sub': { hidden: true }, 'btn-retry': { hidden: true }, 'btn-other': { hidden: true }, term: { value: 'amount' }, 'dock-say': { label: 'Same sale, new attempt.' } }, focus: 'term', note: 'Asks again' },
      { id: 'unknown', title: 'Payment status unknown', say: 'If the till loses the answer it says Payment status unknown and checks by itself. Never charge again while this shows, or the customer may pay twice.', set: { term: { value: 'processing' }, unk: { hidden: false }, 'unk-text': { hidden: false }, 'unk-sub': { hidden: false }, 'btn-check': { hidden: false }, 'btn-charged': { hidden: false }, 'btn-not': { hidden: false }, 'dock-say': { label: 'Wait for it. Do not charge again.' } }, focus: 'unk-sub', note: 'Do not charge again' },
      { id: 'settle', title: 'Settling it', say: 'Tap Check again. Only if it still cannot tell, look at the terminal or the Zeller dashboard and tell the till whether the customer was charged.', tap: 'btn-check', set: { 'unk-text': { label: 'Checking again' }, 'dock-say': { label: 'Only say Charged if you saw it approved.' } }, focus: 'btn-charged', note: 'Only if you saw it' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will take one card payment on the real till with practice data. Nothing is charged. Part of it you play the customer on the terminal that appears beside the till.', until: { kind: 'next' } },
    { id: 'g-add', target: gridItemSpot(BEE), say: 'First a sale to pay for. Tap the Bumble Bee tile to add it to the cart.', until: { kind: 'state', test: s => has(s, BEE) }, gesture: 'tap', allow: ['add'], recover: { say: 'On the Checkout tab, tap the Bumble Bee tile.', target: SPOT.tabCheckout }, at: { tabs: ['checkout'], routes: ['cart'], sheets: false } },
    { id: 'g-charge', target: SPOT.cartCharge, say: 'The cart is ready. Tap Charge to open the Payment page. On a phone, open the cart from the bar at the bottom first.', until: { kind: 'press', id: SPOT.cartCharge }, gesture: 'tap', allow: [], recover: { say: 'On a phone, tap the cart bar at the bottom of the screen, then tap Charge.', target: SPOT.cartOpen }, at: { tabs: ['checkout'], routes: ['cart'], sheets: false } },
    { id: 'g-total', target: SPOT.payTotal, say: 'This is the Payment page. The number is what is still to pay. If the customer pays part another way, it counts down.', until: { kind: 'next' }, at: { tabs: ['checkout'], routes: ['pay'], sheets: false } },
    { id: 'g-card', target: SPOT.payCard, say: 'Tap Card. The terminal beside the till wakes up and shows the amount.', until: { kind: 'press', id: SPOT.payCard }, gesture: 'tap', allow: ['tender'], recover: { say: 'Tap Charge to open the Payment page, then tap Card.', target: SPOT.cartCharge }, at: { tabs: ['checkout'], routes: ['pay'], sheets: false }, watch: [wrongWays[0]] },
    { id: 'g-terminal', target: SPOT.terminalTap, say: 'This is the customer\'s terminal. For this part you are the customer. Under $100 a tap is all that is needed. Over $100 they key a PIN too.', until: { kind: 'next' }, allow: ['tender'], at: place },
    { id: 'g-tap', target: SPOT.terminalTap, say: 'Tap card, as the customer would.', until: { kind: 'press', id: SPOT.terminalTap }, gesture: 'tap', allow: ['tender', 'sale'], recoverFrom: [{ say: 'The payment was cancelled. Tap Card to start it again.', target: SPOT.payCard }, { say: 'Tap Charge to open the Payment page, then tap Card.', target: SPOT.cartCharge }], recover: { say: 'On a phone, tap the cart bar at the bottom of the screen, then tap Charge.', target: SPOT.cartOpen }, at: place },
    { id: 'g-wait', say: 'The terminal checks the card with the bank. When it is approved the till finishes the sale by itself. You do not tap anything. Wait for the Receipt window.', until: { kind: 'visible', id: SPOT.receiptNone }, allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-receipt', target: SPOT.receiptNone, say: 'The sale is complete. You can email, text or share a receipt from here. For practice, tap No receipt.', until: { kind: 'state', test: s => s.sales >= 1 && s.sheets === 0 }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-done', say: 'The cart is clear and the till is ready for the next customer. If a card is ever declined, the Not approved window has Try card again and Use another method. You will practise that next.', until: { kind: 'next' }, at: { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: false } },
  ],
  check1: [
    { id: 'card-sale', title: 'Take a card payment for the sale in the cart', until: { kind: 'state', test: saleDone(1) }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }],
      ladder: ['The cart is ready to be paid.', 'Charge opens the Payment page, and Card starts the terminal.', 'You are the customer at the terminal: tap card.', 'Tap Charge, then Card, then Tap card on the terminal, then No receipt.'], reveal: SPOT.payCard, via: SPOT.cartCharge, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin, watch: wrongWays },
    { id: 'pin-sale', title: 'Take a card payment for this bigger sale. It is over $100, so the customer needs a PIN', until: { kind: 'state', test: saleDone(2) }, inject: [{ kind: 'cart', items: [{ variantId: DRAGON, qty: 5 }] }],
      ladder: ['The total is over the contactless limit.', 'After the customer taps, the terminal asks for something more.', 'Key any four digits on the terminal, then tap OK on its screen.', 'Tap Card, tap card on the terminal, key 1, 2, 3, 4 and OK, then tap No receipt.'], reveal: SPOT.terminalPinpad, via: SPOT.payCard, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin, watch: wrongWays },
  ],
  check2: [
    { id: 'declined-once', title: 'Take a card payment. The customer\'s first card will be declined', until: { kind: 'state', test: saleDone(1) }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: KEY, qty: 1 }] }, { kind: 'decline', times: 1 }], taughtBy: 'retry',
      ladder: ['If the card is declined, the cart is kept.', 'The Not approved window has two buttons. One tries the card again.', 'Tap Try card again, then tap card on the terminal.'], reveal: SPOT.payRetry, via: SPOT.payCard, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin, watch: wrongWays },
    { id: 'declined-twice', title: 'Take this payment. Two cards will be declined, then a third works', until: { kind: 'state', test: saleDone(2) }, inject: [{ kind: 'cart', items: [{ variantId: DRAGON, qty: 1 }] }, { kind: 'decline', times: 2, code: '54' }], taughtBy: 'declined',
      ladder: ['Read the reason in the Not approved window each time.', 'A declined card does not empty the cart. You can try again as often as the customer wants.', 'Tap Try card again after each decline, and tap card on the terminal each time.'], reveal: SPOT.payRetry, via: SPOT.payCard, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin, watch: wrongWays },
  ],
  recap: ['You start a card payment with Charge and Card, and the customer finishes it on the terminal.', 'You know the customer keys a PIN over $100, and that an approved card finishes the sale by itself.', 'You know a declined card keeps the cart, and that Try card again or Use another method are your choices.', 'You never charge again while the status is unknown.'],
};
