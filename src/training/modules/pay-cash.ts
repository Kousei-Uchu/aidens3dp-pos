// Location: src/training/modules/pay-cash.ts
// "Take cash and give change": Charge, the Cash window, tapping the notes and coins handed over (and undoing a slip), reading Short, Exact and Change,
// giving the change the screen suggests, and the receipt. Check 2 covers a drawer that cannot make change, a short handover, and 5c rounding.
// Practice data only: the practice drawer is separate from the real ledger and nothing is saved.
import type { TrainingModule } from '../../lib/trainingModule';
import { SPOT, cashDenomSpot, gridItemSpot } from '../../lib/trainingSpots';

const BEE = 'train-v-bee'; const EGG = 'train-v-egg'; const KEY = 'train-v-key'; const STICKER = 'train-v-sticker';
const has = (s: { cart: { variantId?: string }[] }, id: string): boolean => s.cart.some(l => l.variantId === id);
/** The sale has finished and the Receipt window is closed again, so the next goal starts on a clear screen. */
const closed = (s: { sales: number; sheets: number }): boolean => s.sales >= 1 && s.sheets === 0;
/** Two sales are done and no window is open (the second, exact payment has closed its receipt). */
const closed2 = (s: { sales: number; sheets: number }): boolean => s.sales >= 2 && s.sheets === 0;
/** Closed, and the last cash payment was this much handed over with this much change given. */
const paid = (tendered: number, change: number) => (s: { sales: number; sheets: number; lastSaleCash?: { tendered: number; change: number } }): boolean => closed(s) && s.lastSaleCash?.tendered === tendered && s.lastSaleCash.change === change;
const received = (cents: number) => (s: { cash?: { received: number; step: string } }): boolean => s.cash?.step === 'receive' && s.cash.received === cents;
const NOT_CASH = ['card', 'gift_card', 'exchange_credit'];
/** A cash-only goal. Gift card or Split open is closed again, and a sale already paid another way can only be started again. */
const wrongWays = [
  { id: 'wrong-way-open', when: (s: { payOpen?: string }) => !!s.payOpen && s.payOpen !== 'cash', say: 'This part needs a cash payment. Close this window, then tap Cash.', target: SPOT.sheetClose, how: ['Tap Close at the top of the window.', 'Tap Cash on the Payment page.'], taughtIn: 'welcome' },
  { id: 'wrong-way-done', when: (s: { lastSaleKinds?: string[] }) => !!s.lastSaleKinds?.some(k => NOT_CASH.includes(k)), say: 'That sale was paid another way. Tap Start this part again.', fix: 'restart' as const, how: ['Tap Start this part again.'] },
];
const place = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: false };
const placeWin = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: true };
const phoneCharge = { say: 'On a phone, tap the cart bar at the bottom of the screen, then tap Charge.', target: SPOT.cartOpen };

export const payCash: TrainingModule = {
  id: 'pay-cash', title: 'Take cash and give change', summary: 'Tap the notes and coins the customer hands over, read Short, Exact or Change, and give the right change. Eight minutes with practice data and a practice drawer.', minutes: 8,
  flow: 'standard', card: 'auto', tabs: ['checkout'], routes: ['cart', 'pay'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 20, w: 560, h: 34, label: 'Take cash and give change', size: 22, align: 'center' },
        { id: 'in-sub', kind: 'text', x: 60, y: 58, w: 520, h: 40, label: 'You count what the customer hands over and tap it in. The till does the sums and tells you the change.', size: 13, align: 'center', hidden: true },
        { id: 'c-tap', kind: 'panel', x: 40, y: 108, w: 270, h: 96, label: 'TAP WHAT THEY GIVE', hidden: true },
        { id: 'i-tap', kind: 'icon', x: 52, y: 138, w: 44, h: 44, icon: 'cash', tone: 'accent', size: 34, hidden: true },
        { id: 't-tap', kind: 'text', x: 104, y: 130, w: 198, h: 66, label: 'Notes and coins', sub: 'Tap each one. A wrong tap has an Undo.', size: 15, hidden: true },
        { id: 'c-read', kind: 'panel', x: 330, y: 108, w: 270, h: 96, label: 'READ THE SCREEN', hidden: true },
        { id: 'i-read', kind: 'icon', x: 342, y: 138, w: 44, h: 44, icon: 'eye', tone: 'accent', size: 34, hidden: true },
        { id: 't-read', kind: 'text', x: 394, y: 130, w: 198, h: 66, label: 'Short, Exact, Change', sub: 'Short means ask for more. Change shows how much.', size: 15, hidden: true },
        { id: 'c-give', kind: 'panel', x: 40, y: 216, w: 270, h: 96, label: 'GIVE CHANGE', hidden: true },
        { id: 'i-give', kind: 'icon', x: 52, y: 246, w: 44, h: 44, icon: 'swap-horizontal', tone: 'accent', size: 34, hidden: true },
        { id: 't-give', kind: 'text', x: 104, y: 238, w: 198, h: 66, label: 'Take from the drawer', sub: 'The screen shows which notes and coins to hand over.', size: 15, hidden: true },
        { id: 'c-round', kind: 'panel', x: 330, y: 216, w: 270, h: 96, label: 'ROUNDED TO 5c', hidden: true },
        { id: 'i-round', kind: 'icon', x: 342, y: 246, w: 44, h: 44, icon: 'calculator', tone: 'accent', size: 34, hidden: true },
        { id: 't-round', kind: 'text', x: 394, y: 238, w: 198, h: 66, label: 'No 1c or 2c coins', sub: 'The cash due is rounded to the nearest 5c.', size: 15, hidden: true },
        { id: 'c-stuck', kind: 'panel', x: 40, y: 324, w: 560, h: 60, label: 'WHEN THE DRAWER CANNOT MAKE CHANGE', hidden: true },
        { id: 't-stuck', kind: 'text', x: 52, y: 346, w: 536, h: 36, label: 'The screen says so and offers a way out: a smaller handover, part cash and the rest another way, or all by card.', size: 12, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', title: 'You count, it calculates', say: 'You never work out change in your head. You tap in what the customer hands over, and the till tells you what is due and what to give back.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub', note: 'No mental maths' },
      { id: 'tap', title: 'Tap what they hand over', say: 'Tap each note and coin as the customer hands it over. Each tap adds one. A slip is fixed with Undo, which takes off the last tap.', set: { 'c-tap': { hidden: false }, 'i-tap': { hidden: false }, 't-tap': { hidden: false } }, focus: 'c-tap', note: 'Undo fixes a slip' },
      { id: 'read', title: 'Read the screen', say: 'Short, in red, means the customer has not given enough. Exact means no change. Change to give shows how much to hand back.', set: { 'c-read': { hidden: false }, 'i-read': { hidden: false }, 't-read': { hidden: false } }, focus: 'c-read', note: 'Three states' },
      { id: 'give', title: 'Give the change', say: 'On the next step the screen shows the notes and coins to take from the drawer. Hand them over, then tap Gave this to record it.', set: { 'c-give': { hidden: false }, 'i-give': { hidden: false }, 't-give': { hidden: false } }, focus: 'c-give', note: 'Then Gave this' },
      { id: 'round', title: 'Rounded to 5c', say: 'There are no 1c or 2c coins, so the cash due is rounded to the nearest 5c. A total of $7.44 is $7.45 in cash. Card is never rounded.', set: { 'c-round': { hidden: false }, 'i-round': { hidden: false }, 't-round': { hidden: false } }, focus: 'c-round', note: 'Nearest 5c' },
      { id: 'stuck', title: 'No change in the drawer', say: 'Sometimes the drawer does not hold the right notes and coins. The screen tells you, and offers a way out, so you never have to improvise.', set: { 'c-stuck': { hidden: false }, 't-stuck': { hidden: false } }, focus: 'c-stuck', note: 'It tells you' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'pay', nodes: [
        { id: 'p-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Payment', sub: 'Practice data' },
        { id: 'p-total', kind: 'text', x: 40, y: 70, w: 560, h: 50, label: '$14.00', size: 40, align: 'center' },
        { id: 'p-sub', kind: 'text', x: 40, y: 122, w: 560, h: 22, label: 'Left to pay', size: 14, align: 'center' },
        { id: 'p-card', kind: 'button', x: 120, y: 170, w: 400, h: 48, label: 'Card', icon: 'card', tone: 'neutral' },
        { id: 'p-cash', kind: 'button', x: 120, y: 230, w: 400, h: 48, label: 'Cash', icon: 'cash-outline', tone: 'neutral' },
      ] },
      { id: 'cash', nodes: [
        { id: 'c-panel', kind: 'panel', x: 60, y: 16, w: 520, h: 368, label: 'CASH RECEIVED' },
        { id: 'c-due', kind: 'text', x: 80, y: 46, w: 480, h: 30, label: 'Due $14.00', size: 20, align: 'center' },
        { id: 'c-state', kind: 'text', x: 80, y: 80, w: 480, h: 24, label: 'Tap what the customer hands over', size: 14, align: 'center' },
        { id: 'c-got', kind: 'text', x: 80, y: 108, w: 480, h: 44, label: '$0.00', size: 34, align: 'center' },
        { id: 'k-pad', kind: 'panel', x: 80, y: 160, w: 480, h: 96, label: 'NOTES AND COINS' },
        { id: 'k-5', kind: 'tile', x: 96, y: 184, w: 90, h: 58, label: '$5', color: '#E5E7EB' },
        { id: 'k-10', kind: 'tile', x: 196, y: 184, w: 90, h: 58, label: '$10', color: '#E5E7EB' },
        { id: 'k-20', kind: 'tile', x: 296, y: 184, w: 90, h: 58, label: '$20', color: '#E5E7EB' },
        { id: 'k-undo', kind: 'button', x: 420, y: 190, w: 124, h: 46, label: 'Undo', tone: 'neutral' },
        { id: 'c-next', kind: 'button', x: 80, y: 280, w: 480, h: 44, label: 'Next: give $6.00 change', hidden: true },
      ] },
      { id: 'give', nodes: [
        { id: 'g-panel', kind: 'panel', x: 60, y: 16, w: 520, h: 368, label: 'GIVE CHANGE' },
        { id: 'g-head', kind: 'text', x: 80, y: 48, w: 480, h: 26, label: 'Give the customer', size: 14, align: 'center' },
        { id: 'g-amt', kind: 'text', x: 80, y: 74, w: 480, h: 52, label: '$6.00', size: 38, align: 'center' },
        { id: 'g-take', kind: 'panel', x: 80, y: 132, w: 480, h: 110, label: 'TAKE FROM THE DRAWER' },
        { id: 'g-5', kind: 'tile', x: 180, y: 160, w: 110, h: 64, label: '$5', sub: 'x 1', color: '#E5E7EB' },
        { id: 'g-1', kind: 'tile', x: 350, y: 160, w: 110, h: 64, label: '$1', sub: 'x 1', color: '#E5E7EB' },
        { id: 'g-done', kind: 'button', x: 80, y: 264, w: 480, h: 44, label: 'Gave this' },
      ] },
      { id: 'sale', nodes: [
        { id: 's-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Payment', sub: 'Practice data' },
        { id: 's-ok', kind: 'icon', x: 270, y: 80, w: 100, h: 100, icon: 'checkmark-circle', tone: 'good', size: 90 },
        { id: 's-text', kind: 'text', x: 80, y: 196, w: 480, h: 34, label: 'Sale complete', size: 24, align: 'center' },
        { id: 's-sub', kind: 'text', x: 80, y: 234, w: 480, h: 40, label: '$20.00 received, $6.00 change given. The Receipt window opens next.', size: 14, align: 'center' },
      ] },
      { id: 'round', nodes: [
        { id: 'r-panel', kind: 'panel', x: 60, y: 16, w: 520, h: 368, label: 'CASH RECEIVED' },
        { id: 'r-due', kind: 'text', x: 80, y: 60, w: 480, h: 44, label: 'Due $7.45', size: 34, align: 'center' },
        { id: 'r-note', kind: 'text', x: 100, y: 116, w: 440, h: 70, label: 'The total is $7.44. There are no 1c or 2c coins, so cash rounds to the nearest 5c. Card is never rounded.', size: 14, align: 'center' },
        { id: 'r-chip', kind: 'chip', x: 220, y: 204, w: 200, h: 32, label: 'Exact: $5, $2, 20c, 20c, 5c', tone: 'good' },
      ] },
      { id: 'stuck', nodes: [
        { id: 'x-panel', kind: 'panel', x: 60, y: 16, w: 520, h: 368, label: 'CASH RECEIVED' },
        { id: 'x-head', kind: 'text', x: 80, y: 46, w: 480, h: 30, label: 'Can\'t make $6.00 change', size: 20, align: 'center', tone: 'bad' },
        { id: 'x-why', kind: 'text', x: 80, y: 82, w: 480, h: 44, label: 'The drawer ledger doesn\'t hold the notes and coins for exact change. Options:', size: 13, align: 'center' },
        { id: 'x-part', kind: 'button', x: 80, y: 140, w: 480, h: 40, label: 'Cash $10.00 + the rest another way', tone: 'neutral' },
        { id: 'x-card', kind: 'text', x: 80, y: 192, w: 480, h: 34, label: 'Or take the full $14.00 by card.', size: 13, align: 'center' },
      ] },
    ],
    steps: [
      { id: 'pay', title: 'The Payment page', say: 'The sale is $14.00. The customer wants to pay in cash, so tap Cash.', screen: 'pay', focus: 'p-total', note: '$14.00 to pay' },
      { id: 'open', title: 'The Cash window', say: 'The Cash window shows what is due at the top, and a pad of notes and coins below.', tap: 'p-cash', screen: 'cash', focus: 'c-due', note: 'Due at the top' },
      { id: 'ten', title: 'Tap what they hand over', say: 'The customer hands over a $10 note. Tap $10. The window says Short by $4.00, in red, so ask for more.', tap: 'k-10', set: { 'c-got': { label: '$10.00' }, 'c-state': { label: 'Short by $4.00', tone: 'bad' } }, focus: 'c-state', note: 'Ask for more' },
      { id: 'five', title: 'They find more', say: 'They find a $5 note. Tap $5. The total now covers the bill, and the window shows the change to give.', tap: 'k-5', set: { 'c-got': { label: '$15.00' }, 'c-state': { label: 'Change to give: $1.00', tone: 'good' }, 'c-next': { hidden: false, label: 'Next: give $1.00 change' } }, focus: 'c-state', note: 'Change to give' },
      { id: 'undo', title: 'A slip? Undo', say: 'If you tap the wrong note, tap Undo. It takes off the last tap, one at a time, and the total goes back.', tap: 'k-undo', set: { 'c-got': { label: '$10.00' }, 'c-state': { label: 'Short by $4.00', tone: 'bad' }, 'c-next': { hidden: true } }, focus: 'c-got', note: 'One tap back' },
      { id: 'twenty', title: 'Or another $10', say: 'This customer hands over a second $10 note instead. Tap $10 again. That is $20.00 in all, and $6.00 change.', tap: 'k-10', set: { 'c-got': { label: '$20.00' }, 'c-state': { label: 'Change to give: $6.00', tone: 'good' }, 'c-next': { hidden: false, label: 'Next: give $6.00 change' } }, focus: 'c-state', note: '$6.00 change' },
      { id: 'next', title: 'Give the change', say: 'Tap Next. The screen shows exactly which notes and coins to take from the drawer for the $6.00.', tap: 'c-next', screen: 'give', focus: 'g-take', note: 'From the drawer' },
      { id: 'gave', title: 'Gave this', say: 'Hand over the $5 note and the $1 coin, then tap Gave this. That records what left the drawer.', tap: 'g-done', screen: 'sale', focus: 's-sub', note: 'Sale saved' },
      { id: 'round', title: 'Rounded to 5c', say: 'A total of $7.44 is $7.45 in cash, because there are no 1c or 2c coins. The window shows the rounded amount due.', screen: 'round', focus: 'r-due', note: 'Nearest 5c' },
      { id: 'stuck', title: 'No change in the drawer', say: 'Sometimes the drawer cannot make the change. The window says so. Here you can take $10.00 in cash and the rest by card, or all by card.', screen: 'stuck', focus: 'x-part', note: 'A way out' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will take a $14.00 cash sale on the real till with a practice drawer. The customer hands over cash, you give change, and nothing real is saved.', until: { kind: 'next' } },
    { id: 'g-add-bee', target: gridItemSpot(BEE), say: 'First a sale. Tap the Bumble Bee tile to add it to the cart.', until: { kind: 'state', test: s => has(s, BEE) }, gesture: 'tap', allow: ['add'], recover: { say: 'On the Checkout tab, tap the Bumble Bee tile.', target: SPOT.tabCheckout }, at: { tabs: ['checkout'], routes: ['cart'], sheets: false } },
    { id: 'g-add-egg', target: gridItemSpot(EGG), say: 'Tap the Dragon Egg tile as well. The sale is $14.00.', until: { kind: 'state', test: s => has(s, EGG) }, gesture: 'tap', allow: ['add'], at: { tabs: ['checkout'], routes: ['cart'], sheets: false } },
    { id: 'g-charge', target: SPOT.cartCharge, say: 'Tap Charge. On a phone, open the cart from the bar at the bottom first.', until: { kind: 'press', id: SPOT.cartCharge }, gesture: 'tap', allow: [], recover: phoneCharge, at: { tabs: ['checkout'], routes: ['cart'], sheets: false } },
    { id: 'g-cash', target: SPOT.payCash, say: 'The customer is paying in cash. Tap Cash.', until: { kind: 'press', id: SPOT.payCash }, gesture: 'tap', allow: ['tender'], recover: { say: 'Tap Charge to open the Payment page, then tap Cash.', target: SPOT.cartCharge }, at: { tabs: ['checkout'], routes: ['pay'], sheets: false } },
    { id: 'g-window', target: SPOT.cashPad, say: 'This is the Cash window. The amount due is at the top, and the pad below is where you tap the notes and coins the customer hands over. As you tap, the window reads one of three things: Short, Exact, or the change to give.', until: { kind: 'next' }, allow: ['tender'], at: placeWin },
    { id: 'g-ten', target: cashDenomSpot(1000), say: 'The customer hands over a $10 note. Tap $10.', until: { kind: 'state', test: received(1000) }, gesture: 'tap', allow: ['tender'], at: placeWin },
    { id: 'g-short', target: SPOT.cashPad, say: 'The window now says Short by $4.00, in red. That is not enough yet, so you ask the customer for more. Never guess the change yourself.', until: { kind: 'next' }, allow: ['tender'], at: placeWin },
    { id: 'g-five', target: cashDenomSpot(500), say: 'They find a $5 note. Tap $5. The window changes to show the change to give.', until: { kind: 'state', test: received(1500) }, gesture: 'tap', allow: ['tender'], at: placeWin },
    { id: 'g-undo', target: SPOT.cashUndo, say: 'A slip: this customer is paying with a second $10, not the $5. Tap Undo to take the last tap off. Undo always removes the last one only.', until: { kind: 'state', test: received(1000) }, gesture: 'tap', allow: ['tender'], at: placeWin },
    { id: 'g-ten2', target: cashDenomSpot(1000), say: 'Tap $10 again. That is $20.00 received, and $6.00 change.', until: { kind: 'state', test: received(2000) }, gesture: 'tap', allow: ['tender'], at: placeWin },
    { id: 'g-next', target: SPOT.cashNext, say: 'Tap Next to give the $6.00 change.', until: { kind: 'visible', id: SPOT.cashGave }, gesture: 'tap', allow: ['tender'], at: placeWin },
    { id: 'g-give', target: SPOT.cashGave, say: 'The window shows which notes and coins to take from the drawer. Hand them to the customer, then tap Gave this.', until: { kind: 'state', test: s => s.sales >= 1 }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-receipt', target: SPOT.receiptNone, say: 'The sale is saved and the Receipt window opens. The receipts course covers it, so tap No receipt.', until: { kind: 'state', test: closed }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-exact-add', target: gridItemSpot(KEY), say: 'Now an exact payment. Tap the Keyring tile for a new $5.00 sale.', until: { kind: 'state', test: s => has(s, KEY) }, gesture: 'tap', allow: ['add'], recover: { say: 'On the Checkout tab, tap the Keyring tile.', target: SPOT.tabCheckout }, at: { tabs: ['checkout'], routes: ['cart'], sheets: false } },
    { id: 'g-exact-charge', target: SPOT.cartCharge, say: 'Tap Charge. On a phone, open the cart from the bar at the bottom first.', until: { kind: 'press', id: SPOT.cartCharge }, gesture: 'tap', allow: [], recover: phoneCharge, at: { tabs: ['checkout'], routes: ['cart'], sheets: false } },
    { id: 'g-exact-cash', target: SPOT.payCash, say: 'The customer is paying in cash again. Tap Cash.', until: { kind: 'press', id: SPOT.payCash }, gesture: 'tap', allow: ['tender'], recover: { say: 'Tap Charge to open the Payment page, then tap Cash.', target: SPOT.cartCharge }, at: { tabs: ['checkout'], routes: ['pay'], sheets: false } },
    { id: 'g-exact-five', target: cashDenomSpot(500), say: 'The customer hands over exactly $5.00. Tap $5. The window says Exact, which means no change is due.', until: { kind: 'state', test: received(500) }, gesture: 'tap', allow: ['tender'], at: placeWin },
    { id: 'g-exact-take', target: SPOT.cashTake, say: 'On an exact payment there is no change, so the button reads Take cash. Tap it.', until: { kind: 'state', test: s => s.sales >= 2 }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-exact-receipt', target: SPOT.receiptNone, say: 'Close the receipt with No receipt.', until: { kind: 'state', test: closed2 }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-done', say: 'You can take cash either way: tap what is handed over and read Short, Exact or Change. Give exactly the notes and coins the screen shows before tapping Gave this, or tap Take cash when it is exact. When the drawer cannot make change, the screen says so and offers a way out.', until: { kind: 'next' }, at: place },
  ],
  check1: [
    { id: 'c1-exact', title: 'Take $8.00 in cash for this sale: the customer hands over exactly $8.00. Then close the receipt with No receipt', until: { kind: 'state', test: paid(800, 0) }, inject: [{ kind: 'cart', items: [{ variantId: KEY, qty: 1 }, { variantId: STICKER, qty: 1 }] }],
      ladder: ['The cart is ready to be paid. The customer has the exact money.', 'Tap Charge, then Cash. Tap $5 and $2 and $1 so they add up to $8.00.', 'When the window says Exact, tap Take cash. Then tap No receipt.'], reveal: SPOT.cashTake, via: SPOT.payCash, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin, watch: wrongWays },
    { id: 'c1-change', title: 'The customer hands over a $20 note for a $14.00 sale. Take it, give the right change, and close the receipt', until: { kind: 'state', test: paid(2000, 600) }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }],
      ladder: ['Charge the sale and choose Cash.', 'Tap $20 once. The window shows the change to give.', 'Tap Next, hand over the change shown, and tap Gave this. Then tap No receipt.'], reveal: SPOT.cashGave, via: cashDenomSpot(2000), gesture: 'tap', allow: ['tender', 'sale'], at: placeWin, watch: wrongWays },
  ],
  check2: [
    { id: 'c2-short', title: 'The customer hands over $10 for a $14.00 sale, but that is $4.00 short. They find a $5 note. Take $15.00 in all and give the $1.00 change', until: { kind: 'state', test: paid(1500, 100) }, taughtBy: 'g-short',
      inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }],
      ladder: ['The window says Short by $4.00, so the sale is not paid yet.', 'Ask for more, and tap it in on top of the $10. Do not take it as a part payment.', 'Tap $10, then $5, then Next, give the $1.00 change and tap Gave this. Then tap No receipt.'], reveal: SPOT.cashNext, via: cashDenomSpot(500), gesture: 'tap', allow: ['tender', 'sale'], at: placeWin,
      watch: [...wrongWays, { id: 'part-paid', when: (s: { tenders: number; sales: number; payOpen?: string }) => s.tenders >= 1 && s.sales === 0 && !s.payOpen, say: 'Part of that sale was taken as a part payment, so it is no longer a $15.00 cash sale. Tap Start this part again.', fix: 'restart' as const, how: ['Tap Start this part again.', 'This time ask for the rest in cash before you take anything.'] }] },
    { id: 'c2-rounding', title: 'The total is $7.44, but cash is rounded to the nearest 5c. Take exactly the cash that is due, and close the receipt', until: { kind: 'state', test: paid(745, 0) }, taughtBy: 'round',
      inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }], discountPct: 7 }],
      ladder: ['The Cash window shows a different amount due from the cart total.', 'There are no 1c or 2c coins, so $7.44 becomes $7.45 in cash.', 'Tap $5, $2, 20c, 20c and 5c so the window says Exact, then tap Take cash.'], reveal: SPOT.cashTake, via: SPOT.payCash, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin, watch: wrongWays },
    { id: 'c2-no-change', title: 'The customer hands over $20 for a $14.00 sale, but the drawer has only big notes, so it cannot make $6.00 change. Finish the sale another way', until: { kind: 'state', test: closed }, taughtBy: 'stuck',
      inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }, { kind: 'ledger', counts: { '5000': 2, '2000': 5, '1000': 5 } }],
      ladder: ['Tap $20 and read what the window says.', 'It cannot make $6.00 change, and offers ways out. Tap the one that takes part of the sale in cash.', 'Tap Cash $10.00 + the rest another way, take the cash, then pay the rest by card and tap No receipt.'], reveal: SPOT.cashPartCash, via: cashDenomSpot(2000), gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
  ],
  recap: ['You tap in each note and coin the customer hands over, and fix a slip with Undo.', 'You read Short, Exact or Change to give, and give exactly the notes and coins the screen shows before tapping Gave this.', 'You know cash is rounded to the nearest 5c, and that when the drawer cannot make change the screen offers a way out.'],
};
