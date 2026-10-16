// Location: src/training/modules/items.ts
// "Items and creating one": the catalogue the till sells from. Find an item, change its price and identifiers, and
// create a new tracked product. Practice data only: in practice an item is made or changed on this iPad and nothing
// goes to Shopify.
import type { TrainingModule, TrainSnap } from '../../lib/trainingModule';
import { SPOT, itemsRowSpot } from '../../lib/trainingSpots';

const BEE = 'train-v-bee'; const COW = 'train-v-cow-s'; const PRINT = 'train-v-print';
const cents = (t: string): number | undefined => { const n = Number(t.replace(/[^0-9.]/g, '')); return n > 0 ? Math.round(n * 100) : undefined; };
const itemOf = (s: TrainSnap, id: string) => (s.items ?? []).find(i => i.id === id);
const priceOf = (s: TrainSnap, id: string): number | undefined => itemOf(s, id)?.priceCents;
const skuOf = (s: TrainSnap, id: string): string | undefined => itemOf(s, id)?.sku;
const barcodeOf = (s: TrainSnap, id: string): string | undefined => itemOf(s, id)?.barcode;
/** An item made during this run (practice variants are train-v-*, so a new item is anything else). */
const isNew = (id?: string): boolean => !!id && id.startsWith('train-v-new-');
/** An item made during this run that is tracked, so the till will count it down. */
const newTracked = (s: TrainSnap): boolean => (s.items ?? []).some(i => isNew(i.id) && i.tracked);
/** The Edit page is open on this item. */
const editing = (s: TrainSnap, id: string): boolean => s.itemDraft?.mode === 'edit' && s.itemDraft.id === id;
/** The price box on the Edit page for this item holds this value. */
const typingPrice = (s: TrainSnap, id: string, want: number): boolean => editing(s, id) && cents(s.itemDraft?.price ?? '') === want;

const list = { tabs: ['checkout', 'more'], routes: ['items', 'createItem', 'editItem'], sheets: false };

export const items: TrainingModule = {
  id: 'items',
  title: 'Items and creating one',
  summary: 'Use the Items page: find an item, change its price and its SKU or barcode, and create a new tracked product. Practice data only, nothing goes to Shopify.',
  minutes: 8,
  flow: 'standard',
  card: 'auto',
  tabs: ['checkout', 'more'],
  routes: ['items', 'createItem', 'editItem'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      {
        id: 'overview',
        nodes: [
          { id: 'in-title', kind: 'text', x: 40, y: 14, w: 560, h: 34, label: 'Items and creating one', size: 22, align: 'center', hidden: true },
          { id: 'in-sub', kind: 'text', x: 60, y: 52, w: 520, h: 54, label: 'The Items page is the catalogue the till sells from. Everything it rings up starts here.', size: 13, align: 'center', hidden: true },
          { id: 'c-find', kind: 'panel', x: 40, y: 116, w: 270, h: 132, label: 'FIND ONE', hidden: true },
          { id: 'i-find', kind: 'icon', x: 52, y: 142, w: 44, h: 44, icon: 'search', tone: 'accent', size: 34, hidden: true },
          { id: 't-find', kind: 'text', x: 104, y: 138, w: 198, h: 106, label: 'Search', sub: 'The search box takes a name, a SKU or a barcode.', size: 13, hidden: true },
          { id: 'c-edit', kind: 'panel', x: 330, y: 116, w: 270, h: 132, label: 'CHANGE ONE', hidden: true },
          { id: 'i-edit', kind: 'icon', x: 342, y: 142, w: 44, h: 44, icon: 'create', tone: 'accent', size: 34, hidden: true },
          { id: 't-edit', kind: 'text', x: 394, y: 138, w: 198, h: 106, label: 'Open and edit', sub: 'Tap a row to change the price, SKU, barcode or cost, then save.', size: 13, hidden: true },
          { id: 'c-new', kind: 'panel', x: 40, y: 264, w: 560, h: 110, label: 'ADD ONE', hidden: true },
          { id: 't-new', kind: 'text', x: 60, y: 292, w: 520, h: 66, label: 'Create item starts a blank product. A name and a price are enough; a starting stock makes it tracked.', size: 13, align: 'center', hidden: true },
        ],
      },
    ],
    steps: [
      { id: 'what', say: 'The Items page is the catalogue the till sells from. It is under More, then Items.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub' },
      { id: 'find', say: 'The search box takes a name, a SKU or a barcode, so you find the right product before you change anything.', set: { 'c-find': { hidden: false }, 'i-find': { hidden: false }, 't-find': { hidden: false } }, focus: 't-find' },
      { id: 'edit', say: 'Open a row to change its price, SKU, barcode or cost. Save sends the change to Shopify.', set: { 'c-edit': { hidden: false }, 'i-edit': { hidden: false }, 't-edit': { hidden: false } }, focus: 't-edit' },
      { id: 'new', say: 'Create item makes a new product. A name and a price are enough, and a starting stock makes it a tracked product.', set: { 'c-new': { hidden: false }, 't-new': { hidden: false } }, focus: 't-new' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      {
        id: 'list',
        nodes: [
          { id: 'l-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Items', sub: 'Practice data' },
          { id: 'l-search', kind: 'field', x: 20, y: 52, w: 460, h: 36, label: 'Search', value: '' },
          { id: 'l-new', kind: 'button', x: 496, y: 52, w: 124, h: 36, label: 'Create item' },
          { id: 'l-bee', kind: 'row', x: 20, y: 100, w: 600, h: 48, label: 'Bumble Bee', sub: 'TR-BEE' },
          { id: 'l-cow', kind: 'row', x: 20, y: 152, w: 600, h: 48, label: 'Highland Cow', sub: 'Small · TR-COW-S' },
          { id: 'l-dragon', kind: 'row', x: 20, y: 204, w: 600, h: 48, label: 'Red Dragon', sub: 'TR-DRG' },
          { id: 'l-note', kind: 'text', x: 20, y: 264, w: 600, h: 64, label: 'Tap a row to open that item. Rows show the SKU and the price the till charges.', size: 13, hidden: true },
        ],
      },
      {
        id: 'edit',
        nodes: [
          { id: 'e-panel', kind: 'panel', x: 60, y: 16, w: 520, h: 368, label: 'HIGHLAND COW' },
          { id: 'e-sub', kind: 'text', x: 80, y: 52, w: 480, h: 22, label: 'Small · TR-COW-S', size: 13 },
          { id: 'e-price', kind: 'field', x: 80, y: 84, w: 480, h: 40, label: 'Price', value: '12.00' },
          { id: 'e-sku', kind: 'field', x: 80, y: 132, w: 480, h: 40, label: 'SKU', value: 'TR-COW-S' },
          { id: 'e-barcode', kind: 'field', x: 80, y: 180, w: 480, h: 40, label: 'Barcode', value: '' },
          { id: 'e-cost', kind: 'field', x: 80, y: 228, w: 480, h: 40, label: 'Cost', value: '' },
          { id: 'e-save', kind: 'button', x: 80, y: 286, w: 480, h: 40, label: 'Save to Shopify' },
          { id: 'e-note', kind: 'text', x: 80, y: 336, w: 480, h: 44, label: 'Change what is wrong, then save. The change goes to Shopify.', size: 12, hidden: true },
        ],
      },
      {
        id: 'create',
        nodes: [
          { id: 'n-panel', kind: 'panel', x: 60, y: 16, w: 520, h: 368, label: 'NEW ITEM' },
          { id: 'n-title', kind: 'field', x: 80, y: 56, w: 480, h: 40, label: 'Name', value: '' },
          { id: 'n-price', kind: 'field', x: 80, y: 104, w: 480, h: 40, label: 'Price', value: '' },
          { id: 'n-sku', kind: 'field', x: 80, y: 152, w: 480, h: 40, label: 'SKU', value: '' },
          { id: 'n-barcode', kind: 'field', x: 80, y: 200, w: 480, h: 40, label: 'Barcode', value: '' },
          { id: 'n-stock', kind: 'field', x: 80, y: 248, w: 480, h: 40, label: 'Starting stock', value: '' },
          { id: 'n-create', kind: 'button', x: 80, y: 304, w: 480, h: 40, label: 'Create item' },
          { id: 'n-note', kind: 'text', x: 80, y: 352, w: 480, h: 32, label: 'Starting stock makes it tracked.', size: 12, hidden: true },
        ],
      },
    ],
    steps: [
      { id: 'list', title: 'The Items page', say: 'Under More, then Items. This is the catalogue the till sells from.', focus: 'l-new' },
      { id: 'search', title: 'Find one', say: 'The search box takes a name, a SKU or a barcode.', tap: 'l-search', set: { 'l-search': { value: 'cow' }, 'l-bee': { hidden: true }, 'l-dragon': { hidden: true }, 'l-note': { hidden: false } }, focus: 'l-search' },
      { id: 'open', title: 'Open an item', say: 'Tap a row to open that item.', tap: 'l-cow', screen: 'edit', set: { 'e-note': { hidden: false } }, focus: 'e-panel' },
      { id: 'price', title: 'Change the price', say: 'Type the new price. The old one is still shown until you save.', set: { 'e-price': { value: '14.00' } }, focus: 'e-price' },
      { id: 'save', title: 'Save', say: 'Save sends the change to Shopify, then you are back on the list.', tap: 'e-save', screen: 'list', set: { 'l-search': { value: '' }, 'l-bee': { hidden: false }, 'l-dragon': { hidden: false }, 'l-cow': { sub: 'Small · TR-COW-S · $14.00' } }, focus: 'l-new' },
      { id: 'new', title: 'Add an item', say: 'Create item opens a blank product.', tap: 'l-new', screen: 'create', set: { 'n-note': { hidden: false } }, focus: 'n-panel' },
      { id: 'fill', title: 'What to type', say: 'A name and a price. A starting stock makes it a tracked product the till counts down.', set: { 'n-title': { value: 'Practice print' }, 'n-price': { value: '15.00' }, 'n-stock': { value: '3' } }, focus: 'n-title' },
      { id: 'done', title: 'Made', say: 'Create item adds it to the list, ready to sell.', focus: 'n-create' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will find an item, fix its price, and create a new tracked product. Nothing here touches Shopify.', until: { kind: 'next' }, at: list },
    { id: 'g-more', target: SPOT.tabMore, say: 'Open More at the bottom of the screen. Items sits near the top.', until: { kind: 'state', test: s => s.tab === 'more' }, gesture: 'tap', allow: [], at: list, recover: { say: 'Tap More at the bottom of the screen.', target: SPOT.tabCheckout } },
    { id: 'g-items', target: SPOT.moreItems, say: 'Tap Items to open the catalogue.', until: { kind: 'state', test: s => s.route === 'items' }, gesture: 'tap', allow: [], at: list, recover: { say: 'Tap More, then Items.', target: SPOT.tabMore } },
    { id: 'g-open', target: itemsRowSpot(BEE), say: 'Bumble Bee is on the list. Tap its row to open it.', until: { kind: 'state', test: s => editing(s, BEE) }, gesture: 'tap', allow: [], at: list, recover: { say: 'Search for Bumble Bee on the Items page and tap its row.', target: SPOT.itemsSearch } },
    { id: 'g-price', target: SPOT.itemsEditForm, say: 'Type 9.00 in the price box.', until: { kind: 'next' }, typing: true, ready: s => typingPrice(s, BEE, 900), at: list },
    { id: 'g-save', target: SPOT.itemsEditSave, say: 'Tap Save to Shopify. The item keeps its new price.', until: { kind: 'state', test: s => priceOf(s, BEE) === 900 }, gesture: 'tap', allow: [], at: list, recover: { say: 'Open Bumble Bee and tap Save to Shopify.', target: itemsRowSpot(BEE) } },
    { id: 'g-new', target: SPOT.itemsNew, say: 'Now make one. Tap Create item.', until: { kind: 'state', test: s => s.route === 'createItem' }, gesture: 'tap', allow: [], at: list, recover: { say: 'On the Items page, tap Create item at the top right.', target: SPOT.itemsSearch } },
    { id: 'g-create', target: SPOT.itemsForm, say: 'Type a name, a price, and a starting stock so it is tracked.', until: { kind: 'next' }, typing: true, ready: s => s.itemDraft?.mode === 'create' && !!s.itemDraft.title.trim() && cents(s.itemDraft.price) !== undefined && !!s.itemDraft.stock.trim(), at: list },
    { id: 'g-create-save', target: SPOT.itemsCreate, say: 'Tap Create item. It joins the list, ready to sell.', until: { kind: 'state', test: newTracked }, gesture: 'tap', allow: [], at: list, recover: { say: 'Fill the form, then tap Create item.', target: SPOT.itemsForm } },
    { id: 'g-done', say: 'That is finding an item, fixing it, and making a new tracked product.', until: { kind: 'next' }, at: list },
  ],
  check1: [
    {
      id: 'c1-sku', title: 'The Highland Cow Small has the wrong SKU. Set it to TR-COW-S2', until: { kind: 'state', test: s => skuOf(s, COW) === 'TR-COW-S2' }, reveal: SPOT.itemsEditSave, via: itemsRowSpot(COW), gesture: 'tap', allow: [], at: list,
      ladder: ['The item is on the Items page, under More.', 'Search for Highland Cow and open its row.', 'Type the new SKU, then tap Save to Shopify.'],
    },
    {
      id: 'c1-new', title: 'A new line has just arrived. Add it as a tracked product', until: { kind: 'state', test: newTracked }, reveal: SPOT.itemsCreate, via: SPOT.itemsNew, gesture: 'tap', allow: [], at: list,
      ladder: ['A new item is made on the Items page.', 'Tap Create item at the top right.', 'Type a name, a price and a starting stock, then tap Create item.'],
    },
  ],
  check2: [
    {
      id: 'c2-fix', title: 'The Clearance Print has a barcode that will not scan. Set it to TR-PRT-1', until: { kind: 'state', test: s => barcodeOf(s, PRINT) === 'TR-PRT-1' }, inject: [{ kind: 'items', set: [{ id: PRINT, barcode: '404404' }] }], reveal: SPOT.itemsEditSave, via: itemsRowSpot(PRINT), gesture: 'tap', allow: [], at: list, taughtBy: 'g-save',
      ladder: ['Something on the catalogue is wrong: the barcode will not scan.', 'Open the Clearance Print row on the Items page.', 'Type TR-PRT-1 in the barcode box, then tap Save to Shopify.'],
    },
    {
      id: 'c2-new', title: 'The shop has a new tracked product to sell. Add it', until: { kind: 'state', test: newTracked }, reveal: SPOT.itemsCreate, via: SPOT.itemsNew, gesture: 'tap', allow: [], at: list,
      ladder: ['A new item is made on the Items page.', 'Tap Create item.', 'Type a name, a price and a starting stock, then tap Create item.'],
    },
  ],
  recap: [
    'The Items page is under More, then Items: the catalogue the till sells from.',
    'Tap a row to change its price, SKU, barcode or cost, then Save to Shopify.',
    'Create item makes a new product; a starting stock makes it tracked.',
    'In practice every change stays on this iPad. Nothing goes to Shopify.',
  ],
};
