// Location: src/training/modules/inventory.ts
// "Inventory": find stock with the chips and search, then Receive, Adjust and Count, and fix a negative number. Tier 4, plan item 26.
// Practice data: the course sets its own stock (see `stock` below) so there is always something low, something out and something negative to find.
// Nothing goes to Shopify: in practice a change only edits this device's practice counts (see `isTraining` in src/screens/Inventory.tsx).
import type { TrainSnap, TrainingModule } from '../../lib/trainingModule';
import { SPOT, findKeySpot, invChipSpot, invGroupSpot, invModeSpot, invReasonSpot, invRowSpot } from '../../lib/trainingSpots';

const EGG = 'train-v-egg'; const KEY = 'train-v-key'; const STICKER = 'train-v-sticker'; const DRAGON = 'train-v-dragon'; const COW_P = 'train-p-cow';
const at = { tabs: ['inventory'], routes: [], sheets: false };
const atWin = { tabs: ['inventory'], routes: [], sheets: true };
const stockOf = (s: TrainSnap, id: string): number | null | undefined => s.stock?.[id];
type Aim = { say: string; target: string };
/** The next key to tap to key in `want`, or the way to start again when something else was keyed in. Null when it is already keyed in or the window is not open. */
const keysAim = (mode: 'receive' | 'adjust' | 'count', want: string) => (s: TrainSnap): Aim | null => {
  const i = s.inv; if (!i?.open) return null;
  if (i.mode !== mode) return { say: `Tap ${mode[0].toUpperCase()}${mode.slice(1)} first.`, target: invModeSpot(mode) };
  const t = i.digits ?? ''; if (t === want) return null;
  if (want.startsWith(t)) return { say: `Tap ${want[t.length]}. Key in ${want.split('').join(', ')}.`, target: findKeySpot(want[t.length]) };
  return { say: `That is not ${want.split('').join(', ')}. Tap C to clear it and start again.`, target: findKeySpot('C') };
};
const wordAim = (word: string) => (s: TrainSnap): Aim | null => {
  const t = (s.inv?.q ?? '').trim().toLowerCase(); if (!t || t === word) return null;
  return word.startsWith(t) ? { say: `Keep typing: you have "${t}", the word is ${word}.`, target: SPOT.invSearch } : { say: `That is not ${word}. Clear the box and type ${word}.`, target: SPOT.invSearch };
};

export const inventory: TrainingModule = {
  id: 'inventory', title: 'Inventory', summary: 'Find what is low or out, receive a delivery, adjust for damage, and count the shelf to fix a wrong number. Nine minutes with practice data, nothing goes to Shopify.', minutes: 9,
  flow: 'standard', tabs: ['inventory'], routes: [],
  stock: { [EGG]: -3, [KEY]: 0, [STICKER]: 2 },
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 20, w: 560, h: 34, label: 'Inventory', size: 22, align: 'center' },
        { id: 'in-sub', kind: 'text', x: 60, y: 58, w: 520, h: 40, label: 'Every item the till sells, with how many are left. A sale takes stock off by itself. You change it by hand when something else happens.', size: 13, align: 'center', hidden: true },
        { id: 'c-list', kind: 'panel', x: 40, y: 108, w: 270, h: 96, label: 'THE LIST', hidden: true },
        { id: 'i-list', kind: 'icon', x: 52, y: 138, w: 44, h: 44, icon: 'list', tone: 'accent', size: 34, hidden: true },
        { id: 't-list', kind: 'text', x: 104, y: 130, w: 198, h: 66, label: 'Stock on the right', sub: 'Red is below zero. Search by name or SKU.', size: 15, hidden: true },
        { id: 'c-chips', kind: 'panel', x: 330, y: 108, w: 270, h: 96, label: 'FILTERS', hidden: true },
        { id: 'i-chips', kind: 'icon', x: 342, y: 138, w: 44, h: 44, icon: 'funnel', tone: 'accent', size: 34, hidden: true },
        { id: 't-chips', kind: 'text', x: 394, y: 130, w: 198, h: 66, label: 'Low, Out, Negative', sub: 'One tap shows only what needs attention.', size: 15, hidden: true },
        { id: 'c-jobs', kind: 'panel', x: 40, y: 216, w: 270, h: 96, label: 'THREE JOBS', hidden: true },
        { id: 'i-jobs', kind: 'icon', x: 52, y: 246, w: 44, h: 44, icon: 'swap-vertical', tone: 'accent', size: 34, hidden: true },
        { id: 't-jobs', kind: 'text', x: 104, y: 238, w: 198, h: 66, label: 'Receive, Adjust, Count', sub: 'Tap an item to choose one.', size: 15, hidden: true },
        { id: 'c-shop', kind: 'panel', x: 330, y: 216, w: 270, h: 96, label: 'SHOPIFY', hidden: true },
        { id: 'i-shop', kind: 'icon', x: 342, y: 246, w: 44, h: 44, icon: 'cloud-upload', tone: 'accent', size: 34, hidden: true },
        { id: 't-shop', kind: 'text', x: 394, y: 238, w: 198, h: 66, label: 'Saved to Shopify', sub: 'The change goes there, so every register agrees.', size: 15, hidden: true },
        { id: 'c-neg', kind: 'panel', x: 40, y: 324, w: 560, h: 60, label: 'BELOW ZERO IS ALLOWED', hidden: true },
        { id: 'i-neg', kind: 'icon', x: 52, y: 338, w: 36, h: 36, icon: 'alert-circle', tone: 'bad', size: 28, hidden: true },
        { id: 't-neg', kind: 'text', x: 98, y: 338, w: 490, h: 40, label: 'A sale is never blocked. A red number just means a count is wrong.', size: 13, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', title: 'Stock in one place', say: 'Inventory shows how many of each item are left. Sales take stock off by themselves. You step in when stock arrives, goes missing or is wrong.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub', note: 'Your count' },
      { id: 'list', title: 'The list', say: 'Each row is one item. The big number on the right is its stock. Search by name, SKU or barcode.', set: { 'c-list': { hidden: false }, 'i-list': { hidden: false }, 't-list': { hidden: false } }, focus: 'c-list', note: 'Stock on the right' },
      { id: 'filters', title: 'Filters', say: 'The chips under the search box narrow the list. Low is two or fewer, Out is exactly zero, and Negative is below zero.', set: { 'c-chips': { hidden: false }, 'i-chips': { hidden: false }, 't-chips': { hidden: false } }, focus: 'c-chips', note: 'Show what needs you' },
      { id: 'jobs', title: 'Three jobs', say: 'Tap an item to change it. Receive adds what arrived. Adjust takes stock out or back with a reason. Count replaces the number with what is on the shelf.', set: { 'c-jobs': { hidden: false }, 'i-jobs': { hidden: false }, 't-jobs': { hidden: false } }, focus: 'c-jobs', note: 'Pick the right job' },
      { id: 'shopify', title: 'Shared with Shopify', say: 'A change is saved to Shopify, so the website and every register see the same number. If there is no connection you are told, and nothing changes.', set: { 'c-shop': { hidden: false }, 'i-shop': { hidden: false }, 't-shop': { hidden: false } }, focus: 'c-shop', note: 'One shared count' },
      { id: 'negative', title: 'Below zero', say: 'Stock can go below zero, because a sale must never be refused. Treat a red number as a wrong count and fix it with Count.', set: { 'c-neg': { hidden: false }, 'i-neg': { hidden: false }, 't-neg': { hidden: false } }, focus: 'c-neg', note: 'Fix it with Count' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'inv', nodes: [
        { id: 'bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Inventory', sub: 'Practice data' },
        { id: 'search', kind: 'field', x: 14, y: 48, w: 400, h: 30, label: 'Search name, SKU or barcode' },
        { id: 'chip-all', kind: 'chip', x: 14, y: 86, w: 52, h: 26, label: 'All', tone: 'accent' },
        { id: 'chip-low', kind: 'chip', x: 72, y: 86, w: 56, h: 26, label: 'Low' },
        { id: 'chip-out', kind: 'chip', x: 134, y: 86, w: 78, h: 26, label: 'Out (0)' },
        { id: 'chip-neg', kind: 'chip', x: 218, y: 86, w: 90, h: 26, label: 'Negative' },
        { id: 'r-egg', kind: 'row', x: 14, y: 124, w: 400, h: 44, label: 'Dragon Egg', sub: 'TR-EGG', value: '-3', tone: 'bad' },
        { id: 'r-key', kind: 'row', x: 14, y: 172, w: 400, h: 44, label: 'Keyring', sub: 'TR-KEY', value: '0' },
        { id: 'r-sticker', kind: 'row', x: 14, y: 220, w: 400, h: 44, label: 'Sticker Pack', sub: 'TR-STK', value: '2' },
        { id: 'r-dragon', kind: 'row', x: 14, y: 268, w: 400, h: 44, label: 'Red Dragon', sub: 'TR-DRG', value: '8' },
        { id: 'sheet', kind: 'panel', x: 60, y: 52, w: 520, h: 290, label: 'STICKER PACK', hidden: true },
        { id: 'sh-stock', kind: 'text', x: 80, y: 80, w: 480, h: 22, label: 'Current stock: 2', size: 14, align: 'center', hidden: true },
        { id: 'm-receive', kind: 'chip', x: 90, y: 110, w: 130, h: 28, label: 'Receive', tone: 'accent', hidden: true },
        { id: 'm-adjust', kind: 'chip', x: 255, y: 110, w: 130, h: 28, label: 'Adjust', hidden: true },
        { id: 'm-count', kind: 'chip', x: 420, y: 110, w: 130, h: 28, label: 'Count', hidden: true },
        { id: 'sh-num', kind: 'text', x: 80, y: 148, w: 480, h: 44, label: '+10', size: 34, align: 'center', hidden: true },
        { id: 'sh-sign', kind: 'chip', x: 150, y: 198, w: 100, h: 26, label: 'Remove', hidden: true },
        { id: 'rs-damaged', kind: 'chip', x: 260, y: 198, w: 100, h: 26, label: 'damaged', hidden: true },
        { id: 'sh-keys', kind: 'text', x: 80, y: 232, w: 480, h: 22, label: 'Number keys here', size: 12, align: 'center', hidden: true },
        { id: 'sh-apply', kind: 'button', x: 110, y: 290, w: 420, h: 34, label: 'Apply', hidden: true },
        { id: 'dock', kind: 'panel', x: 0, y: 346, w: 640, h: 54 },
        { id: 'dock-say', kind: 'text', x: 14, y: 352, w: 612, h: 42, label: 'Red means below zero.', size: 14 },
      ] },
    ],
    steps: [
      { id: 'list', title: 'The list', say: 'Each row is one item and the number on the right is its stock. The Dragon Egg is red because it is below zero.', focus: 'r-egg', note: 'Below zero', set: { 'dock-say': { label: 'Tap Low to see what is nearly gone.' } } },
      { id: 'low', title: 'Show only what is low', say: 'Tap Low. Only items with two or fewer are left in the list. Out (0) and Negative work the same way.', tap: 'chip-low', set: { 'chip-all': { tone: 'neutral' }, 'chip-low': { tone: 'accent' }, 'r-egg': { hidden: true }, 'r-dragon': { hidden: true }, 'dock-say': { label: 'Tap an item to change its stock.' } }, focus: 'r-sticker', note: 'Nearly gone' },
      { id: 'open', title: 'Open an item', say: 'Tap the Sticker Pack. A window opens on Receive, with the current stock at the top.', tap: 'r-sticker', set: { sheet: { hidden: false }, 'sh-stock': { hidden: false }, 'm-receive': { hidden: false }, 'm-adjust': { hidden: false }, 'm-count': { hidden: false }, 'sh-num': { hidden: false, label: '+0' }, 'sh-keys': { hidden: false }, 'sh-apply': { hidden: false }, 'dock-say': { label: 'Key the number that arrived.' } }, focus: 'sh-stock', note: 'Stock now: 2' },
      { id: 'receive', title: 'Receive', say: 'Ten stickers arrived. Key 1, 0 and tap Apply. Receive only ever adds, and the stock becomes 12.', tap: 'sh-apply', set: { 'sh-num': { label: '+10' }, 'sh-stock': { label: 'Current stock: 12' }, 'dock-say': { label: 'Receive adds what arrived.' } }, focus: 'sh-stock', note: 'Now 12' },
      { id: 'adjust', title: 'Adjust', say: 'Adjust takes stock out or puts it back. A box arrived with one broken: choose Remove, pick the reason Damaged, key 1 and tap Apply.', tap: 'm-adjust', set: { 'm-receive': { tone: 'neutral' }, 'm-adjust': { tone: 'accent' }, 'sh-num': { label: '-1' }, 'sh-sign': { hidden: false }, 'rs-damaged': { hidden: false, tone: 'accent' }, 'dock-say': { label: 'The reason is kept so you can see why later.' } }, focus: 'rs-damaged', note: 'Say why' },
      { id: 'count', title: 'Count', say: 'Count ignores what the till thought. You counted 6 on the shelf, so key 6 and tap Set stock to 6. This is how you fix a wrong number.', tap: 'm-count', set: { 'm-adjust': { tone: 'neutral' }, 'm-count': { tone: 'accent' }, 'sh-num': { label: '6' }, 'sh-sign': { hidden: true }, 'rs-damaged': { hidden: true }, 'sh-apply': { label: 'Set stock to 6' }, 'sh-stock': { label: 'Current stock: 11' }, 'dock-say': { label: 'Count replaces the number.' } }, focus: 'sh-apply', note: 'Real number in' },
      { id: 'negative', title: 'Fixing a negative', say: 'A red number means a count is wrong. Count the shelf, open the item, choose Count and key the real number. It turns black again.', tap: 'sh-apply', set: { sheet: { hidden: true }, 'sh-stock': { hidden: true }, 'm-receive': { hidden: true }, 'm-adjust': { hidden: true }, 'm-count': { hidden: true }, 'sh-num': { hidden: true }, 'sh-keys': { hidden: true }, 'sh-apply': { hidden: true }, 'chip-low': { tone: 'neutral' }, 'chip-neg': { tone: 'accent' }, 'r-egg': { hidden: false }, 'r-key': { hidden: true }, 'r-sticker': { hidden: true }, 'dock-say': { label: 'Negative shows only what is below zero.' } }, focus: 'r-egg', note: 'Count it, then fix it' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will use the real Inventory screen on practice data: filter, search, receive a delivery, adjust for damage and count the shelf. Nothing goes to Shopify.', until: { kind: 'next' } },
    { id: 'g-list', target: invRowSpot(EGG), say: 'Every item is listed with its stock on the right. Red means below zero. The Dragon Egg has sold more than the till thought it had.', until: { kind: 'next' }, at },
    { id: 'g-low', target: invChipSpot('low'), say: 'Tap Low to see only what is nearly gone. Two or fewer counts as low.', until: { kind: 'state', test: s => s.inv?.stock === 'low' }, gesture: 'tap', allow: [], at },
    { id: 'g-neg', target: invChipSpot('neg'), say: 'Tap Negative to see only what is below zero.', until: { kind: 'state', test: s => s.inv?.stock === 'neg' }, gesture: 'tap', allow: [], at },
    { id: 'g-all', target: invChipSpot('all'), say: 'Tap All to see everything again.', until: { kind: 'state', test: s => s.inv?.stock === 'all' }, gesture: 'tap', allow: [], at },
    { id: 'g-search', target: SPOT.invSearch, say: 'Tap the search box and type sticker. It matches the name, the SKU or the barcode.', until: { kind: 'state', test: s => (s.inv?.q ?? '').trim().toLowerCase() === 'sticker' }, gesture: 'tap', allow: [], aim: wordAim('sticker'), at },
    { id: 'g-open', target: invRowSpot(STICKER), say: 'Tap the Sticker Pack to open it.', until: { kind: 'state', test: s => s.inv?.open === STICKER }, gesture: 'tap', allow: [], stockAllow: [], at: atWin },
    { id: 'g-modes', target: SPOT.invModes, say: 'Three jobs. Receive adds stock that arrived. Adjust takes stock out or puts it back, with a reason. Count sets the number you counted on the shelf.', until: { kind: 'next' }, at: atWin },
    { id: 'g-receive-keys', target: findKeySpot('1'), say: 'Receive is chosen. Ten stickers arrived, so tap 1, then 0.', until: { kind: 'state', test: s => s.inv?.mode === 'receive' && s.inv.digits === '10' }, gesture: 'tap', allow: [], aim: keysAim('receive', '10'), stockAllow: [], at: atWin },
    { id: 'g-receive-apply', target: SPOT.invApply, say: 'Tap Apply. The stock goes from 2 to 12.', until: { kind: 'state', test: s => stockOf(s, STICKER) === 12 }, gesture: 'tap', allow: [], stockAllow: [STICKER], at: atWin },
    { id: 'g-open2', target: invRowSpot(STICKER), say: 'One sticker pack in that box was broken. Tap the Sticker Pack to open it again.', until: { kind: 'state', test: s => s.inv?.open === STICKER }, gesture: 'tap', allow: [], stockAllow: [], at: atWin },
    { id: 'g-adjust', target: invModeSpot('adjust'), say: 'Tap Adjust. It takes stock out, or puts it back.', until: { kind: 'state', test: s => s.inv?.mode === 'adjust' }, gesture: 'tap', allow: [], stockAllow: [], at: atWin },
    { id: 'g-sign', target: SPOT.invSign, say: 'The chip says Add. Tap it so it says Remove.', until: { kind: 'state', test: s => s.inv?.mode === 'adjust' && s.inv.neg === true }, gesture: 'tap', allow: [], stockAllow: [], at: atWin },
    { id: 'g-reason', target: invReasonSpot('damaged'), say: 'Pick the reason, damaged. It is kept with the change, so you can see later why the stock dropped.', until: { kind: 'state', test: s => s.inv?.reason === 'damaged' }, gesture: 'tap', allow: [], stockAllow: [], at: atWin },
    { id: 'g-adjust-keys', target: findKeySpot('1'), say: 'One was broken. Tap 1.', until: { kind: 'state', test: s => s.inv?.mode === 'adjust' && s.inv.digits === '1' }, gesture: 'tap', allow: [], aim: keysAim('adjust', '1'), stockAllow: [], at: atWin },
    { id: 'g-adjust-apply', target: SPOT.invApply, say: 'Tap Apply. The stock goes from 12 to 11.', until: { kind: 'state', test: s => stockOf(s, STICKER) === 11 }, gesture: 'tap', allow: [], stockAllow: [STICKER], at: atWin },
    { id: 'g-open3', target: invRowSpot(STICKER), say: 'You count 6 on the shelf, so the till is wrong. Tap the Sticker Pack to open it.', until: { kind: 'state', test: s => s.inv?.open === STICKER }, gesture: 'tap', allow: [], stockAllow: [], at: atWin },
    { id: 'g-count', target: invModeSpot('count'), say: 'Tap Count. It ignores what the till thought and sets the number you counted.', until: { kind: 'state', test: s => s.inv?.mode === 'count' }, gesture: 'tap', allow: [], stockAllow: [], at: atWin },
    { id: 'g-count-keys', target: findKeySpot('6'), say: 'Tap 6.', until: { kind: 'state', test: s => s.inv?.mode === 'count' && s.inv.digits === '6' }, gesture: 'tap', allow: [], aim: keysAim('count', '6'), stockAllow: [], at: atWin },
    { id: 'g-count-apply', target: SPOT.invApply, say: 'Tap Set stock to 6. The stock is now exactly 6, whatever it was before. This is how you fix a number that is wrong, such as a negative one.', until: { kind: 'state', test: s => stockOf(s, STICKER) === 6 }, gesture: 'tap', allow: [], stockAllow: [STICKER], at: atWin },
    { id: 'g-clear', target: SPOT.invSearch, say: 'Clear the search box, so the whole list is back.', until: { kind: 'state', test: s => !!s.inv && s.inv.q.trim() === '' }, gesture: 'tap', allow: [], stockAllow: [], at },
    { id: 'g-layout', target: SPOT.invLayout, say: 'The chip says Flat, one row per variation. Tap it to nest each item\'s variations under it.', until: { kind: 'state', test: s => s.inv?.grouped === true }, gesture: 'tap', allow: [], stockAllow: [], at },
    { id: 'g-group', target: invGroupSpot(COW_P), say: 'The Highland Cow comes in two sizes. Tap it to open them. Each size has its own stock, and the total is on the cow\'s row.', until: { kind: 'state', test: s => !!s.inv?.expanded.includes(COW_P) }, gesture: 'tap', allow: [], stockAllow: [], at },
    { id: 'g-flat', target: SPOT.invLayout, say: 'Tap the chip again to go back to one row per item.', until: { kind: 'state', test: s => s.inv?.grouped === false }, gesture: 'tap', allow: [], stockAllow: [], at },
    { id: 'g-done', say: 'That is the whole screen. The list shows stock, the chips narrow it, and Receive, Adjust and Count change it. If a number looks wrong, count the shelf and use Count.', until: { kind: 'next' }, at },
  ],
  check1: [
    { id: 'show-low', title: 'Show only the items that are low on stock', until: { kind: 'state', test: s => s.inv?.stock === 'low' }, inject: [{ kind: 'stock', counts: { [KEY]: 0, [STICKER]: 2, [EGG]: -3 } }],
      ladder: ['Look under the search box.', 'A row of chips narrows the list by stock level.', 'Tap Low.'], reveal: invChipSpot('low'), gesture: 'tap', allow: [], stockAllow: [], at },
    { id: 'receive-keyrings', title: 'A delivery of 10 Keyrings has arrived. Add them to the stock', until: { kind: 'state', test: s => stockOf(s, KEY) === 15 }, inject: [{ kind: 'stock', counts: { [KEY]: 5 } }],
      ladder: ['Find the Keyring first. Search for it, or look through the list.', 'Open it and choose the job that adds stock that has arrived.', 'Open the Keyring, keep Receive, tap 1 and 0, then tap Apply.'], reveal: invRowSpot(KEY), via: invChipSpot('all'), gesture: 'tap', allow: [], stockAllow: [KEY], at: atWin },
    { id: 'count-dragons', title: 'You count 6 Red Dragons on the shelf, but the till says 8. Put the real number in', until: { kind: 'state', test: s => stockOf(s, DRAGON) === 6 }, inject: [{ kind: 'stock', counts: { [DRAGON]: 8 } }],
      ladder: ['The till is wrong, not the shelf.', 'One job replaces the number with what you counted.', 'Open the Red Dragon, choose Count, tap 6 and tap Set stock to 6.'], reveal: invRowSpot(DRAGON), via: invChipSpot('all'), gesture: 'tap', allow: [], stockAllow: [DRAGON], at: atWin },
  ],
  check2: [
    { id: 'negative-egg', title: 'The till shows the Dragon Egg below zero, but you count 6 on the shelf. Fix it', until: { kind: 'state', test: s => stockOf(s, EGG) === 6 }, inject: [{ kind: 'stock', counts: { [EGG]: -4 } }], taughtBy: 'g-count-apply',
      ladder: ['A red number means a count is wrong.', 'Do not add stock to cancel it out. Replace the number with what is on the shelf.', 'Open the Dragon Egg, choose Count, tap 6 and tap Set stock to 6.'], reveal: invRowSpot(EGG), via: invChipSpot('all'), gesture: 'tap', allow: [], stockAllow: [EGG], at: atWin },
    { id: 'broken-keyrings', title: 'Three Keyrings arrived smashed. Take them out of the stock and say why', until: { kind: 'state', test: s => stockOf(s, KEY) === 17 && s.inv?.reason === 'damaged' }, inject: [{ kind: 'stock', counts: { [KEY]: 20 } }], taughtBy: 'g-reason',
      ladder: ['They are not for sale, so the stock has to come down.', 'Adjust takes stock out, and it asks for a reason.', 'Open the Keyring, choose Adjust, set Remove, pick damaged, tap 3 and tap Apply.'], reveal: invRowSpot(KEY), via: invChipSpot('all'), gesture: 'tap', allow: [], stockAllow: [KEY], at: atWin,
      watch: [{ id: 'no-reason', when: s => stockOf(s, KEY) === 17 && s.inv?.reason !== 'damaged', say: 'The three are out, but the reason is not damaged. Tap Start again on the bar, then choose Adjust, Remove and damaged before you key 3.', how: ['Tap Start again on the bar.', 'Open the Keyring and choose Adjust, then Remove.', 'Pick damaged, tap 3 and tap Apply.'], taughtIn: 'inventory' }] },
    { id: 'nearly-gone', title: 'Find the Sticker Packs with the Low filter, then receive a delivery of 20', until: { kind: 'state', test: s => stockOf(s, STICKER) === 22 }, inject: [{ kind: 'stock', counts: { [STICKER]: 2 } }], taughtBy: 'g-low',
      ladder: ['Something is nearly gone, and a filter shows it fast.', 'Tap Low, then open the item that is left.', 'Open the Sticker Pack, keep Receive, tap 2 and 0, then tap Apply.'], reveal: invRowSpot(STICKER), via: invChipSpot('all'), gesture: 'tap', allow: [], stockAllow: [STICKER], at: atWin },
  ],
  recap: ['You can show only the items that are low, out or negative, and search by name, SKU or barcode.', 'You use Receive for stock that arrived, Adjust with a reason for damage or loss, and Count to set what is really on the shelf.', 'You know a red number means a count is wrong, and that Count fixes it.'],
};
