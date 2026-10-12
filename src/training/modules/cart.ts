// Location: src/training/modules/cart.ts
// "Build a cart": add items to a sale, change quantities, and take things out.
import type { TrainingModule } from '../../lib/trainingModule';
import { SPOT, cartLineSpot, gridItemSpot } from '../../lib/trainingSpots';

const BEE = 'train-v-bee'; const DRAGON = 'train-v-dragon'; const EGG = 'train-v-egg';
const has = (s: { cart: { variantId?: string }[] }, id: string): boolean => s.cart.some(l => l.variantId === id);
const kinds = (s: { cart: { variantId?: string }[] }): number => new Set(s.cart.map(l => l.variantId)).size;

export const cart: TrainingModule = {
  id: 'cart', title: 'Build a cart', summary: 'Add items to a sale, change quantities, and remove things. Eight minutes with practice data.', minutes: 8, suggestedFirst: false,
  flow: 'standard', tabs: ['checkout'], routes: ['cart'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 22, w: 560, h: 34, label: 'Build a cart', size: 22, align: 'center' },
        { id: 'sub', kind: 'text', x: 40, y: 62, w: 560, h: 40, label: 'A cart holds the items the customer is buying. You add them from the grid and change them in the cart.', size: 13, hidden: true },
        { id: 'grid-title', kind: 'text', x: 40, y: 112, w: 560, h: 20, label: 'The grid shows items you can add', size: 13, weight: '700', hidden: true },
        { id: 'tile-sample', kind: 'tile', x: 40, y: 138, w: 100, h: 82, icon: 'bug', label: 'Item', sub: '$8.00', color: '#FEF08A', hidden: true },
        { id: 'tile-note', kind: 'text', x: 150, y: 156, w: 420, h: 40, label: 'Tap a tile once to add it. Tap it again to add another. The total goes up.', size: 12, hidden: true },
        { id: 'cart-title', kind: 'text', x: 40, y: 232, w: 560, h: 20, label: 'The cart lists what is being sold', size: 13, weight: '700', hidden: true },
        { id: 'line-sample', kind: 'row', x: 40, y: 258, w: 560, h: 40, label: 'Item name', sub: '2 x $8.00', value: '$16.00', hidden: true },
        { id: 'line-note', kind: 'text', x: 40, y: 306, w: 560, h: 32, label: 'To take an item out, swipe its line to the left, then tap Remove.', size: 12, hidden: true },
        { id: 'total', kind: 'row', x: 40, y: 346, w: 560, h: 30, label: 'Total', value: '$16.00', weight: '700', hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', title: 'What is a cart?', say: 'A cart is the list of items the customer is buying. It sits beside the grid so you can keep adding.', set: { sub: { hidden: false } }, focus: 'sub', note: 'The list being sold' },
      { id: 'add', title: 'Tap to add', say: 'You add an item by tapping its tile on the grid. Tap the same tile twice to add two.', set: { 'grid-title': { hidden: false }, 'tile-sample': { hidden: false }, 'tile-note': { hidden: false } }, focus: 'tile-sample', note: 'Tap to add' },
      { id: 'qty', title: 'Quantities go up', say: 'Each line shows how many of that item there are, and the price. The numbers add up for you.', set: { 'cart-title': { hidden: false }, 'line-sample': { hidden: false } }, focus: 'line-sample', note: 'Quantity and price' },
      { id: 'remove-swipe', title: 'Swipe to remove', say: 'Swipe a line to the left, then tap Remove. If you take out the wrong one, tap its tile again to put it back.', set: { 'line-note': { hidden: false } }, focus: 'line-note', note: 'Swipe left, tap Remove' },
      { id: 'total', title: 'The total is always there', say: 'The total sits at the bottom of the cart. Charge when the customer is ready to pay.', set: { total: { hidden: false } }, focus: 'total', note: 'Always visible' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'checkout', nodes: [
        { id: 'co-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Checkout', sub: 'Practice data' },
        { id: 'tile-bee', kind: 'tile', x: 14, y: 56, w: 104, h: 82, icon: 'bug', label: 'Bumble Bee', sub: '$8.00', color: '#FEF08A' },
        { id: 'tile-dragon', kind: 'tile', x: 126, y: 56, w: 104, h: 82, icon: 'flame', label: 'Red Dragon', sub: '$25.00', color: '#FED7AA' },
        { id: 'tile-egg', kind: 'tile', x: 238, y: 56, w: 104, h: 82, icon: 'egg', label: 'Dragon Egg', sub: '$6.00', color: '#BBF7D0' },
        { id: 'tile-cow', kind: 'tile', x: 14, y: 146, w: 104, h: 82, icon: 'paw', label: 'Highland Cow', sub: '$12.00', color: '#DDD6FE' },
        { id: 'tile-key', kind: 'tile', x: 126, y: 146, w: 104, h: 82, icon: 'key', label: 'Keyring', sub: '$5.00', color: '#BFDBFE' },
        { id: 'tile-custom', kind: 'tile', x: 238, y: 146, w: 104, h: 82, icon: 'create', label: 'Custom', color: '#E5E7EB' },
        { id: 'cart', kind: 'panel', x: 372, y: 52, w: 254, h: 250, label: 'CART' },
        { id: 'line-bee', kind: 'row', x: 380, y: 76, w: 238, h: 40, label: 'Bumble Bee', sub: '1 x $8.00', value: '$8.00', hidden: true },
        { id: 'line-dragon', kind: 'row', x: 380, y: 116, w: 238, h: 40, label: 'Red Dragon', sub: '1 x $25.00', value: '$25.00', hidden: true },
        { id: 'line-egg', kind: 'row', x: 380, y: 156, w: 238, h: 40, label: 'Dragon Egg', sub: '1 x $6.00', value: '$6.00', hidden: true },
        { id: 'rm-btn', kind: 'button', x: 536, y: 156, w: 82, h: 40, label: 'Remove', tone: 'neutral', hidden: true },
        { id: 'total', kind: 'row', x: 380, y: 224, w: 238, h: 34, label: 'Total', value: '$0.00' },
        { id: 'charge', kind: 'button', x: 380, y: 264, w: 238, h: 30, label: 'Charge', icon: 'card' },
        { id: 'dock', kind: 'panel', x: 0, y: 340, w: 640, h: 60 },
        { id: 'dock-say', kind: 'text', x: 14, y: 346, w: 612, h: 48, label: 'Tap the Bumble Bee tile to add one to the cart.', size: 14 },
      ] },
    ],
    steps: [
      { id: 'grid', title: 'The grid holds items', say: 'This is the grid of items you can sell. Tap a tile once to add it to the cart.', focus: 'tile-bee', note: 'Tap a tile' },
      { id: 'tap-one', title: 'Add one item', say: 'You tapped the Bumble Bee. It goes into the cart on the right with its price.', tap: 'tile-bee', set: { 'line-bee': { hidden: false }, total: { value: '$8.00' }, 'dock-say': { label: 'Tap the same tile again to add another.' } }, focus: 'line-bee', note: 'The Bee is in the cart' },
      { id: 'tap-again', title: 'Tap to add more', say: 'Tap the same tile again. The quantity goes up to 2 and the total goes up too.', tap: 'tile-bee', set: { 'line-bee': { sub: '2 x $8.00', value: '$16.00' }, total: { value: '$16.00' } }, focus: 'line-bee', note: 'Quantity is 2 now' },
      { id: 'add-another', title: 'Add a different item', say: 'Tap the Red Dragon to add a different item to the same sale.', tap: 'tile-dragon', set: { 'line-dragon': { hidden: false }, total: { value: '$41.00' }, 'dock-say': { label: 'Different items each get their own line.' } }, focus: 'line-dragon', note: 'Its own line' },
      { id: 'add-egg', title: 'One more item', say: 'Add the Dragon Egg to the cart as well.', tap: 'tile-egg', set: { 'line-egg': { hidden: false }, total: { value: '$47.00' } }, focus: 'line-egg', note: 'Three lines now' },
      { id: 'remove-start', title: 'Taking an item out', say: 'The customer changes their mind about the Dragon Egg. Swipe its line to the left.', tap: 'line-egg', gesture: 'swipe-left', set: { 'rm-btn': { hidden: false }, 'dock-say': { label: 'Swipe a line to the left, then tap Remove.' } }, focus: 'rm-btn', note: 'Tap Remove' },
      { id: 'remove-done', title: 'Gone from the cart', say: 'Tap Remove. The line goes and the total drops. If you took out the wrong one, tap its tile to add it back.', tap: 'rm-btn', set: { 'line-egg': { hidden: true }, 'rm-btn': { hidden: true }, total: { value: '$41.00' } }, focus: 'total', note: 'Total is $41.00' },
      { id: 'ready', title: 'Ready to charge', say: 'The cart is ready. When the customer has everything, tap Charge to take the payment.', focus: 'charge', note: 'Next: payment' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will build a small sale on the real till with practice data: add three items, add another, then take one out.', until: { kind: 'next' } },
    { id: 'g-add-first', target: gridItemSpot(BEE), say: 'Tap the Bumble Bee tile to add it to the cart.', until: { kind: 'state', test: s => has(s, BEE) }, gesture: 'tap', recover: { say: 'On the Checkout tab, tap the Bumble Bee tile.', target: SPOT.tabCheckout }, at: { tabs: ['checkout'], routes: [], sheets: false }, allow: ['add'] },
    { id: 'g-add-second', target: gridItemSpot(DRAGON), say: 'Add a different item. Tap the Red Dragon tile.', until: { kind: 'state', test: s => has(s, DRAGON) }, gesture: 'tap', allow: ['add'], at: { tabs: ['checkout'], routes: ['cart'] } },
    { id: 'g-add-third', target: gridItemSpot(EGG), say: 'Add one more. Tap the Dragon Egg tile.', until: { kind: 'state', test: s => has(s, EGG) }, gesture: 'tap', allow: ['add'], at: { tabs: ['checkout'], routes: ['cart'] } },
    { id: 'g-qty', target: gridItemSpot(BEE), say: 'Tap the Bumble Bee tile again. Tapping the same item adds another one.', until: { kind: 'state', test: s => s.qty >= 4 }, gesture: 'tap', allow: ['add', 'qty'], at: { tabs: ['checkout'], routes: ['cart'] } },
    { id: 'g-remove', target: cartLineSpot(DRAGON), say: 'The customer does not want the Red Dragon after all. Swipe its line to the left, then tap Remove. On a phone, open the cart first.', until: { kind: 'state', test: s => !has(s, DRAGON) }, gesture: 'swipe-left', allow: ['remove'], recover: { say: 'Open the cart from the bar at the bottom, then find the Red Dragon line.', target: SPOT.cartOpen }, at: { tabs: ['checkout'], routes: ['cart'], sheets: true } },
    { id: 'g-total', say: 'The total is always at the bottom of the cart and counts every quantity. Charge is how you take payment, which is the next course.', until: { kind: 'next' } },
  ],
  check1: [
    { id: 'build', title: 'Build a cart with three different items', until: { kind: 'state', test: s => kinds(s) >= 3 }, ladder: ['The grid shows items you can sell.', 'Tap a tile to add it to the cart.', 'You need three different items, not three of the same one.', 'Tap three different tiles.'], reveal: gridItemSpot(BEE), via: SPOT.tabCheckout, allow: ['add'], at: { tabs: ['checkout'], routes: ['cart'], sheets: false } },
  ],
  check2: [
    { id: 'change-mind', title: 'The customer swaps the Red Dragon for a Dragon Egg. Take one out and add the other', until: { kind: 'state', test: s => has(s, EGG) && !has(s, DRAGON) }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 2 }, { variantId: DRAGON, qty: 1 }] }], taughtBy: 'g-remove',
      ladder: ['The cart already has some items in it.', 'Two things have to change: one item goes and another comes in.', 'Swipe the Red Dragon line to the left and tap Remove, then tap the Dragon Egg tile.', 'Open the cart, remove the Red Dragon, then add the Dragon Egg from the grid.'], reveal: cartLineSpot(DRAGON), via: SPOT.cartOpen, allow: ['add', 'remove'], at: { tabs: ['checkout'], routes: ['cart'], sheets: true },
      watch: [{ id: 'bee-gone', when: s => !has(s, BEE), say: 'The customer still wants the Bumble Bees. Tap the Bumble Bee tile to put one back.', target: gridItemSpot(BEE), via: SPOT.tabCheckout, how: ['Find the Bumble Bee on the grid.', 'Tap its tile to add it back.'], taughtIn: 'cart' }] },
  ],
  recap: ['You add an item by tapping its tile, and tap again to add more of it.', 'The cart keeps a line for each item, with its quantity, and the total is always at the bottom.', 'You take an item out by swiping its line to the left and tapping Remove.'],
};
