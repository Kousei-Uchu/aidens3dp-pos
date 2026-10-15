// Location: src/training/modules/saved-carts.ts
// "Park and resume a sale": saving a sale to come back to, opening it again, the Merge Carts? prompt when the till is
// not empty, and handing a saved cart to a workmate. Practice data only: the saved carts are made up and shared nowhere.
import type { TrainingModule, TrainSnap } from '../../lib/trainingModule';
import { SPOT, gridItemSpot, savedAssignSpot, savedRowSpot } from '../../lib/trainingSpots';
import { PRACTICE_CASEY, PRACTICE_SAVED_PRIYA, PRACTICE_SAVED_SAM } from '../../lib/trainingSandbox';

const BEE = 'train-v-bee', EGG = 'train-v-egg', KEY = 'train-v-key';

const has = (s: { cart: readonly { variantId?: string }[] }, id: string): boolean => s.cart.some(l => l.variantId === id);
/** A saved cart somewhere in the list holds this practice item. */
const parked = (s: TrainSnap, id: string): boolean => (s.savedCarts ?? []).some(sc => sc.variants.includes(id));
/** Some saved cart has been handed to this person. */
const givenTo = (s: TrainSnap, staffId: string): boolean => (s.savedCarts ?? []).some(sc => sc.assignedTo === staffId);

const base = { tabs: ['checkout', 'more'], routes: ['cart', 'saved'] };
const list = { ...base, sheets: false }; const win = { ...base, sheets: true };
const grid = { tabs: ['checkout'], routes: [] as string[], sheets: false };

export const savedCarts: TrainingModule = {
  id: 'saved-carts', title: 'Park and resume a sale', summary: 'Put a sale aside so the till is free, open it again later, merge it into a cart that already has items, and hand a saved cart to a workmate. Eight minutes with practice carts, nothing real is changed.', minutes: 8,
  flow: 'standard', tabs: ['checkout', 'more'], routes: ['cart', 'saved'], practiceStaff: true,
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 18, w: 560, h: 34, label: 'Park and resume a sale', size: 22, align: 'center' },
        { id: 'in-sub', kind: 'text', x: 60, y: 54, w: 520, h: 44, label: 'A saved cart is a sale put aside. The till is free for the next customer, and the cart comes back whenever it is needed.', size: 12, align: 'center', hidden: true },
        { id: 'c-save', kind: 'panel', x: 40, y: 106, w: 270, h: 96, label: 'SAVE IT', hidden: true },
        { id: 'i-save', kind: 'icon', x: 52, y: 134, w: 44, h: 44, icon: 'bookmark', tone: 'accent', size: 34, hidden: true },
        { id: 't-save', kind: 'text', x: 104, y: 126, w: 198, h: 66, label: 'Park the sale', sub: 'Save cart, in the cart menu, names it and clears the till.', size: 13, hidden: true },
        { id: 'c-open', kind: 'panel', x: 330, y: 106, w: 270, h: 96, label: 'OPEN IT', hidden: true },
        { id: 'i-open', kind: 'icon', x: 342, y: 134, w: 44, h: 44, icon: 'bookmarks', tone: 'accent', size: 34, hidden: true },
        { id: 't-open', kind: 'text', x: 394, y: 126, w: 198, h: 66, label: 'Back on the till', sub: 'More, then Saved carts. Open puts it back as it was.', size: 13, hidden: true },
        { id: 'c-merge', kind: 'panel', x: 40, y: 216, w: 270, h: 96, label: 'MERGE', hidden: true },
        { id: 'i-merge', kind: 'icon', x: 52, y: 244, w: 44, h: 44, icon: 'git-merge', tone: 'accent', size: 34, hidden: true },
        { id: 't-merge', kind: 'text', x: 104, y: 236, w: 198, h: 66, label: 'Merge Carts?', sub: 'If the till is not empty, it asks before adding the items.', size: 13, hidden: true },
        { id: 'c-assign', kind: 'panel', x: 330, y: 216, w: 270, h: 96, label: 'ASSIGN IT', hidden: true },
        { id: 'i-assign', kind: 'icon', x: 342, y: 244, w: 44, h: 44, icon: 'person-add', tone: 'accent', size: 34, hidden: true },
        { id: 't-assign', kind: 'text', x: 394, y: 236, w: 198, h: 66, label: 'Hand it over', sub: 'Assign to a workmate, so they pick up the right cart.', size: 13, hidden: true },
        { id: 'c-shared', kind: 'panel', x: 40, y: 326, w: 560, h: 60, label: 'ONE LIST, EVERY REGISTER', hidden: true },
        { id: 'i-shared', kind: 'icon', x: 52, y: 338, w: 36, h: 36, icon: 'sync', tone: 'neutral', size: 28, hidden: true },
        { id: 't-shared', kind: 'text', x: 98, y: 336, w: 490, h: 44, label: 'Saved carts are shared, so one parked on a register is waiting on the others.', size: 13, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', say: 'A saved cart is a sale put aside. The till is free for the next customer, and the cart comes back whenever it is needed.', set: { 'in-sub': { hidden: false }, 'c-shared': { hidden: false }, 'i-shared': { hidden: false }, 't-shared': { hidden: false } }, focus: 'in-sub' },
      { id: 'save', say: 'Save a cart from the cart menu on Checkout. Give it a name, and the till clears for the next customer.', set: { 'c-save': { hidden: false }, 'i-save': { hidden: false }, 't-save': { hidden: false } }, focus: 't-save' },
      { id: 'open', say: 'Find it again under More, then Saved carts. Open puts the whole cart back on the till.', set: { 'c-open': { hidden: false }, 'i-open': { hidden: false }, 't-open': { hidden: false } }, focus: 't-open' },
      { id: 'merge', say: 'If the till already has items, Open asks first. Merge Carts? adds the saved items to what is there.', set: { 'c-merge': { hidden: false }, 'i-merge': { hidden: false }, 't-merge': { hidden: false } }, focus: 't-merge' },
      { id: 'assign', say: 'Assign a saved cart to a workmate, so it is clear whose it is when they pick it up.', set: { 'c-assign': { hidden: false }, 'i-assign': { hidden: false }, 't-assign': { hidden: false } }, focus: 't-assign' },
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
        { id: 'menu-save', kind: 'row', x: 354, y: 120, w: 240, h: 40, label: 'Save cart', icon: 'bookmark-outline', hidden: true },
        { id: 'savewin', kind: 'panel', x: 120, y: 50, w: 400, h: 300, label: 'SAVE CART', hidden: true },
        { id: 'save-name', kind: 'field', x: 138, y: 110, w: 364, h: 40, label: 'Name', value: 'Sam - holding for Friday', hidden: true },
        { id: 'save-btn', kind: 'button', x: 138, y: 250, w: 364, h: 40, label: 'Save to Saved carts', hidden: true },
        { id: 'line-egg', kind: 'row', x: 40, y: 120, w: 560, h: 54, label: 'Dragon Egg', sub: '2 × $6.00', value: '$12.00', hidden: true },
        { id: 'line-bee', kind: 'row', x: 40, y: 180, w: 560, h: 54, label: 'Bumble Bee', sub: '1 × $8.00', value: '$8.00', hidden: true },
        { id: 'dock', kind: 'panel', x: 0, y: 366, w: 640, h: 34 },
        { id: 'dock-say', kind: 'text', x: 14, y: 370, w: 612, h: 26, label: 'A sale is parked from the cart menu.', size: 13 },
      ] },
      { id: 'saved', nodes: [
        { id: 'list-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Saved carts', sub: 'Practice data' },
        { id: 'row-sam', kind: 'row', x: 20, y: 56, w: 600, h: 44, label: 'Sam, holding for Friday', sub: '2 items · $12.00' },
        { id: 'row-priya', kind: 'row', x: 20, y: 106, w: 600, h: 44, label: 'Priya, pickup Tuesday', sub: '1 item · $5.00' },
        { id: 'selwin', kind: 'panel', x: 120, y: 70, w: 400, h: 290, label: 'Sam, holding for Friday', hidden: true },
        { id: 'sel-line', kind: 'text', x: 138, y: 104, w: 364, h: 20, label: '2 × Dragon Egg', size: 13, hidden: true },
        { id: 'sel-open', kind: 'button', x: 138, y: 150, w: 364, h: 36, label: 'Open', hidden: true },
        { id: 'sel-assign', kind: 'button', x: 138, y: 194, w: 364, h: 36, label: 'Assign → Casey', hidden: true },
        { id: 'confirm', kind: 'panel', x: 170, y: 110, w: 300, h: 150, label: 'MERGE CARTS?', hidden: true },
        { id: 'confirm-t', kind: 'text', x: 186, y: 140, w: 268, h: 46, label: 'Add the items from this saved cart to the current cart?', size: 12, align: 'center', hidden: true },
        { id: 'confirm-y', kind: 'button', x: 186, y: 206, w: 268, h: 32, label: 'Merge', hidden: true },
        { id: 'dock2', kind: 'panel', x: 0, y: 366, w: 640, h: 34 },
        { id: 'dock2-say', kind: 'text', x: 14, y: 370, w: 612, h: 26, label: 'Saved carts are under More, then Saved carts.', size: 13 },
      ] },
    ],
    steps: [
      { id: 'park', title: 'The cart menu', say: 'A sale the customer will come back for is parked from the cart menu. Tap the three dots in the cart.', tap: 'dots', set: { menu: { hidden: false }, 'menu-save': { hidden: false } }, focus: 'menu-save', note: 'Cart menu' },
      { id: 'name', title: 'Save cart', say: 'Tap Save cart and give it a name you will recognise later.', tap: 'menu-save', set: { menu: { hidden: true }, 'menu-save': { hidden: true }, savewin: { hidden: false }, 'save-name': { hidden: false }, 'save-btn': { hidden: false } }, focus: 'save-name', note: 'Name it' },
      { id: 'parked', title: 'Parked', say: 'Save to Saved carts parks the sale and frees the till. Saved carts are under More, then Saved carts.', tap: 'save-btn', screen: 'saved', set: { savewin: { hidden: true }, 'save-name': { hidden: true }, 'save-btn': { hidden: true } }, focus: 'row-sam', note: 'Under More' },
      { id: 'reopen', title: 'Open a saved cart', say: 'Tap a saved cart to open its window.', tap: 'row-sam', set: { selwin: { hidden: false }, 'sel-line': { hidden: false }, 'sel-open': { hidden: false }, 'sel-assign': { hidden: false } }, focus: 'selwin', note: 'Open or assign' },
      { id: 'open', title: 'Open', say: 'Open puts the whole cart back on the till, ready to carry on. On an empty till it loads straight away.', tap: 'sel-open', screen: 'checkout', set: { selwin: { hidden: true }, 'sel-line': { hidden: true }, 'sel-open': { hidden: true }, 'sel-assign': { hidden: true }, 'line-egg': { hidden: false } }, focus: 'line-egg', note: 'Back on the till' },
      { id: 'add', title: 'Not empty now', say: 'Say the customer adds one more thing, so the till is no longer empty.', set: { 'line-bee': { hidden: false }, 'dock-say': { label: 'The till has items again.' } }, focus: 'line-bee', note: 'One more item' },
      { id: 'merge', title: 'It asks first', say: 'Opening another saved cart now asks first: Merge Carts? Read it, then tap Merge to add the saved items to what is there.', screen: 'saved', set: { confirm: { hidden: false }, 'confirm-t': { hidden: false }, 'confirm-y': { hidden: false }, 'dock2-say': { label: 'Merge adds them to the current cart.' } }, focus: 'confirm-y', note: 'Read before you tap' },
      { id: 'merged', title: 'Merged', say: 'Merge puts the two together. Nothing is lost, and the till carries on with all the items.', tap: 'confirm-y', screen: 'checkout', set: { confirm: { hidden: true }, 'confirm-t': { hidden: true }, 'confirm-y': { hidden: true }, 'line-egg': { hidden: false }, 'line-bee': { hidden: false }, 'dock-say': { label: 'Both carts are now on the till.' } }, focus: 'line-bee', note: 'All together' },
      { id: 'assign', title: 'Hand it over', say: 'A saved cart can be handed to a workmate. Tap Assign beside their name.', screen: 'saved', set: { selwin: { hidden: false }, 'sel-line': { hidden: false }, 'sel-open': { hidden: false }, 'sel-assign': { hidden: false }, 'dock2-say': { label: 'The list shows who it is for.' } }, focus: 'sel-assign', note: 'Hand it over' },
      { id: 'assigned', title: 'Assigned', say: 'Now Casey knows Sam\'s cart is waiting for them. That is saving, opening, merging and assigning.', tap: 'sel-assign', set: { selwin: { hidden: true }, 'sel-line': { hidden: true }, 'sel-open': { hidden: true }, 'sel-assign': { hidden: true }, 'row-sam': { sub: '2 items · → Casey' }, 'dock2-say': { label: 'The list shows who it is for.' } }, focus: 'row-sam', note: 'For Casey' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will park a sale so the till is free, open it again, merge a saved cart into a cart that already has items, and hand one to a workmate. Nothing leaves this till.', until: { kind: 'next' }, at: list },
    { id: 'g-add', target: gridItemSpot(BEE), say: 'First a sale to park. On the Checkout tab, tap the Bumble Bee tile.', until: { kind: 'state', test: s => has(s, BEE) }, gesture: 'tap', allow: ['add'], at: grid, recover: { say: 'On the Checkout tab, tap the Bumble Bee tile.', target: SPOT.tabCheckout } },
    { id: 'g-menu', target: SPOT.cartMenu, say: 'Tap the three dots in the cart to open the cart menu.', until: { kind: 'press', id: SPOT.cartMenu }, gesture: 'tap', allow: [], at: grid, recover: { say: 'On the Checkout tab, tap the three dots in the cart.', target: SPOT.tabCheckout } },
    { id: 'g-save-row', target: SPOT.cartMenuSave, say: 'Tap Save cart to put this sale aside.', until: { kind: 'press', id: SPOT.cartMenuSave }, gesture: 'tap', allow: [], at: win, recover: { say: 'Tap the three dots in the cart, then Save cart.', target: SPOT.cartMenu } },
    { id: 'g-name', target: SPOT.savedName, say: 'Give it a name you will recognise, such as Sam - holding for Friday.', until: { kind: 'state', test: s => (s.savedNameDraft ?? '').trim().length > 0 }, gesture: 'tap', typing: true, allow: [], at: win },
    { id: 'g-save', target: SPOT.savedSave, say: 'Tap Save to Saved carts. The sale is parked and the till is free for the next customer.', until: { kind: 'state', test: s => parked(s, BEE) }, gesture: 'tap', allow: ['remove'], at: win },
    { id: 'g-more', target: SPOT.tabMore, say: 'Now go and get a saved cart. Tap More at the bottom of the screen.', until: { kind: 'state', test: s => s.tab === 'more' || s.route === 'saved' }, gesture: 'tap', allow: [], at: grid, recover: { say: 'Tap More at the bottom of the screen.', target: SPOT.tabCheckout } },
    { id: 'g-load', target: SPOT.moreSaved, say: 'Tap Saved carts to see every cart that has been parked.', until: { kind: 'state', test: s => s.route === 'saved' }, gesture: 'tap', allow: [], at: list, recover: { say: 'Tap the More tab at the bottom, then Saved carts.', target: SPOT.tabMore } },
    { id: 'g-list', say: 'This is the list of saved carts. Each row has the name, how many items, and who it is assigned to. Sam\'s cart is first.', until: { kind: 'next' }, at: list },
    { id: 'g-pick', target: savedRowSpot(PRACTICE_SAVED_SAM), say: 'Tap Sam\'s saved cart to open its window.', until: { kind: 'press', id: savedRowSpot(PRACTICE_SAVED_SAM) }, gesture: 'tap', allow: [], at: list, recover: { say: 'Tap the More tab, then Saved carts.', target: SPOT.tabMore } },
    { id: 'g-open', target: SPOT.savedOpen, say: 'The window lists what is in it. Tap Open to put the cart back on the till. The till is empty, so it loads straight away.', until: { kind: 'state', test: s => s.cartSavedFrom === PRACTICE_SAVED_SAM && has(s, EGG) }, gesture: 'tap', allow: ['add'], at: win, recover: { say: 'Tap the More tab, then Saved carts, then Sam\'s cart.', target: SPOT.tabMore } },
    { id: 'g-back', say: 'The cart is back on the till with Sam\'s two Dragon Eggs, and the till remembers which saved cart it came from.', until: { kind: 'next' }, at: list },
    { id: 'g-add2', target: gridItemSpot(BEE), say: 'Now a customer at the counter wants the Bumble Bee too. Tap its tile.', until: { kind: 'state', test: s => has(s, BEE) }, gesture: 'tap', allow: ['add'], at: grid, recover: { say: 'On the Checkout tab, tap the Bumble Bee tile.', target: SPOT.tabCheckout } },
    { id: 'g-more2', target: SPOT.tabMore, say: 'Now open a second saved cart while the till still has items. Tap More.', until: { kind: 'state', test: s => s.tab === 'more' || s.route === 'saved' }, gesture: 'tap', allow: [], at: grid, recover: { say: 'Tap More at the bottom of the screen.', target: SPOT.tabCheckout } },
    { id: 'g-load2', target: SPOT.moreSaved, say: 'Tap Saved carts.', until: { kind: 'state', test: s => s.route === 'saved' }, gesture: 'tap', allow: [], at: list, recover: { say: 'Tap the More tab at the bottom, then Saved carts.', target: SPOT.tabMore } },
    { id: 'g-pick2', target: savedRowSpot(PRACTICE_SAVED_PRIYA), say: 'Tap Priya\'s saved cart.', until: { kind: 'press', id: savedRowSpot(PRACTICE_SAVED_PRIYA) }, gesture: 'tap', allow: [], at: list, recover: { say: 'Tap the More tab, then Saved carts.', target: SPOT.tabMore } },
    { id: 'g-merge', target: SPOT.savedOpen, say: 'The till is not empty, so Open asks first. Read the prompt and tap Merge to add Priya\'s Keyring to the cart.', until: { kind: 'state', test: s => has(s, EGG) && has(s, BEE) && has(s, KEY) }, gesture: 'tap', allow: ['add'], at: win, recover: { say: 'Tap the More tab, then Saved carts, then Priya\'s cart.', target: SPOT.tabMore } },
    { id: 'g-more3', target: SPOT.tabMore, say: 'One more job: hand a saved cart to a workmate. Tap More.', until: { kind: 'state', test: s => s.tab === 'more' || s.route === 'saved' }, gesture: 'tap', allow: [], at: grid, recover: { say: 'Tap More at the bottom of the screen.', target: SPOT.tabCheckout } },
    { id: 'g-load3', target: SPOT.moreSaved, say: 'Tap Saved carts.', until: { kind: 'state', test: s => s.route === 'saved' }, gesture: 'tap', allow: [], at: list, recover: { say: 'Tap the More tab at the bottom, then Saved carts.', target: SPOT.tabMore } },
    { id: 'g-pick3', target: savedRowSpot(PRACTICE_SAVED_SAM), say: 'Tap Sam\'s saved cart to open its window.', until: { kind: 'press', id: savedRowSpot(PRACTICE_SAVED_SAM) }, gesture: 'tap', allow: [], at: list, recover: { say: 'Tap the More tab, then Saved carts.', target: SPOT.tabMore } },
    { id: 'g-assign', target: savedAssignSpot(PRACTICE_CASEY), say: 'Tap Assign → Casey. The cart stays on the till, ready for whoever Casey serves next, and the list shows it is theirs.', until: { kind: 'state', test: s => givenTo(s, PRACTICE_CASEY) }, gesture: 'tap', allow: [], at: win, recover: { say: 'Tap the More tab, then Saved carts, then a cart.', target: SPOT.tabMore } },
    { id: 'g-done', say: 'That is saving, opening, merging and assigning a saved cart. Next you will do it without the hints.', until: { kind: 'next' }, at: list },
  ],
  check1: [
    { id: 'save', title: 'Park this customer\'s sale so the till is free', until: { kind: 'state', test: s => parked(s, BEE) }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }] }],
      ladder: ['A sale is parked from the cart menu on Checkout.', 'The three dots in the cart hold Save cart.', 'Tap the three dots, Save cart, give it a name, then tap Save to Saved carts.'], reveal: SPOT.cartMenuSave, via: SPOT.cartMenu, gesture: 'tap', allow: ['remove'], at: win },
    { id: 'open', title: 'Open the cart Sam parked, on an empty till', until: { kind: 'state', test: s => s.cartSavedFrom === PRACTICE_SAVED_SAM && has(s, EGG) }, inject: [{ kind: 'cart', items: [] }],
      ladder: ['Saved carts are under the More tab.', 'Open More, then Saved carts, and tap the row for Sam.', 'Tap Sam\'s cart, then Open.'], reveal: savedRowSpot(PRACTICE_SAVED_SAM), via: SPOT.moreSaved, gesture: 'tap', allow: ['add'], at: win },
    { id: 'merge', title: 'The till has an item. Add Sam\'s saved cart to it', until: { kind: 'state', test: s => has(s, BEE) && has(s, EGG) }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }] }],
      ladder: ['When the till is not empty, Open asks before adding a saved cart.', 'Read the prompt, then tap Merge.', 'Tap More, Saved carts, Sam\'s cart, Open, then Merge in the prompt.'], reveal: SPOT.savedOpen, via: SPOT.moreSaved, gesture: 'tap', allow: ['add'], at: win },
    { id: 'assign', title: 'Hand a saved cart to a workmate', until: { kind: 'state', test: s => givenTo(s, PRACTICE_CASEY) },
      ladder: ['A saved cart can be given to another person.', 'On the Saved carts list, tap a cart, then tap the Assign button for the person.', 'Tap a saved cart, then Assign → Casey.'], reveal: savedAssignSpot(PRACTICE_CASEY), via: SPOT.moreSaved, gesture: 'tap', allow: [], at: win },
  ],
  check2: [
    { id: 'c2-merge', title: 'A cart is on the till. Add the customer\'s parked cart to it', until: { kind: 'state', test: s => has(s, BEE) && has(s, EGG) }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }] }], taughtBy: 'merge',
      ladder: ['The till already has something, so opening a saved cart asks first.', 'Read the prompt before you tap.', 'Open Sam\'s saved cart from More, then tap Merge.'], reveal: SPOT.savedOpen, via: SPOT.moreSaved, gesture: 'tap', allow: ['add'], at: win },
    { id: 'c2-assign', title: 'You are signed in as Morgan. Hand the waiting cart to Casey', until: { kind: 'state', test: s => givenTo(s, PRACTICE_CASEY) }, inject: [{ kind: 'staff', who: 'morgan' }], taughtBy: 'assign',
      ladder: ['A manager can pass a parked cart to a cashier.', 'On the Saved carts list, tap the cart, then the Assign button for Casey.', 'Tap a saved cart, then Assign → Casey.'], reveal: savedAssignSpot(PRACTICE_CASEY), via: SPOT.moreSaved, gesture: 'tap', allow: [], at: win },
  ],
  recap: ['You park a sale with Save cart, in the cart menu, so the till is free for the next customer.', 'You find it again under More, then Saved carts, and Open puts the whole cart back on the till.', 'If the till already has items, Open asks first, and Merge Carts? adds the saved items to what is there.', 'You can assign a saved cart to a workmate, so it is clear whose it is when they pick it up.'],
};
