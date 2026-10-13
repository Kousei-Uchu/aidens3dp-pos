// Location: src/training/modules/refund.ts
// "Refunds and exchanges": find a past order under More ▸ Orders, choose what comes back, why, and where the money goes, and give the cash.
// Practice orders are made up (src/lib/trainingOrders.ts). A card refund goes through the practice terminal and nothing is sent to Shopify or the bank.
// Swaps (a replacement item) are shown but never paid in practice: a swap ends on the Payment page, which this course does not use.
import type { TrainingModule, TrainSnap, Watch } from '../../lib/trainingModule';
import { SPOT, orderRowSpot, refundMethodSpot, refundModeSpot, refundPickSpot, refundPlusSpot, refundReasonSpot, refundReplSpot } from '../../lib/trainingSpots';
import { PRACTICE_ORDER_CARD, PRACTICE_ORDER_CARD2, PRACTICE_ORDER_CASH } from '../../lib/trainingOrders';

const O1 = PRACTICE_ORDER_CARD; const O2 = PRACTICE_ORDER_CASH; const O3 = PRACTICE_ORDER_CARD2;
const COW_L = 'train-v-cow-l';
const L_COW = 'train-ol-1001-a'; const L_EGG = 'train-ol-1001-b'; const L_BEE = 'train-ol-1002-a'; const L_KEY = 'train-ol-1002-b'; const L_DRAGON = 'train-ol-1003-a';
void L_COW;
type Refund = NonNullable<TrainSnap['refund']>;

const base = { tabs: ['checkout', 'more'], routes: ['orders'] };
const list = { ...base, sheets: false }; const win = { ...base, sheets: true };
const noRoute = { tabs: ['checkout', 'more'], routes: [] as string[], sheets: false };

/** A swap that was confirmed starts a sale with the replacement in the cart. This course never takes that sale, so the person is told to start again. */
const swapStarted: Watch = { id: 'swap-started', when: s => s.tenders > 0 || s.lines > 0, say: 'That started a swap sale. This part is a plain refund. Tap Start this part again.', fix: 'restart', how: ['Tap Start this part again.'] };
/** The goal is done when the `n`th refund is the right one and the windows are closed again. */
const done = (n: number, ok: (r: Refund) => boolean) => (s: TrainSnap): boolean => !!s.refund && s.refund.n === n && ok(s.refund) && s.sheets === 0;
/** The `n`th refund (or a later one) is not the right one: it cannot be undone by a tap, so the person starts the part again. */
const wrong = (n: number, ok: (r: Refund) => boolean, say: string): Watch => ({ id: `wrong-refund-${n}`, when: s => !!s.refund && s.refund.n >= n && !ok(s.refund), say, fix: 'restart', how: ['Tap Start this part again.', 'The practice orders go back to how this part began.'] });
const only = (r: Refund, kind: string): boolean => r.kinds.length === 1 && r.kinds[0] === kind;

export const refund: TrainingModule = {
  id: 'refund', title: 'Refunds and exchanges', summary: 'Find a past order, choose what comes back, why, and where the money goes, and hand over cash. Ten minutes with practice orders, nothing is refunded.', minutes: 10,
  flow: 'standard', tabs: ['checkout', 'more'], routes: ['orders'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 20, w: 560, h: 34, label: 'Refunds and exchanges', size: 22, align: 'center' },
        { id: 'in-sub', kind: 'text', x: 60, y: 58, w: 520, h: 40, label: 'A refund starts from the order the customer bought, never from the cart.', size: 13, align: 'center', hidden: true },
        { id: 'c-find', kind: 'panel', x: 40, y: 108, w: 270, h: 96, label: 'FIND THE ORDER', hidden: true },
        { id: 'i-find', kind: 'icon', x: 52, y: 138, w: 44, h: 44, icon: 'receipt', tone: 'accent', size: 34, hidden: true },
        { id: 't-find', kind: 'text', x: 104, y: 130, w: 198, h: 66, label: 'More, then Orders', sub: 'Tap the order, then Refund or return.', size: 15, hidden: true },
        { id: 'c-pick', kind: 'panel', x: 330, y: 108, w: 270, h: 96, label: 'WHAT COMES BACK', hidden: true },
        { id: 'i-pick', kind: 'icon', x: 342, y: 138, w: 44, h: 44, icon: 'cube', tone: 'accent', size: 34, hidden: true },
        { id: 't-pick', kind: 'text', x: 394, y: 130, w: 198, h: 66, label: 'Items or an amount', sub: 'Tap + for each item, or type a sum.', size: 15, hidden: true },
        { id: 'c-where', kind: 'panel', x: 40, y: 216, w: 270, h: 96, label: 'WHERE THE MONEY GOES', hidden: true },
        { id: 'i-where', kind: 'icon', x: 52, y: 246, w: 44, h: 44, icon: 'cash', tone: 'accent', size: 34, hidden: true },
        { id: 't-where', kind: 'text', x: 104, y: 238, w: 198, h: 66, label: 'Original, Cash or Gift', sub: 'Original puts it back how they paid.', size: 15, hidden: true },
        { id: 'c-swap', kind: 'panel', x: 330, y: 216, w: 270, h: 96, label: 'A SWAP', hidden: true },
        { id: 'i-swap', kind: 'icon', x: 342, y: 246, w: 44, h: 44, icon: 'swap-horizontal', tone: 'accent', size: 34, hidden: true },
        { id: 't-swap', kind: 'text', x: 394, y: 238, w: 198, h: 66, label: 'Add a replacement', sub: 'The button says who pays the difference.', size: 15, hidden: true },
        { id: 'c-fail', kind: 'panel', x: 40, y: 324, w: 560, h: 60, label: 'IF THE CARD REFUND FAILS', hidden: true },
        { id: 'i-fail', kind: 'icon', x: 52, y: 338, w: 36, h: 36, icon: 'alert-circle', tone: 'bad', size: 28, hidden: true },
        { id: 't-fail', kind: 'text', x: 98, y: 338, w: 490, h: 40, label: 'Nothing is recorded. Choose Cash or Gift card instead and refund again.', size: 13, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', title: 'From the order', say: 'A refund is taken from the order the customer bought. The order knows what they paid for, how, and how much of it is still refundable.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub', note: 'Start at the order' },
      { id: 'find', title: 'Find it', say: 'Open More, then Orders. Tap the order, then Refund or return. Return is the page where you choose everything.', set: { 'c-find': { hidden: false }, 'i-find': { hidden: false }, 't-find': { hidden: false } }, focus: 'c-find', note: 'More, Orders' },
      { id: 'pick', title: 'What comes back', say: 'Tap + beside each item the customer brings back, as many as they return. Or switch to Amount and type a sum when there is no item to pick.', set: { 'c-pick': { hidden: false }, 'i-pick': { hidden: false }, 't-pick': { hidden: false } }, focus: 'c-pick', note: 'Never more than was bought' },
      { id: 'where', title: 'Where the money goes', say: 'Refund to says where the money goes. Original sends it back the way the customer paid. Cash is handed over from the drawer. A gift card holds it as store credit.', set: { 'c-where': { hidden: false }, 'i-where': { hidden: false }, 't-where': { hidden: false } }, focus: 'c-where', note: 'Your choice' },
      { id: 'swap', title: 'A swap', say: 'If the customer wants something else instead, add a replacement item. The big button changes: Refund when they are owed money, Charge when they owe some, Even exchange when it matches.', set: { 'c-swap': { hidden: false }, 'i-swap': { hidden: false }, 't-swap': { hidden: false } }, focus: 'c-swap', note: 'Read the button' },
      { id: 'fail', title: 'If a card refund fails', say: 'A card refund can fail, for instance when the card has expired. Nothing is recorded when it fails. Choose Cash or Gift card and refund again.', set: { 'c-fail': { hidden: false }, 'i-fail': { hidden: false }, 't-fail': { hidden: false } }, focus: 'c-fail', note: 'Try another way' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'orders', nodes: [
        { id: 'o-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Orders', sub: 'Practice data' },
        { id: 'o-1', kind: 'row', x: 20, y: 52, w: 600, h: 40, label: '#T1001 · Sam Rivera', sub: 'Today · paid · unfulfilled', value: '$24.00' },
        { id: 'o-2', kind: 'row', x: 20, y: 96, w: 600, h: 40, label: '#T1002 · Priya Patel', sub: 'Today · paid · fulfilled', value: '$18.00' },
        { id: 'o-3', kind: 'row', x: 20, y: 140, w: 600, h: 40, label: '#T1003', sub: 'Today · paid · fulfilled', value: '$28.00' },
        { id: 'o-sheet', kind: 'panel', x: 130, y: 120, w: 380, h: 190, label: '#T1001', hidden: true },
        { id: 'o-l1', kind: 'text', x: 150, y: 146, w: 340, h: 18, label: '1 × Highland Cow · Small   $12.00', size: 13, hidden: true },
        { id: 'o-l2', kind: 'text', x: 150, y: 168, w: 340, h: 18, label: '2 × Dragon Egg   $12.00', size: 13, hidden: true },
        { id: 'o-b1', kind: 'button', x: 150, y: 200, w: 340, h: 32, label: 'Mark fulfilled', hidden: true },
        { id: 'o-b2', kind: 'button', x: 150, y: 238, w: 340, h: 32, label: 'Refund or return', tone: 'neutral', hidden: true },
        { id: 'o-b3', kind: 'button', x: 150, y: 276, w: 340, h: 26, label: 'Receipt', tone: 'neutral', hidden: true },
        { id: 'o-dock', kind: 'panel', x: 0, y: 366, w: 640, h: 34 },
        { id: 'o-say', kind: 'text', x: 14, y: 370, w: 612, h: 26, label: 'Every order you have sold is listed here.', size: 13 },
      ] },
      { id: 'return', nodes: [
        { id: 'bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Return · #T1001', sub: 'Practice data' },
        { id: 'm-items', kind: 'chip', x: 20, y: 46, w: 90, h: 24, label: 'Items', tone: 'accent' },
        { id: 'm-amount', kind: 'chip', x: 116, y: 46, w: 90, h: 24, label: 'Amount', tone: 'neutral' },
        { id: 'l-1', kind: 'row', x: 20, y: 76, w: 600, h: 32, label: 'Highland Cow · Small', sub: '$12.00 each · 1 refundable' },
        { id: 'l-1q', kind: 'text', x: 540, y: 82, w: 24, h: 18, label: '0', size: 13, align: 'center' },
        { id: 'l-2', kind: 'row', x: 20, y: 112, w: 600, h: 32, label: 'Dragon Egg', sub: '$6.00 each · 2 refundable' },
        { id: 'l-2m', kind: 'button', x: 490, y: 117, w: 26, h: 22, label: '-', tone: 'neutral' },
        { id: 'l-2q', kind: 'text', x: 518, y: 118, w: 24, h: 18, label: '0', size: 13, align: 'center' },
        { id: 'l-2p', kind: 'button', x: 546, y: 117, w: 26, h: 22, label: '+', tone: 'neutral' },
        { id: 'b-repl', kind: 'button', x: 20, y: 150, w: 600, h: 24, label: 'Add replacement item', icon: 'add', tone: 'neutral' },
        { id: 'r-repl', kind: 'row', x: 20, y: 178, w: 600, h: 30, label: '1 × Highland Cow', sub: 'Large', value: '$18.00', hidden: true },
        { id: 'why', kind: 'text', x: 20, y: 212, w: 200, h: 16, label: 'Reason', size: 12 },
        { id: 'c-1', kind: 'chip', x: 20, y: 230, w: 110, h: 22, label: 'Returned Goods', tone: 'accent' },
        { id: 'c-2', kind: 'chip', x: 136, y: 230, w: 110, h: 22, label: 'Cancelled Order', tone: 'neutral' },
        { id: 'c-3', kind: 'chip', x: 252, y: 230, w: 70, h: 22, label: 'Other', tone: 'neutral' },
        { id: 'to', kind: 'text', x: 20, y: 258, w: 200, h: 16, label: 'Refund to', size: 12 },
        { id: 'p-orig', kind: 'chip', x: 20, y: 276, w: 90, h: 22, label: 'Original', tone: 'accent' },
        { id: 'p-cash', kind: 'chip', x: 116, y: 276, w: 90, h: 22, label: 'Cash', tone: 'neutral' },
        { id: 'p-gift', kind: 'chip', x: 212, y: 276, w: 90, h: 22, label: 'Gift card', tone: 'neutral' },
        { id: 'stock', kind: 'toggle', x: 20, y: 304, w: 400, h: 24, label: 'Restock returned items', on: true },
        { id: 'go', kind: 'button', x: 20, y: 334, w: 600, h: 28, label: 'Nothing selected', tone: 'neutral' },
        { id: 'ask', kind: 'panel', x: 170, y: 120, w: 300, h: 130, label: 'REFUND $6.00', hidden: true },
        { id: 'ask-t', kind: 'text', x: 186, y: 146, w: 268, h: 40, label: 'Returned Goods · 1 item type(s)', size: 13, align: 'center', hidden: true },
        { id: 'ask-y', kind: 'button', x: 186, y: 200, w: 268, h: 30, label: 'Confirm', hidden: true },
        { id: 'dock', kind: 'panel', x: 0, y: 366, w: 640, h: 34 },
        { id: 'dock-say', kind: 'text', x: 14, y: 370, w: 612, h: 26, label: 'Choose what is coming back.', size: 13 },
      ] },
    ],
    steps: [
      { id: 'list', title: 'The orders', say: 'Orders lists every sale, newest first, under More. Each row shows the order number, the customer, how it was paid and the total.', focus: 'o-1', note: 'More, Orders' },
      { id: 'open', title: 'Open an order', say: 'Tap the order the customer is returning. A window lists what they bought.', tap: 'o-1', set: { 'o-sheet': { hidden: false }, 'o-l1': { hidden: false }, 'o-l2': { hidden: false }, 'o-b1': { hidden: false }, 'o-b2': { hidden: false }, 'o-b3': { hidden: false }, 'o-say': { label: 'The window shows what was bought.' } }, focus: 'o-sheet', note: 'What they bought' },
      { id: 'start', title: 'Refund or return', say: 'Tap Refund or return. The Return page opens for this order.', tap: 'o-b2', screen: 'return', focus: 'bar', note: 'This order' },
      { id: 'plus', title: 'What comes back', say: 'Tap + beside an item for each one the customer is returning. Here, one Dragon Egg. The button at the bottom shows the amount.', tap: 'l-2p', set: { 'l-2q': { label: '1' }, go: { label: 'Refund $6.00', tone: 'accent' }, 'dock-say': { label: 'One Dragon Egg, $6.00 back to them.' } }, focus: 'go', note: 'Amount to refund' },
      { id: 'amount', title: 'Or an amount', say: 'No item to pick, such as a goodwill refund? Tap Amount and type a sum, up to what is left on the order.', tap: 'm-amount', set: { 'm-amount': { tone: 'accent' }, 'm-items': { tone: 'neutral' }, 'dock-say': { label: 'Amount mode: type a sum instead of picking items.' } }, focus: 'm-amount', note: 'Items or Amount' },
      { id: 'items-back', title: 'Back to items', say: 'Tap Items to go back. Your picked items are still there.', tap: 'm-items', set: { 'm-items': { tone: 'accent' }, 'm-amount': { tone: 'neutral' }, 'dock-say': { label: 'Back on Items.' } }, focus: 'm-items', note: 'Still picked' },
      { id: 'swap', title: 'A swap', say: 'The customer wants the Large cow instead? Add a replacement item. The Large costs $12.00 more than the egg, so the button changes to Charge.', tap: 'b-repl', set: { 'r-repl': { hidden: false }, go: { label: 'Charge $12.00' }, 'dock-say': { label: 'They owe the difference. Not used in this course.' } }, focus: 'go', note: 'Customer pays the rest' },
      { id: 'unswap', title: 'Take it off again', say: 'Tap the replacement line to take it off. The button reads Refund again. This course only refunds, so we go on without the swap.', tap: 'r-repl', set: { 'r-repl': { hidden: true }, go: { label: 'Refund $6.00' }, 'dock-say': { label: 'Plain refund again.' } }, focus: 'go', note: 'Refund again' },
      { id: 'reason', title: 'The reason', say: 'The reason is kept with the refund and shows in reports. Returned Goods is the usual one. Tap another if it fits better.', tap: 'c-1', set: { 'dock-say': { label: 'Returned Goods is already chosen.' } }, focus: 'c-1', note: 'Why it came back' },
      { id: 'card-fails', title: 'The card refund fails', say: 'Refund to Original sends the money back to the card. If the card has expired the refund fails. Nothing is recorded and the order is not changed.', tap: 'go', set: { 'dock-say': { label: 'Card expired. Try another card. Nothing was refunded.' }, dock: { tone: 'bad' } }, focus: 'dock', note: 'Nothing recorded' },
      { id: 'cash', title: 'Choose Cash', say: 'Switch Refund to to Cash, then refund again. You hand the customer the money from the drawer.', tap: 'p-cash', set: { 'p-cash': { tone: 'accent' }, 'p-orig': { tone: 'neutral' }, dock: { tone: 'neutral' }, 'dock-say': { label: 'Cash: you give them the money.' } }, focus: 'p-cash', note: 'Cash instead' },
      { id: 'confirm', title: 'Confirm', say: 'Tap Refund $6.00. A pop-up asks you to confirm. Read the amount, then tap Confirm.', tap: 'go', set: { ask: { hidden: false }, 'ask-t': { hidden: false }, 'ask-y': { hidden: false } }, focus: 'ask', note: 'Check the amount' },
      { id: 'give', title: 'Give the cash', say: 'The Give cash refund window shows which notes and coins to take from the drawer. Hand them over, then tap Gave this.', tap: 'ask-y', set: { ask: { hidden: true }, 'ask-t': { hidden: true }, 'ask-y': { hidden: true }, 'dock-say': { label: 'Give the customer $6.00: a $5 note and a $1 coin.' } }, focus: 'dock', note: 'From the drawer' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will give refunds on practice orders. Nothing is really refunded or sent anywhere. Orders are under More.', until: { kind: 'next' } },
    { id: 'g-more', target: SPOT.tabMore, say: 'Tap More at the bottom of the screen.', until: { kind: 'state', test: s => s.tab === 'more' || s.route === 'orders' }, gesture: 'tap', allow: [], at: noRoute },
    { id: 'g-orders', target: SPOT.moreOrders, say: 'Tap Orders.', until: { kind: 'state', test: s => s.route === 'orders' }, gesture: 'tap', allow: [], at: { ...base, sheets: false }, recover: { say: 'Tap the More tab at the bottom, then Orders.', target: SPOT.tabMore } },
    { id: 'g-list', say: 'This is the list of past sales, newest first. Each row has the order number, the customer, how it stands, and the total. These three are practice orders.', until: { kind: 'next' }, at: list },
    { id: 'g-open', target: orderRowSpot(O1), say: 'Sam bought a Highland Cow and two Dragon Eggs and paid by card. Tap order #T1001.', until: { kind: 'press', id: orderRowSpot(O1) }, gesture: 'tap', at: list, recover: { say: 'Tap the More tab, then Orders, then order #T1001.', target: SPOT.tabMore } },
    { id: 'g-refund-btn', target: SPOT.ordersRefund, say: 'The window lists what was bought. Tap Refund or return.', until: { kind: 'press', id: SPOT.ordersRefund }, gesture: 'tap', at: win, recoverFrom: [{ say: 'Tap order #T1001 first.', target: orderRowSpot(O1) }], recover: { say: 'Tap the More tab, then Orders, then order #T1001.', target: SPOT.tabMore } },
    { id: 'g-plus', target: refundPlusSpot(L_EGG), say: 'This is the Return page. Sam brings back one Dragon Egg. Tap + beside Dragon Egg once. The button at the bottom shows the amount.', until: { kind: 'press', id: refundPlusSpot(L_EGG) }, gesture: 'tap', at: list,
      recoverFrom: [{ say: 'Tap Refund or return.', target: SPOT.ordersRefund }, { say: 'Tap order #T1001.', target: orderRowSpot(O1) }], recover: { say: 'Tap the More tab, then Orders, then order #T1001.', target: SPOT.tabMore } },
    { id: 'g-reason', target: refundReasonSpot('Returned Goods'), say: 'The reason is kept with the refund and shows in reports. Returned Goods is already chosen, which fits here. Tap it.', until: { kind: 'press', id: refundReasonSpot('Returned Goods') }, gesture: 'tap', at: list, recover: { say: 'Go back to Orders and open #T1001 again.', target: SPOT.back } },
    { id: 'g-method-cash', target: refundMethodSpot('cash'), say: 'Refund to says where the money goes. Original sends it back the way the customer paid. Tap Cash to see another choice. If a card refund ever fails, this is the way out.', until: { kind: 'press', id: refundMethodSpot('cash') }, gesture: 'tap', at: list, recover: { say: 'Go back to Orders and open #T1001 again.', target: SPOT.back } },
    { id: 'g-method-gift', target: refundMethodSpot('gift'), say: 'Gift card keeps the money as store credit on a new gift card. Tap Gift card.', until: { kind: 'press', id: refundMethodSpot('gift') }, gesture: 'tap', at: list },
    { id: 'g-method-orig', target: refundMethodSpot('original'), say: 'Tap Original again. For a card sale the money goes back to the card, using the terminal.', until: { kind: 'press', id: refundMethodSpot('original') }, gesture: 'tap', at: list },
    { id: 'g-restock', target: SPOT.refundRestock, say: 'Restock returned items puts the quantity back in stock. Turn it off for something damaged that cannot be sold again. Leave it on here.', until: { kind: 'next' }, at: list },
    { id: 'g-amount', target: refundModeSpot('amount'), say: 'No item to pick, such as a goodwill refund? Tap Amount.', until: { kind: 'press', id: refundModeSpot('amount') }, gesture: 'tap', at: list },
    { id: 'g-amount-read', target: SPOT.refundMode, say: 'Amount shows a keypad. You type a sum up to what is left on the order, and it says how much that is. We will not use it now.', until: { kind: 'next' }, at: list },
    { id: 'g-items-back', target: refundModeSpot('items'), say: 'Tap Items to go back. The Dragon Egg you picked is still picked.', until: { kind: 'press', id: refundModeSpot('items') }, gesture: 'tap', at: list },
    { id: 'g-replace', target: SPOT.refundReplace, say: 'A customer who wants something else instead is a swap. Tap Add replacement item.', until: { kind: 'press', id: SPOT.refundReplace }, gesture: 'tap', at: list },
    { id: 'g-pick', target: refundPickSpot(COW_L), say: 'Tap Highland Cow, Large, in the list.', until: { kind: 'press', id: refundPickSpot(COW_L) }, gesture: 'tap', at: win, recoverFrom: [{ say: 'Tap Add replacement item.', target: SPOT.refundReplace }] },
    { id: 'g-diff', target: SPOT.refundGo, say: 'Look at the big button: it now says Charge $12.00. The Large cow costs $12.00 more than the egg coming back. If the return were worth more, it would say Refund, and if they matched, Even exchange.', until: { kind: 'next' }, at: list },
    { id: 'g-unswap', target: refundReplSpot(COW_L), say: 'This course only refunds, so take the replacement off. Tap its line.', until: { kind: 'press', id: refundReplSpot(COW_L) }, gesture: 'tap', at: list },
    { id: 'g-go', target: SPOT.refundGo, say: 'The button reads Refund $6.00 again. Tap it.', until: { kind: 'press', id: SPOT.refundGo }, gesture: 'tap', at: list, watch: [swapStarted] },
    { id: 'g-confirm', target: SPOT.refundGo, say: 'A pop-up asks you to confirm the refund. Read the amount and tap Confirm. In practice the practice terminal refunds the card for you. If the pop-up went away, tap the button again.', until: { kind: 'state', test: s => !!s.refund && s.refund.orderId === O1 }, gesture: 'tap', allow: ['sale'], at: { ...list, sheets: true }, watch: [swapStarted] },
    { id: 'g-done', target: SPOT.refundDone, say: 'The Done window says the refund is complete. The order now shows one less Dragon Egg to refund. Tap OK.', until: { kind: 'press', id: SPOT.refundDone }, gesture: 'tap', allow: ['sale'], at: win, recover: { say: 'Wait a moment for the Done window.', target: SPOT.refundGo } },
    { id: 'g-cash-intro', say: 'Now a cash order. Priya paid in cash and wants her Bumble Bee refunded. You will give her the cash.', until: { kind: 'next' }, allow: ['sale'], at: list },
    { id: 'g-open2', target: orderRowSpot(O2), say: 'Tap order #T1002.', until: { kind: 'press', id: orderRowSpot(O2) }, gesture: 'tap', allow: ['sale'], at: list, recover: { say: 'Tap the More tab, then Orders.', target: SPOT.tabMore } },
    { id: 'g-refund-btn2', target: SPOT.ordersRefund, say: 'Tap Refund or return.', until: { kind: 'press', id: SPOT.ordersRefund }, gesture: 'tap', allow: ['sale'], at: win, recoverFrom: [{ say: 'Tap order #T1002 first.', target: orderRowSpot(O2) }], recover: { say: 'Tap the More tab, then Orders, then order #T1002.', target: SPOT.tabMore } },
    { id: 'g-plus2', target: refundPlusSpot(L_BEE), say: 'Tap + beside Bumble Bee once.', until: { kind: 'press', id: refundPlusSpot(L_BEE) }, gesture: 'tap', allow: ['sale'], at: list, recoverFrom: [{ say: 'Tap Refund or return.', target: SPOT.ordersRefund }, { say: 'Tap order #T1002.', target: orderRowSpot(O2) }], recover: { say: 'Tap the More tab, then Orders, then order #T1002.', target: SPOT.tabMore } },
    { id: 'g-go2', target: SPOT.refundGo, say: 'With Original, a cash order is refunded in cash. Tap Refund $8.00, then Confirm in the pop-up.', until: { kind: 'state', test: s => !!s.refund && s.refund.orderId === O2 }, gesture: 'tap', allow: ['sale'], at: { ...list, sheets: true }, watch: [swapStarted] },
    { id: 'g-cash', target: SPOT.cashGave, say: 'The window shows the notes and coins to take from the drawer. Hand them to Priya, then tap Gave this.', until: { kind: 'press', id: SPOT.cashGave }, gesture: 'tap', allow: ['sale'], at: win, recover: { say: 'Wait a moment for the Give cash refund window.', target: SPOT.refundGo } },
    { id: 'g-done2', target: SPOT.refundDone, say: 'Done. Tap OK.', until: { kind: 'press', id: SPOT.refundDone }, gesture: 'tap', allow: ['sale'], at: win },
    { id: 'g-end', say: 'The refund is recorded against the order and in the reports. A card refund goes back to the card, a cash refund comes out of the drawer, and a gift card refund makes store credit.', until: { kind: 'next' }, allow: ['sale'], at: list },
  ],
  check1: [
    { id: 'refund-card', title: 'Sam brings back one Dragon Egg from order #T1001, which he paid for by card. Refund it to his card', until: { kind: 'state', test: done(1, r => r.orderId === O1 && r.items === 1 && r.cents === 600 && only(r, 'card')) },
      ladder: ['Orders are under the More tab.', 'Open Orders, tap order #T1001, then Refund or return.', 'Tap + beside Dragon Egg once, tap the Refund button, confirm, and tap OK.'], reveal: orderRowSpot(O1), via: SPOT.moreOrders, gesture: 'tap', allow: ['sale'], at: win,
      watch: [swapStarted, wrong(1, r => r.orderId === O1 && r.items === 1 && r.cents === 600 && only(r, 'card'), 'That refund was not one Dragon Egg back to the card. Tap Start this part again.')] },
    { id: 'refund-cash', title: 'Priya brings back her Bumble Bee from order #T1002, which she paid for in cash. Refund it and give her the cash', until: { kind: 'state', test: done(2, r => r.orderId === O2 && r.items === 1 && r.cents === 800 && only(r, 'cash')) },
      ladder: ['Back on the Orders list, a cash order is refunded in cash.', 'Open order #T1002, then Refund or return, and tap + beside Bumble Bee.', 'Tap Refund, confirm, tap Gave this once the cash is handed over, then OK.'], reveal: orderRowSpot(O2), via: SPOT.moreOrders, gesture: 'tap', allow: ['sale'], at: win,
      watch: [swapStarted, wrong(2, r => r.orderId === O2 && r.items === 1 && r.cents === 800 && only(r, 'cash'), 'That refund was not the Bumble Bee in cash. Tap Start this part again.')] },
    { id: 'refund-gift', title: 'A customer wants store credit instead of money for the Red Dragon from order #T1003. Refund it to a gift card', until: { kind: 'state', test: done(3, r => r.orderId === O3 && r.items === 1 && r.cents === 2500 && only(r, 'gift_card')) },
      ladder: ['Where the money goes is chosen on the Return page.', 'Open order #T1003, Refund or return, tap + beside Red Dragon, then choose Gift card under Refund to.', 'Tap the Refund button, confirm, then tap OK. The window shows the new gift card code.'], reveal: orderRowSpot(O3), via: SPOT.moreOrders, gesture: 'tap', allow: ['sale'], at: win,
      watch: [swapStarted, wrong(3, r => r.orderId === O3 && r.items === 1 && r.cents === 2500 && only(r, 'gift_card'), 'That refund was not the Red Dragon on a gift card. Tap Start this part again.')] },
  ],
  check2: [
    { id: 'card-expired', title: 'Sam wants the Highland Cow from order #T1001 refunded, but his card has expired, so a card refund will fail. Refund the $12.00 to Cash instead', until: { kind: 'state', test: done(1, r => r.orderId === O1 && r.items === 1 && r.cents === 1200 && only(r, 'cash')) },
      inject: [{ kind: 'decline', times: 5, code: '33' }], taughtBy: 'g-method-cash',
      ladder: ['Try the refund to Original first and read what the pop-up says.', 'The card refund cannot go through. Nothing was recorded, so the order is untouched.', 'Change Refund to from Original to Cash, tap the Refund button again, confirm, give the cash, and tap OK.'], reveal: SPOT.moreOrders, via: SPOT.tabMore, gesture: 'tap', allow: ['sale'], at: win,
      watch: [swapStarted, wrong(1, r => r.orderId === O1 && r.items === 1 && r.cents === 1200 && only(r, 'cash'), 'That refund was not the $12.00 Highland Cow in cash. Tap Start this part again.')] },
    { id: 'damaged', title: 'The Bumble Bee Priya brings back from order #T1002 is damaged and cannot be sold again. Refund it in cash and turn off Restock returned items', until: { kind: 'state', test: done(2, r => r.orderId === O2 && r.items === 1 && r.cents === 800 && only(r, 'cash') && !r.restock) },
      ladder: ['Damaged goods should not go back into stock.', 'On the Return page there is a switch for that, below Refund to.', 'Tap + beside Bumble Bee, switch off Restock returned items, tap Refund, confirm, give the cash, and tap OK.'], reveal: SPOT.refundRestock, via: orderRowSpot(O2), gesture: 'tap', allow: ['sale'], at: win,
      watch: [swapStarted, wrong(2, r => r.orderId === O2 && r.items === 1 && r.cents === 800 && only(r, 'cash') && !r.restock, 'That refund put the damaged Bumble Bee back in stock, or was the wrong item. Tap Start this part again.')] },
    { id: 'one-keyring', title: 'Priya also wants just one of her two Keyrings from order #T1002 refunded in cash. Refund one only', until: { kind: 'state', test: done(3, r => r.orderId === O2 && r.items === 1 && r.cents === 500 && only(r, 'cash')) },
      ladder: ['The order had two Keyrings, and only one is coming back.', 'Open order #T1002, tap Refund or return, and tap + once beside Keyring.', 'Tap Refund, confirm, give the cash, and tap OK.'], reveal: orderRowSpot(O2), via: SPOT.moreOrders, gesture: 'tap', allow: ['sale'], at: win,
      watch: [swapStarted, wrong(3, r => r.orderId === O2 && r.items === 1 && r.cents === 500 && only(r, 'cash'), 'That refund was not one Keyring in cash. Tap Start this part again.')] },
  ],
  recap: ['You can find a past order under More, then Orders, and start a refund from it.', 'You can choose items or an amount, a reason, and where the money goes: back to the card, as cash from the drawer, or on a gift card.', 'You know a failed card refund records nothing, so you can choose Cash or Gift card and refund again, and that a swap shows who pays the difference.'],
};
void L_DRAGON; void L_KEY;
