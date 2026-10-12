// Location: src/training/modules/find-items.ts
// "Find the right item": pages, categories, the variation picker, Search, and the Keypad for a price with no tile.
// Practice data: Home and Extras pages, Animals and Dragons categories, a Highland Cow in two sizes (see trainingSandbox.ts).
import type { TrainingModule, TrainSnap } from '../../lib/trainingModule';
import { gridAim, tabsAim } from '../aims';
import { SPOT, cartLineSpot, findKeySpot, findTabSpot, gridCatSpot, gridItemSpot, gridPageSpot, pickVariantSpot, searchResultSpot } from '../../lib/trainingSpots';
import { PRACTICE_PAGE_EXTRAS, PRACTICE_PAGE_HOME } from '../../lib/trainingSandbox';

const COW_P = 'train-p-cow'; const COW_S = 'train-v-cow-s'; const COW_L = 'train-v-cow-l'; const DRAGON = 'train-v-dragon'; const EGG = 'train-v-egg'; const KEY = 'train-v-key'; const STICKER = 'train-v-sticker';
const ANIMALS = 'train-c-animals';
const has = (s: { cart: { variantId?: string }[] }, id: string): boolean => s.cart.some(l => l.variantId === id);
const custom = (s: { cart: { kind: string }[] }): boolean => s.cart.some(l => l.kind === 'custom');
const at = { tabs: ['checkout'], routes: ['cart'], sheets: false };
const KEYS = '450'; const WORD = 'egg';
const priced = (s: { cart: { kind: string; unitCents?: number }[] }): boolean => s.cart.some(l => l.kind === 'custom' && l.unitCents === 450);
/** The next key to tap to key in 450, or the way to start again when something else was keyed in. */
const keysAim = (s: TrainSnap): { say: string; target: string } | null => {
  const t = s.typed?.keypad ?? '';
  if (t === KEYS) return null;
  if (KEYS.startsWith(t)) return { say: `Tap ${KEYS[t.length]}. Key in 4, 5, 0 for $4.50.`, target: findKeySpot(KEYS[t.length]) };
  return { say: 'That is not 4, 5, 0. Tap C to clear the amount and start again.', target: findKeySpot('C') };
};
const wordAim = (s: TrainSnap): { say: string; target: string } | null => {
  const t = (s.typed?.search ?? '').trim().toLowerCase();
  if (WORD.startsWith(t)) return t ? { say: `Keep typing: you have "${t}", the word is egg.`, target: SPOT.searchField } : null;
  return { say: 'That is not egg. Clear the box and type egg.', target: SPOT.searchField };
};

export const findItems: TrainingModule = {
  id: 'find-items', title: 'Find the right item', summary: 'Pages, categories, sizes, Search and the Keypad, so you can always reach the item a customer asks for. Ten minutes with practice data.', minutes: 10,
  flow: 'standard', tabs: ['checkout'], routes: ['cart'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 20, w: 560, h: 34, label: 'Find the right item', size: 22, align: 'center' },
        { id: 'in-sub', kind: 'text', x: 60, y: 58, w: 520, h: 40, label: 'An item can be reached more than one way. Use whichever is quickest for the customer in front of you.', size: 13, align: 'center', hidden: true },
        { id: 'c-pages', kind: 'panel', x: 40, y: 108, w: 270, h: 96, label: 'PAGES', hidden: true },
        { id: 'i-pages', kind: 'icon', x: 52, y: 138, w: 44, h: 44, icon: 'albums', tone: 'accent', size: 34, hidden: true },
        { id: 't-pages', kind: 'text', x: 104, y: 130, w: 198, h: 66, label: 'Pages', sub: 'Chips above the grid. Each page has its own tiles.', size: 15, hidden: true },
        { id: 'c-cats', kind: 'panel', x: 330, y: 108, w: 270, h: 96, label: 'CATEGORIES', hidden: true },
        { id: 'i-cats', kind: 'icon', x: 342, y: 138, w: 44, h: 44, icon: 'folder-open', tone: 'accent', size: 34, hidden: true },
        { id: 't-cats', kind: 'text', x: 394, y: 130, w: 198, h: 66, label: 'Categories', sub: 'A tile that opens a group. The arrow goes back.', size: 15, hidden: true },
        { id: 'c-search', kind: 'panel', x: 40, y: 216, w: 270, h: 96, label: 'SEARCH', hidden: true },
        { id: 'i-search', kind: 'icon', x: 52, y: 246, w: 44, h: 44, icon: 'search', tone: 'accent', size: 34, hidden: true },
        { id: 't-search', kind: 'text', x: 104, y: 238, w: 198, h: 66, label: 'Search', sub: 'Type part of a name, SKU or barcode.', size: 15, hidden: true },
        { id: 'c-keypad', kind: 'panel', x: 330, y: 216, w: 270, h: 96, label: 'KEYPAD', hidden: true },
        { id: 'i-keypad', kind: 'icon', x: 342, y: 246, w: 44, h: 44, icon: 'calculator', tone: 'accent', size: 34, hidden: true },
        { id: 't-keypad', kind: 'text', x: 394, y: 238, w: 198, h: 66, label: 'Keypad', sub: 'Key in a price for something with no tile.', size: 15, hidden: true },
        { id: 'c-sizes', kind: 'panel', x: 40, y: 324, w: 560, h: 60, label: 'SOME ITEMS HAVE CHOICES', hidden: true },
        { id: 'i-sizes', kind: 'icon', x: 52, y: 338, w: 36, h: 36, icon: 'layers', tone: 'accent', size: 28, hidden: true },
        { id: 't-sizes', kind: 'text', x: 98, y: 338, w: 490, h: 40, label: 'Tap the item and pick the size or colour from what opens.', size: 13, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', title: 'Many ways to one item', say: 'Customers ask for things in different ways. The till gives you four ways to reach an item, and you can mix them in one sale.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub', note: 'Four ways in' },
      { id: 'pages', title: 'Pages', say: 'The grid has pages, shown as chips above the tiles. The items you sell most are on the first page and others can live on the next.', set: { 'c-pages': { hidden: false }, 'i-pages': { hidden: false }, 't-pages': { hidden: false } }, focus: 'c-pages', note: 'Change page' },
      { id: 'categories', title: 'Categories', say: 'A category tile opens a smaller grid. The path above it shows where you are, and the back arrow takes you up one level.', set: { 'c-cats': { hidden: false }, 'i-cats': { hidden: false }, 't-cats': { hidden: false } }, focus: 'c-cats', note: 'Open and go back' },
      { id: 'search', title: 'Search', say: 'When you cannot see it, search. Type a few letters of the name, a SKU or a barcode and tap the match.', set: { 'c-search': { hidden: false }, 'i-search': { hidden: false }, 't-search': { hidden: false } }, focus: 'c-search', note: 'Find anything' },
      { id: 'keypad', title: 'Keypad', say: 'For something with no tile, such as a repair, key in the price on the Keypad. It joins the cart as a custom amount.', set: { 'c-keypad': { hidden: false }, 'i-keypad': { hidden: false }, 't-keypad': { hidden: false } }, focus: 'c-keypad', note: 'Any price' },
      { id: 'sizes', title: 'Sizes and colours', say: 'If an item has choices, tapping it opens them as tiles. Pick one and it is added. The stock under each one tells you what is left.', set: { 'c-sizes': { hidden: false }, 'i-sizes': { hidden: false }, 't-sizes': { hidden: false } }, focus: 'c-sizes', note: 'Pick a size' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'checkout', nodes: [
        { id: 'co-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Checkout', sub: 'Practice data' },
        { id: 'search', kind: 'field', x: 14, y: 48, w: 340, h: 30, label: 'Search items, customers, discounts' },
        { id: 'tab-keypad', kind: 'chip', x: 14, y: 86, w: 100, h: 26, label: 'Keypad' },
        { id: 'tab-quick', kind: 'chip', x: 120, y: 86, w: 110, h: 26, label: 'Quick Menu', tone: 'accent' },
        { id: 'tab-all', kind: 'chip', x: 236, y: 86, w: 118, h: 26, label: 'All products' },
        { id: 'pg-home', kind: 'chip', x: 14, y: 120, w: 76, h: 24, label: 'Home', tone: 'accent' },
        { id: 'pg-extras', kind: 'chip', x: 96, y: 120, w: 76, h: 24, label: 'Extras' },
        { id: 'back', kind: 'button', x: 14, y: 120, w: 40, h: 24, icon: 'chevron-back', tone: 'neutral', hidden: true },
        { id: 'crumb', kind: 'text', x: 62, y: 120, w: 290, h: 24, label: 'Home > Animals', size: 13, hidden: true },
        { id: 'tile-bee', kind: 'tile', x: 14, y: 156, w: 104, h: 82, icon: 'bug', label: 'Bumble Bee', sub: '$8.00', color: '#FEF08A' },
        { id: 'tile-cow', kind: 'tile', x: 126, y: 156, w: 104, h: 82, icon: 'paw', label: 'Highland Cow', sub: 'from $12.00', color: '#DDD6FE' },
        { id: 'tile-animals', kind: 'tile', x: 238, y: 156, w: 104, h: 82, icon: 'folder', label: 'Animals', color: '#BBF7D0' },
        { id: 'tile-sticker', kind: 'tile', x: 14, y: 156, w: 104, h: 82, icon: 'pricetag', label: 'Sticker Pack', sub: '$3.00', color: '#BFDBFE', hidden: true },
        { id: 'in-cow', kind: 'tile', x: 14, y: 156, w: 104, h: 82, icon: 'paw', label: 'Highland Cow', sub: 'from $12.00', color: '#DDD6FE', hidden: true },
        { id: 'in-bee', kind: 'tile', x: 126, y: 156, w: 104, h: 82, icon: 'bug', label: 'Bumble Bee', sub: '$8.00', color: '#FEF08A', hidden: true },
        { id: 'v-small', kind: 'tile', x: 14, y: 156, w: 104, h: 82, label: 'Small', sub: '$12.00', color: '#FEF08A', hidden: true },
        { id: 'v-large', kind: 'tile', x: 126, y: 156, w: 104, h: 82, label: 'Large', sub: '$18.00', color: '#FEF08A', hidden: true },
        { id: 'kp-amount', kind: 'text', x: 14, y: 156, w: 340, h: 44, label: '$4.50', size: 30, align: 'center', hidden: true },
        { id: 'kp-add', kind: 'button', x: 14, y: 210, w: 340, h: 34, label: 'Add $4.50', hidden: true },
        { id: 'cart', kind: 'panel', x: 372, y: 52, w: 254, h: 250, label: 'CART' },
        { id: 'line-cow', kind: 'row', x: 380, y: 76, w: 238, h: 40, label: 'Highland Cow', sub: 'Large, 1 x $18.00', value: '$18.00', hidden: true },
        { id: 'line-egg', kind: 'row', x: 380, y: 116, w: 238, h: 40, label: 'Dragon Egg', sub: '1 x $6.00', value: '$6.00', hidden: true },
        { id: 'line-custom', kind: 'row', x: 380, y: 156, w: 238, h: 40, label: 'Custom amount', sub: '1 x $4.50', value: '$4.50', hidden: true },
        { id: 'total', kind: 'row', x: 380, y: 224, w: 238, h: 34, label: 'Total', value: '$0.00' },
        { id: 'charge', kind: 'button', x: 380, y: 264, w: 238, h: 30, label: 'Charge', icon: 'card' },
        { id: 'sheet', kind: 'panel', x: 60, y: 56, w: 520, h: 190, label: 'SEARCH', hidden: true },
        { id: 'sheet-field', kind: 'field', x: 76, y: 82, w: 488, h: 32, label: 'Search', value: 'egg', hidden: true },
        { id: 'sheet-result', kind: 'row', x: 76, y: 124, w: 488, h: 44, icon: 'image-outline', label: 'Dragon Egg', sub: 'TR-EGG', value: '$6.00', hidden: true },
        { id: 'dock', kind: 'panel', x: 0, y: 340, w: 640, h: 60 },
        { id: 'dock-say', kind: 'text', x: 14, y: 346, w: 612, h: 48, label: 'Tap the Extras page to see more tiles.', size: 14 },
      ] },
    ],
    steps: [
      { id: 'pages', title: 'Change page', say: 'Not every item is on the first page. Tap Extras to see the tiles on the next page.', tap: 'pg-extras', set: { 'tile-bee': { hidden: true }, 'tile-cow': { hidden: true }, 'tile-animals': { hidden: true }, 'tile-sticker': { hidden: false }, 'pg-home': { tone: 'neutral' }, 'pg-extras': { tone: 'accent' }, 'dock-say': { label: 'Tap Home to go back to the first page.' } }, focus: 'tile-sticker', note: 'A different page' },
      { id: 'home', title: 'Back to the first page', say: 'Tap Home to go back. Each page keeps its own tiles.', tap: 'pg-home', set: { 'tile-sticker': { hidden: true }, 'tile-bee': { hidden: false }, 'tile-cow': { hidden: false }, 'tile-animals': { hidden: false }, 'pg-home': { tone: 'accent' }, 'pg-extras': { tone: 'neutral' }, 'dock-say': { label: 'A tile with a folder opens a category.' } }, focus: 'pg-home', note: 'Home again' },
      { id: 'category', title: 'Open a category', say: 'The Animals tile opens a category. Its items show, and the path above them says where you are.', tap: 'tile-animals', set: { 'tile-bee': { hidden: true }, 'tile-cow': { hidden: true }, 'tile-animals': { hidden: true }, 'pg-home': { hidden: true }, 'pg-extras': { hidden: true }, back: { hidden: false }, crumb: { hidden: false }, 'in-cow': { hidden: false }, 'in-bee': { hidden: false }, 'dock-say': { label: 'The Highland Cow has more than one size.' } }, focus: 'crumb', note: 'Where you are' },
      { id: 'sizes', title: 'Items with choices', say: 'The Highland Cow comes in sizes. Tapping it opens one tile per size, with the price on each.', tap: 'in-cow', set: { 'in-cow': { hidden: true }, 'in-bee': { hidden: true }, 'v-small': { hidden: false }, 'v-large': { hidden: false }, crumb: { label: 'Home > Animals > Highland Cow' }, 'dock-say': { label: 'Tap the size the customer wants.' } }, focus: 'v-large', note: 'Pick a size' },
      { id: 'pick', title: 'Pick one', say: 'Tap Large. It goes into the cart. The sizes stay open, so you can add another size straight away.', tap: 'v-large', set: { 'line-cow': { hidden: false }, total: { value: '$18.00' }, 'dock-say': { label: 'Tap the back arrow to leave the sizes.' } }, focus: 'line-cow', note: 'Large added' },
      { id: 'back', title: 'Go back', say: 'Tap the back arrow to leave the sizes and return to the category. Tap it again to go up another level.', tap: 'back', set: { 'v-small': { hidden: true }, 'v-large': { hidden: true }, 'in-cow': { hidden: false }, 'in-bee': { hidden: false }, crumb: { label: 'Home > Animals' }, 'dock-say': { label: 'Cannot see the item? Use Search.' } }, focus: 'crumb', note: 'One level up' },
      { id: 'search', title: 'Search for it', say: 'Cannot see the item? Tap the search bar and type a few letters. The matches appear as you type.', tap: 'search', set: { sheet: { hidden: false }, 'sheet-field': { hidden: false }, 'sheet-result': { hidden: false } }, focus: 'sheet-result', note: 'Tap the match' },
      { id: 'search-pick', title: 'Tap the match', say: 'Tap the Dragon Egg. It is added to the cart and the search window closes.', tap: 'sheet-result', set: { sheet: { hidden: true }, 'sheet-field': { hidden: true }, 'sheet-result': { hidden: true }, 'line-egg': { hidden: false }, total: { value: '$24.00' }, 'dock-say': { label: 'Something with no tile? Use the Keypad.' } }, focus: 'line-egg', note: 'Egg added' },
      { id: 'keypad', title: 'Keypad for any price', say: 'For something with no tile, such as a repair, open the Keypad tab and key in the price.', tap: 'tab-keypad', set: { 'tab-keypad': { tone: 'accent' }, 'tab-quick': { tone: 'neutral' }, back: { hidden: true }, crumb: { hidden: true }, 'in-cow': { hidden: true }, 'in-bee': { hidden: true }, 'kp-amount': { hidden: false }, 'kp-add': { hidden: false }, 'dock-say': { label: 'Key in 4, 5, 0 for $4.50, then tap Add.' } }, focus: 'kp-amount', note: 'Key in the price' },
      { id: 'custom-added', title: 'A custom amount', say: 'Tap Add. The amount joins the cart as a custom amount line. It has no stock to count.', tap: 'kp-add', set: { 'line-custom': { hidden: false }, total: { value: '$28.50' }, 'dock-say': { label: 'All four ways add to the same cart.' } }, focus: 'line-custom', note: 'Custom amount' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will find items four ways on the real till: pages, categories, Search and the Keypad. It is practice data, so nothing is saved or charged.', until: { kind: 'next' } },
    { id: 'g-extras', target: gridPageSpot(PRACTICE_PAGE_EXTRAS), say: 'Tap Extras to see the next page of tiles.', until: { kind: 'press', id: gridPageSpot(PRACTICE_PAGE_EXTRAS) }, gesture: 'tap', recover: { say: 'Tap Quick Menu to show the grid and its page names.', target: findTabSpot('quick') }, aim: gridAim('top'), allow: [], at },
    { id: 'g-sticker', target: gridItemSpot(STICKER), say: 'The Sticker Pack is on this page. Tap its tile to add it.', until: { kind: 'state', test: s => has(s, STICKER) }, gesture: 'tap', aim: gridAim('top'), allow: ['add'], at },
    { id: 'g-home', target: gridPageSpot(PRACTICE_PAGE_HOME), say: 'Tap Home to go back to the first page.', until: { kind: 'press', id: gridPageSpot(PRACTICE_PAGE_HOME) }, gesture: 'tap', aim: gridAim('top'), allow: [], at },
    { id: 'g-category', target: gridCatSpot(ANIMALS), say: 'Tap the Animals tile. A tile like this opens a category.', until: { kind: 'press', id: gridCatSpot(ANIMALS) }, gesture: 'tap', aim: gridAim('top'), allow: [], at },
    { id: 'g-cow', target: gridItemSpot(COW_P), say: 'Look at the path above the tiles: you are inside Animals. Tap the Highland Cow. It comes in more than one size.', until: { kind: 'press', id: gridItemSpot(COW_P) }, gesture: 'tap', aim: gridAim('inside'), allow: [], at },
    { id: 'g-large', target: pickVariantSpot(COW_L), say: 'One tile per size. Tap Large to add it to the cart.', until: { kind: 'state', test: s => has(s, COW_L) }, gesture: 'tap', aim: gridAim('sizes'), allow: ['add'], at },
    { id: 'g-back-sizes', target: SPOT.findBack, say: 'The sizes stay open so you can add another. Tap the back arrow to leave them.', until: { kind: 'press', id: SPOT.findBack }, gesture: 'tap', aim: gridAim('sizes'), allow: [], at },
    { id: 'g-back-category', target: SPOT.findBack, say: 'You are back in Animals. Tap the back arrow again to go up to the first page.', until: { kind: 'press', id: SPOT.findBack }, gesture: 'tap', aim: gridAim('inside'), allow: [], at },
    { id: 'g-search', target: SPOT.findSearch, say: 'Cannot see an item? Tap the search bar.', until: { kind: 'press', id: SPOT.findSearch }, gesture: 'tap', allow: [], at },
    { id: 'g-type', target: SPOT.searchField, say: 'Type egg. The matches appear under the box as you type.', until: { kind: 'state', test: s => (s.typed?.search ?? '').trim().toLowerCase() === WORD }, gesture: 'tap', aim: wordAim, allow: [], at: { tabs: ['checkout'], routes: ['cart'], sheets: true } },
    { id: 'g-result', target: searchResultSpot(EGG), say: 'Tap the Dragon Egg in the results. It is added and the window closes.', until: { kind: 'state', test: s => has(s, EGG) }, gesture: 'tap', allow: ['add'], at: { tabs: ['checkout'], routes: ['cart'], sheets: true } },
    { id: 'g-keypad-tab', target: findTabSpot('keypad'), say: 'For something with no tile, open the Keypad tab.', until: { kind: 'press', id: findTabSpot('keypad') }, gesture: 'tap', aim: tabsAim, allow: [], at },
    { id: 'g-keys', target: findKeySpot('4'), say: 'Key in a price. Tap 4, 5, 0 for $4.50.', until: { kind: 'state', test: s => s.typed?.keypad === KEYS }, gesture: 'tap', aim: keysAim, allow: [], at },
    { id: 'g-add', target: SPOT.findKeypadAdd, say: 'Tap Add. The amount joins the cart as a custom amount.', until: { kind: 'state', test: s => priced(s) }, gesture: 'tap', allow: ['add'], at },
    { id: 'g-all-tab', target: findTabSpot('all'), say: 'One more place: tap All products to see everything in the catalogue.', until: { kind: 'press', id: findTabSpot('all') }, gesture: 'tap', aim: tabsAim, allow: [], at },
    { id: 'g-filter', target: SPOT.findFilter, say: 'Type in this box to narrow the list. A product with several sizes opens its sizes when you tap it, the same as on the grid.', until: { kind: 'next' } },
    { id: 'g-quick-tab', target: findTabSpot('quick'), say: 'Tap Quick Menu to go back to the grid.', until: { kind: 'press', id: findTabSpot('quick') }, gesture: 'tap', aim: tabsAim, allow: [], at },
  ],
  check1: [
    { id: 'other-page', title: 'Add the Sticker Pack to the cart', until: { kind: 'state', test: s => has(s, STICKER) }, ladder: ['Not every item is on the first page of the grid.', 'Look at the page names above the tiles.', 'Open the Extras page, then tap the Sticker Pack tile.'], reveal: gridItemSpot(STICKER), via: gridPageSpot(PRACTICE_PAGE_EXTRAS), gesture: 'tap', allow: ['add'], at: { ...at, view: 'top' } },
    { id: 'find-egg', title: 'The customer wants a Dragon Egg. Find it with Search', until: { kind: 'state', test: s => has(s, EGG) }, ladder: ['There is a quicker way than looking through the grid.', 'The search bar is at the top of Checkout.', 'Open Search, type egg, then tap the Dragon Egg.'], reveal: searchResultSpot(EGG), via: SPOT.findSearch, gesture: 'tap', allow: ['add'], at: { tabs: ['checkout'], routes: ['cart'], sheets: true } },
    { id: 'size', title: 'The customer wants a Large Highland Cow', until: { kind: 'state', test: s => has(s, COW_L) }, ladder: ['Some items come in more than one size.', 'Tap the Highland Cow tile and look at what opens.', 'Tap the Highland Cow tile, then tap Large.'], reveal: pickVariantSpot(COW_L), via: gridItemSpot(COW_P), gesture: 'tap', allow: ['add'], at },
    { id: 'repair', title: 'A repair for $4.50 has no tile. Add it as a custom amount', until: { kind: 'state', test: s => priced(s) }, ladder: ['Not everything has a tile.', 'The Keypad tab lets you key in any price.', 'Open Keypad, tap 4, 5, 0, then tap Add.'], reveal: SPOT.findKeypadAdd, via: findTabSpot('keypad'), gesture: 'tap', allow: ['add'], at,
      watch: [{ id: 'wrong-amount', when: s => custom(s) && !priced(s), say: 'That custom amount is not $4.50. Take it out and key in 4, 5, 0.', target: SPOT.cartOpen, how: ['Open the cart.', 'Swipe the custom amount to the left and tap Remove.', 'Open Keypad, tap 4, 5, 0, then tap Add.'], taughtIn: 'cart' }] },
  ],
  check2: [
    { id: 'swap-size', title: 'The customer has a Small Highland Cow but wants the Large instead. Make the swap', until: { kind: 'state', test: s => has(s, COW_L) && !has(s, COW_S) }, inject: [{ kind: 'cart', items: [{ variantId: COW_S, qty: 1 }] }], taughtBy: 'g-large',
      ladder: ['The cart already has a Highland Cow in it.', 'Two things change: the Small goes out and the Large comes in.', 'Tap the Highland Cow tile and pick Large, then swipe the Small line to the left and tap Remove.'], reveal: pickVariantSpot(COW_L), via: gridItemSpot(COW_P), gesture: 'tap', allow: ['add', 'remove'], at: { tabs: ['checkout'], routes: ['cart'], sheets: true } },
    { id: 'two-matches', title: 'The customer wants the Red Dragon, not the egg. Find it with Search', until: { kind: 'state', test: s => has(s, DRAGON) && !has(s, EGG) }, taughtBy: 'g-result',
      ladder: ['Searching for a word can show more than one match.', 'The search bar is at the top of Checkout. Read each match before you tap one.', 'Search for dragon and tap the Red Dragon, not the Dragon Egg.'], reveal: searchResultSpot(DRAGON), via: SPOT.findSearch, gesture: 'tap', allow: ['add', 'remove'], at: { tabs: ['checkout'], routes: ['cart'], sheets: true },
      watch: [{ id: 'wrong-match', when: s => has(s, EGG), say: 'That is the Dragon Egg and the customer wants the Red Dragon. Take the egg out, then add the dragon.', target: cartLineSpot(EGG), via: SPOT.cartOpen, how: ['Open the cart.', 'Swipe the Dragon Egg line to the left and tap Remove.', 'Open Search, type dragon, and tap the Red Dragon.'], taughtIn: 'cart' }] },
    { id: 'two-extras', title: 'The customer also wants a Keyring and a Sticker Pack. Both are on the Extras page', until: { kind: 'state', test: s => has(s, KEY) && has(s, STICKER) }, taughtBy: 'g-sticker',
      ladder: ['Look at the page names above the tiles.', 'These two items sit together on one page.', 'Open the Extras page and tap the Keyring and the Sticker Pack.'], reveal: gridItemSpot(KEY), via: gridPageSpot(PRACTICE_PAGE_EXTRAS), gesture: 'tap', allow: ['add'], at },
  ],
  recap: ['You can change page and open a category, and use the path or back arrow to come back.', 'You can find any item with Search, and tap a product with sizes to choose the one you want.', 'You can key in a price on the Keypad for something with no tile.'],
};
