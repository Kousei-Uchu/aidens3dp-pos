// Location: src/training/modules/bundles-deals.ts
// "How deals show up": read-and-spot, not setup. Automatic deals that stack (the 5 Tadlings and 3 Tadlings deals on eight Tadlings), a bundle (Highland Cow with a
// Tadling), the Recommended pair tick, and the Check these bundles window. Practice data carries the deals, the bundle and a Tadling item.
import type { TrainingModule } from '../../lib/trainingModule';
import { SPOT, cartLineSpot, dealRowSpot, gridItemSpot, pickVariantSpot } from '../../lib/trainingSpots';

const TAD = 'train-v-tad'; const COW_P = 'train-p-cow'; const COW_S = 'train-v-cow-s'; const COW_L = 'train-v-cow-l';
const has = (s: { cart: { variantId?: string }[] }, id: string): boolean => s.cart.some(l => l.variantId === id);
const qtyOf = (s: { cart: { variantId?: string; qty: number }[] }, id: string): number => s.cart.filter(l => l.variantId === id).reduce((n, l) => n + l.qty, 0);
const place = { tabs: ['checkout'], routes: ['cart'], sheets: false };
const placeWin = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: true };
const phoneCart = { say: 'On a phone, tap the cart bar at the bottom of the screen to see the cart.', target: SPOT.cartOpen };

export const bundlesDeals: TrainingModule = {
  id: 'bundles-deals', title: 'How deals show up', summary: 'Read the cart: automatic deals that stack, a bundle, the Recommended pair tick, and the Check these bundles window. Nothing to set up. Six minutes with practice data.', minutes: 6,
  flow: 'standard', tabs: ['checkout'], routes: ['cart', 'pay'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 20, w: 560, h: 34, label: 'How deals show up', size: 22, align: 'center' },
        { id: 'in-sub', kind: 'text', x: 60, y: 58, w: 520, h: 40, label: 'The shop sets deals up. The till works them out for you. Your job is to read what it shows.', size: 13, align: 'center', hidden: true },
        { id: 'c-auto', kind: 'panel', x: 40, y: 108, w: 270, h: 96, label: 'AUTOMATIC DEALS', hidden: true },
        { id: 'i-auto', kind: 'icon', x: 52, y: 138, w: 44, h: 44, icon: 'flash', tone: 'accent', size: 34, hidden: true },
        { id: 't-auto', kind: 'text', x: 104, y: 130, w: 198, h: 66, label: 'A row per deal', sub: 'Shown under the item they discount.', size: 15, hidden: true },
        { id: 'c-stack', kind: 'panel', x: 330, y: 108, w: 270, h: 96, label: 'THEY STACK', hidden: true },
        { id: 'i-stack', kind: 'icon', x: 342, y: 138, w: 44, h: 44, icon: 'layers', tone: 'accent', size: 34, hidden: true },
        { id: 't-stack', kind: 'text', x: 394, y: 130, w: 198, h: 66, label: 'Biggest first', sub: 'Eight items can take a 5 deal and then a 3 deal.', size: 15, hidden: true },
        { id: 'c-bundle', kind: 'panel', x: 40, y: 216, w: 270, h: 96, label: 'BUNDLES', hidden: true },
        { id: 'i-bundle', kind: 'icon', x: 52, y: 246, w: 44, h: 44, icon: 'albums', tone: 'accent', size: 34, hidden: true },
        { id: 't-bundle', kind: 'text', x: 104, y: 238, w: 198, h: 66, label: 'A pair or set', sub: 'Shown in its own Bundle deals box.', size: 15, hidden: true },
        { id: 'c-pair', kind: 'panel', x: 330, y: 216, w: 270, h: 96, label: 'RECOMMENDED PAIR', hidden: true },
        { id: 'i-pair', kind: 'icon', x: 342, y: 246, w: 44, h: 44, icon: 'checkmark-circle', tone: 'good', size: 34, hidden: true },
        { id: 't-pair', kind: 'text', x: 394, y: 238, w: 198, h: 66, label: 'A tick or a note', sub: 'Not a recommended pair means look once.', size: 15, hidden: true },
        { id: 'c-none', kind: 'panel', x: 40, y: 324, w: 560, h: 60, label: 'NOTHING TO SET UP HERE', hidden: true },
        { id: 't-none', kind: 'text', x: 52, y: 346, w: 536, h: 36, label: 'Deals are set up in Settings. In the till you only read the cart and check what it shows.', size: 13, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', title: 'Deals do themselves', say: 'You do not apply these deals. The shop sets them up and the till works them out as items go into the cart.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub', note: 'Read, do not set' },
      { id: 'auto', title: 'A row per deal', say: 'Automatic deals show as rows under the item they discount, each with its own amount. That is how you know which deal applied.', set: { 'c-auto': { hidden: false }, 'i-auto': { hidden: false }, 't-auto': { hidden: false } }, focus: 'c-auto', note: 'Look at the rows' },
      { id: 'stack', title: 'Deals can stack', say: 'With a 5 deal and a 3 deal, eight items take both: five get the bigger deal and the other three get the smaller one. Two rows.', set: { 'c-stack': { hidden: false }, 'i-stack': { hidden: false }, 't-stack': { hidden: false } }, focus: 'c-stack', note: 'Two rows' },
      { id: 'bundle', title: 'Bundles', say: 'A bundle is a pair or set, such as a cow with a Tadling. When the cart has one, it appears in its own Bundle deals box under the items.', set: { 'c-bundle': { hidden: false }, 'i-bundle': { hidden: false }, 't-bundle': { hidden: false } }, focus: 'c-bundle', note: 'Own box' },
      { id: 'pair', title: 'Recommended pairs', say: 'A bundle can show a green tick for a recommended pair, or Not a recommended pair. The customer still gets the deal. It is just worth a look before payment.', set: { 'c-pair': { hidden: false }, 'i-pair': { hidden: false }, 't-pair': { hidden: false } }, focus: 'c-pair', note: 'Tick or note' },
      { id: 'none', title: 'Nothing to set up', say: 'Deals are set up in Settings, not in the till. Here you only read the cart and check what the till shows.', set: { 'c-none': { hidden: false }, 't-none': { hidden: false } }, focus: 'c-none', note: 'Just read' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'cart', nodes: [
        { id: 'bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Cart', sub: 'Practice data' },
        { id: 'l-tad', kind: 'row', x: 20, y: 52, w: 400, h: 44, label: 'Tadling', sub: '8 x $4.00', value: '$32.00' },
        { id: 'd5', kind: 'text', x: 40, y: 100, w: 380, h: 20, label: '5 Tadlings   -$10.00', size: 13, hidden: true },
        { id: 'd3', kind: 'text', x: 40, y: 122, w: 380, h: 20, label: '3 Tadlings   -$5.00', size: 13, hidden: true },
        { id: 'l-cow', kind: 'row', x: 20, y: 150, w: 400, h: 44, label: 'Highland Cow Small', sub: '1 x $12.00', value: '$12.00' },
        { id: 'bundle', kind: 'panel', x: 20, y: 204, w: 400, h: 100, label: 'BUNDLE DEALS', hidden: true },
        { id: 'b-name', kind: 'text', x: 36, y: 230, w: 370, h: 22, label: 'Cow and Tadling pair   -$3.00', size: 14, hidden: true },
        { id: 'b-units', kind: 'text', x: 36, y: 252, w: 370, h: 18, label: 'Highland Cow, Small   Tadling', size: 12, hidden: true },
        { id: 'b-rec', kind: 'text', x: 36, y: 274, w: 370, h: 18, label: 'Recommended pair', size: 12, hidden: true },
        { id: 'win', kind: 'panel', x: 440, y: 52, w: 190, h: 250, label: 'CHECK THESE BUNDLES', hidden: true },
        { id: 'win-say', kind: 'text', x: 450, y: 80, w: 170, h: 100, label: 'This bundle deal is applied, but the variations are not a recommended pair. The customer still gets the deal.', size: 12, hidden: true },
        { id: 'b-cont', kind: 'button', x: 450, y: 196, w: 170, h: 34, label: 'Continue to payment', hidden: true },
        { id: 'b-edit', kind: 'button', x: 450, y: 238, w: 170, h: 34, label: 'Edit cart', tone: 'neutral', hidden: true },
        { id: 'dock', kind: 'panel', x: 0, y: 366, w: 640, h: 34 },
        { id: 'dock-say', kind: 'text', x: 14, y: 370, w: 612, h: 26, label: 'Eight Tadlings and a Highland Cow in the cart.', size: 13 },
      ] },
    ],
    steps: [
      { id: 'cart', title: 'A cart', say: 'Here is a cart with eight Tadlings and a Small Highland Cow. The shop has deals for 3 Tadlings and for 5 Tadlings.', focus: 'l-tad', note: 'No deals yet', set: { 'dock-say': { label: 'Watch the rows appear under the Tadlings.' } } },
      { id: 'compound', title: 'Two deals on one line', say: 'The Tadling line shows two discount rows. Five Tadlings take the 5 deal, taking $10 off.', tap: 'l-tad', set: { d5: { hidden: false }, 'dock-say': { label: 'The biggest deal goes first.' } }, focus: 'd5', note: 'Five get $10' },
      { id: 'compound2', title: 'The other three', say: 'The three Tadlings left over take the 3 deal, $5 off. Each deal has its own row, so you can see exactly what applied.', set: { d3: { hidden: false }, 'dock-say': { label: 'Two rows, two deals.' } }, focus: 'd3', note: 'Three get $5' },
      { id: 'bundle-first', title: 'Bundles come first', say: 'A cow with a Tadling is also a bundle. It appears in its own box and uses up one Tadling, so seven are left. That is still enough for the 5 deal, but not the 3 deal.', tap: 'l-cow', set: { bundle: { hidden: false }, 'b-name': { hidden: false }, 'b-units': { hidden: false }, 'b-rec': { hidden: false }, d3: { hidden: true }, 'dock-say': { label: 'The bundle took a Tadling, so the 3 deal is gone.' } }, focus: 'bundle', note: 'Bundle first' },
      { id: 'recommended', title: 'Recommended pair', say: 'The Small cow with a Tadling is a recommended pair, so it shows a tick. Nothing for you to do.', focus: 'b-rec', note: 'All good', set: { 'dock-say': { label: 'Recommended pair: carry straight on.' } } },
      { id: 'not-recommended', title: 'Not a recommended pair', say: 'With the Large cow instead, the deal still applies, but the note reads Not a recommended pair. Before payment a Check these bundles window asks you to look once.', set: { 'l-cow': { label: 'Highland Cow Large', sub: '1 x $18.00', value: '$18.00' }, 'b-rec': { label: 'Not a recommended pair' }, 'b-units': { label: 'Highland Cow, Large   Tadling' }, win: { hidden: false }, 'win-say': { hidden: false }, 'b-cont': { hidden: false }, 'b-edit': { hidden: false }, 'dock-say': { label: 'The window appears when you tap Charge.' } }, focus: 'win-say', note: 'Look once' },
      { id: 'check', title: 'Continue or edit', say: 'If the pair is what the customer meant, tap Continue to payment. If not, tap Edit cart and change it. They get the deal either way.', tap: 'b-cont', set: { win: { hidden: true }, 'win-say': { hidden: true }, 'b-cont': { hidden: true }, 'b-edit': { hidden: true }, 'dock-say': { label: 'On to payment.' } }, focus: 'bar', note: 'Your choice' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will build a cart that gets deals, then read what the till shows. You do not set anything up. All with practice data.', until: { kind: 'next' } },
    { id: 'g-tad', target: gridItemSpot(TAD), say: 'Tap the Tadling tile eight times. Watch the cart as you go. The cart page lists the count.', until: { kind: 'state', test: s => qtyOf(s, TAD) >= 8 }, gesture: 'tap', allow: ['add', 'qty'], recover: { say: 'On the Checkout tab, tap the Tadling tile until there are eight.', target: SPOT.tabCheckout }, at: place },
    { id: 'g-lines', target: cartLineSpot(TAD), say: 'Eight Tadlings. The shop has a deal for 3 and a deal for 5. Look at the Tadling line: it has discount rows. On a phone, open the cart from the bar at the bottom.', until: { kind: 'next' }, recover: phoneCart, at: place },
    { id: 'g-row5', target: dealRowSpot(TAD, '5 Tadlings'), say: 'This is the 5 Tadlings deal. Five of the eight take it, so $10 comes off.', until: { kind: 'next' }, recover: phoneCart, at: place },
    { id: 'g-row3', target: dealRowSpot(TAD, '3 Tadlings'), say: 'The three left over take the 3 Tadlings deal, so $5 comes off. Two rows, one for each deal.', until: { kind: 'next' }, recover: phoneCart, at: place },
    { id: 'g-totals', target: SPOT.cartDeals, say: 'Down here the deals are added up: the items total, then each deal and its amount. This is what the customer saves.', until: { kind: 'next' }, recover: phoneCart, at: place },
    { id: 'g-cow', target: gridItemSpot(COW_P), say: 'Now a bundle. Tap the Highland Cow. It comes in sizes.', until: { kind: 'press', id: gridItemSpot(COW_P) }, gesture: 'tap', allow: [], recover: { say: 'On the Checkout tab, tap the Highland Cow tile.', target: SPOT.tabCheckout }, at: place },
    { id: 'g-small', target: pickVariantSpot(COW_S), say: 'Tap Small to add it to the cart.', until: { kind: 'state', test: s => has(s, COW_S) }, gesture: 'tap', allow: ['add'], recover: { say: 'Tap the Highland Cow tile again, then tap Small.', target: gridItemSpot(COW_P) }, at: place },
    { id: 'g-bundle', target: SPOT.cartBundles, say: 'A Small Highland Cow with a Tadling is a bundle. It appears in its own box, with the deal and the items in it. The bundle used one Tadling, so the 3 Tadlings row has gone.', until: { kind: 'next' }, recover: phoneCart, at: place },
    { id: 'g-pair', target: SPOT.cartBundles, say: 'The tick says Recommended pair, so there is nothing to do. With a Large cow it would say Not a recommended pair. You will practise that next.', until: { kind: 'next' }, recover: phoneCart, at: place },
    { id: 'g-done', say: 'You can read which deals applied, what a bundle took, and whether the pair is recommended. You never need to set any of this up in the till.', until: { kind: 'next' }, at: place },
  ],
  check1: [
    { id: 'c1-three', title: 'Add Tadlings until the cart has exactly three. That gets the 3 Tadlings deal', until: { kind: 'state', test: s => qtyOf(s, TAD) === 3 }, inject: [{ kind: 'cart', items: [{ variantId: TAD, qty: 1 }] }],
      ladder: ['The 3 Tadlings deal needs three Tadlings.', 'You have one now.', 'Tap the Tadling tile two more times.'], reveal: gridItemSpot(TAD), via: SPOT.tabCheckout, gesture: 'tap', allow: ['add', 'qty'], at: place },
    { id: 'c1-five', title: 'The customer wants the bigger deal. Make it five Tadlings', until: { kind: 'state', test: s => qtyOf(s, TAD) >= 5 },
      ladder: ['The bigger deal needs five.', 'You have three now.', 'Tap the Tadling tile two more times.'], reveal: gridItemSpot(TAD), via: SPOT.tabCheckout, gesture: 'tap', allow: ['add', 'qty'], at: place },
    { id: 'c1-bundle', title: 'Add a Small Highland Cow so the Cow and Tadling pair appears', until: { kind: 'state', test: s => has(s, COW_S) },
      ladder: ['A bundle needs a cow and a Tadling together.', 'The cow comes in sizes.', 'Tap the Highland Cow tile, then Small.'], reveal: pickVariantSpot(COW_S), via: gridItemSpot(COW_P), gesture: 'tap', allow: ['add'], at: place },
  ],
  check2: [
    { id: 'c2-short', title: 'A customer has four Tadlings and asks why there is no $10 deal. Make it five', until: { kind: 'state', test: s => qtyOf(s, TAD) >= 5 }, inject: [{ kind: 'cart', items: [{ variantId: TAD, qty: 4 }] }], taughtBy: 'g-row5',
      ladder: ['The $10 deal is the 5 Tadlings deal.', 'You have four, so only the 3 Tadlings deal applies.', 'Tap the Tadling tile once more.'], reveal: gridItemSpot(TAD), via: SPOT.tabCheckout, gesture: 'tap', allow: ['add', 'qty'], at: place },
    { id: 'c2-swap', title: 'The Large cow with a Tadling is not a recommended pair. Swap the Large cow for a Small one', until: { kind: 'state', test: s => has(s, COW_S) && !has(s, COW_L) }, inject: [{ kind: 'cart', items: [{ variantId: COW_L, qty: 1 }, { variantId: TAD, qty: 1 }] }], taughtBy: 'recommended',
      ladder: ['Read the Bundle deals box. It says Not a recommended pair.', 'Small is the recommended size.', 'Add a Small cow, then remove the Large one.'], reveal: pickVariantSpot(COW_S), via: gridItemSpot(COW_P), gesture: 'tap', allow: ['add', 'remove', 'qty'], at: place },
    { id: 'c2-odd', title: 'The customer really wants the Large cow. Go to payment and continue past the Check these bundles window', until: { kind: 'press', id: SPOT.bundleContinue }, inject: [{ kind: 'cart', items: [{ variantId: COW_L, qty: 1 }, { variantId: TAD, qty: 1 }] }], taughtBy: 'check',
      ladder: ['A window appears before payment when a pair is not recommended.', 'It appears when you tap Charge.', 'Tap Charge, then Continue to payment.'], reveal: SPOT.bundleContinue, via: SPOT.cartCharge, gesture: 'tap', allow: [], at: placeWin },
  ],
  recap: ['You read which automatic deals applied, one row per deal, and deals can stack on one line.', 'A bundle has its own box and uses up items, so a deal for the same items may no longer apply.', 'A Not a recommended pair note still gives the deal. You look once and continue or edit.', 'None of this is set up in the till.'],
};
