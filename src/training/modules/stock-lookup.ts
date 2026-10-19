// Location: src/training/modules/stock-lookup.ts
// "Price check and Stock check": use the grid tiles to scan or search an item and read its price, deals and stock.
// Practice data: training variants (BEE, EGG, KEY, STICKER, DRAGON, TAD, COW_S, COW_L) with known prices and stock.
// Nothing goes to Shopify: the Lookup sheet never touches the cart and in practice uses local data only.
import type { TrainingModule, TrainSnap } from '../../lib/trainingModule';
import { SPOT } from '../../lib/trainingSpots';

const BEE = 'train-v-bee';
const EGG = 'train-v-egg';
const KEY = 'train-v-key';
const STICKER = 'train-v-sticker';
const DRAGON = 'train-v-dragon';
const TAD = 'train-v-tad';
const COW_S = 'train-v-cow-s';
const COW_L = 'train-v-cow-l';

const at = { tabs: ['checkout'], routes: [], sheets: true };
const atWin = { tabs: ['checkout'], routes: [], sheets: true };

const stockOf = (s: TrainSnap, id: string): number | null | undefined => s.stock?.[id];

const trainingStock: Record<string, number | null> = {
  [BEE]: 800,
  [EGG]: 600,
  [KEY]: 500,
  [STICKER]: 300,
  [DRAGON]: 2500,
  [TAD]: 400,
  [COW_S]: 1200,
  [COW_L]: 1800,
};

export const stockLookupModule: TrainingModule = {
  id: 'stock-lookup',
  title: 'Price check and Stock check',
  summary: 'Use the grid tiles to scan or search an item and read its price, deals and stock without touching the cart.',
  minutes: 7,
  suggestedFirst: false,
  flow: 'standard',
  card: 'auto',
  practiceStaff: false,
  stock: trainingStock,
  tabs: ['checkout'],
  routes: [],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      {
        id: 'overview',
        nodes: [
          { id: 'in-title', kind: 'text', x: 40, y: 18, w: 560, h: 34, label: 'Price check and Stock check', size: 22, align: 'center' },
          { id: 'in-sub', kind: 'text', x: 60, y: 54, w: 520, h: 60, label: 'Two tiles on the grid let you look up items without adding them to the cart. Price check shows the price and deals. Stock check shows stock across all variations.', size: 13, align: 'center', hidden: true },
          { id: 'c-price', kind: 'panel', x: 40, y: 120, w: 270, h: 110, label: 'PRICE CHECK', hidden: true },
          { id: 'i-price', kind: 'icon', x: 52, y: 148, w: 44, h: 44, icon: 'pricetag-outline', tone: 'accent', size: 34, hidden: true },
          { id: 't-price', kind: 'text', x: 104, y: 140, w: 198, h: 78, label: 'Tap Price check', sub: 'Scan or search. See the price, any deals, and the stock line.', size: 13, hidden: true },
          { id: 'c-stock', kind: 'panel', x: 330, y: 120, w: 270, h: 110, label: 'STOCK CHECK', hidden: true },
          { id: 'i-stock', kind: 'icon', x: 342, y: 148, w: 44, h: 44, icon: 'layers-outline', tone: 'accent', size: 34, hidden: true },
          { id: 't-stock', kind: 'text', x: 394, y: 140, w: 198, h: 78, label: 'Tap Stock check', sub: 'Scan or search. See stock for this variation, other variations, and the total.', size: 13, hidden: true },
          { id: 'c-words', kind: 'panel', x: 40, y: 250, w: 560, h: 110, label: 'THE STOCK WORDS', hidden: true },
          { id: 't-words', kind: 'text', x: 60, y: 278, w: 520, h: 66, label: 'In stock (positive number) | Out of stock (zero) | Not tracked (no number) | Oversold (negative, shown like 5 oversold)', size: 13, align: 'center', hidden: true },
        ],
      },
    ],
    steps: [
      { id: 'what', say: 'Two tiles on the grid let you look up items without adding them to the cart.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub' },
      { id: 'price', say: 'Price check: scan or search an item. The result shows the price, any deals that apply, and the stock line like "800 in stock".', set: { 'c-price': { hidden: false }, 'i-price': { hidden: false }, 't-price': { hidden: false } }, focus: 't-price' },
      { id: 'stock', say: 'Stock check: scan or search an item. The result shows stock for this variation, lists the other variations of the same product, and the total at the bottom.', set: { 'c-stock': { hidden: false }, 'i-stock': { hidden: false }, 't-stock': { hidden: false } }, focus: 't-stock' },
      { id: 'words', say: 'The stock line uses four words: "In stock" for a positive number, "Out of stock" for zero, "Not tracked" when stock is not tracked, and "Oversold" for a negative number, shown without the minus sign, so -5 reads "5 oversold".', set: { 'c-words': { hidden: false }, 't-words': { hidden: false } }, focus: 't-words' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      {
        id: 'checkout',
        nodes: [
          { id: 'bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Checkout', sub: 'Practice data' },
          { id: 'grid', kind: 'panel', x: 20, y: 56, w: 600, h: 290, label: 'GRID' },
          { id: 'price-tile', kind: 'tile', x: 60, y: 80, w: 240, h: 100, label: 'Price check', icon: 'pricetag-outline' },
          { id: 'stock-tile', kind: 'tile', x: 340, y: 80, w: 240, h: 100, label: 'Stock check', icon: 'layers-outline' },
          { id: 'dock', kind: 'panel', x: 0, y: 366, w: 640, h: 34 },
          { id: 'dock-say', kind: 'text', x: 14, y: 370, w: 612, h: 26, label: 'Tap Price check or Stock check.', size: 13 },
        ],
      },
      {
        id: 'lookup-price',
        nodes: [
          { id: 'bar2', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Price check', sub: 'Practice data' },
          { id: 'search', kind: 'field', x: 40, y: 60, w: 560, h: 44, label: 'Search', value: 'Or search by name, SKU or barcode' },
          { id: 'scan-btn', kind: 'button', x: 40, y: 116, w: 260, h: 44, label: 'Scan with camera', icon: 'barcode-outline' },
          { id: 'clear-btn', kind: 'button', x: 340, y: 116, w: 260, h: 44, label: 'Clear', hidden: true },
          { id: 'result-card', kind: 'panel', x: 40, y: 180, w: 560, h: 160, label: 'Bee keyring', hidden: true },
          { id: 'result-price', kind: 'text', x: 60, y: 220, w: 200, h: 50, label: '$8.00', size: 34, hidden: true },
          { id: 'result-deal', kind: 'row', x: 60, y: 260, w: 520, h: 24, label: 'Buy 3 Keyrings, get 20% off', icon: 'pricetag-outline', hidden: true },
          { id: 'result-stock', kind: 'text', x: 60, y: 300, w: 520, h: 24, label: '800 in stock', size: 13, tone: 'good', hidden: true },
        ],
      },
      {
        id: 'lookup-stock',
        nodes: [
          { id: 'bar3', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Stock check', sub: 'Practice data' },
          { id: 'search2', kind: 'field', x: 40, y: 60, w: 560, h: 44, label: 'Search', value: 'Or search by name, SKU or barcode' },
          { id: 'scan-btn2', kind: 'button', x: 40, y: 116, w: 260, h: 44, label: 'Scan with camera', icon: 'barcode-outline' },
          { id: 'clear-btn2', kind: 'button', x: 340, y: 116, w: 260, h: 44, label: 'Clear', hidden: true },
          { id: 'result-card2', kind: 'panel', x: 40, y: 180, w: 560, h: 160, label: 'Bee keyring', hidden: true },
          { id: 'result-stock2', kind: 'text', x: 60, y: 220, w: 200, h: 40, label: '800 in stock', size: 22, hidden: true },
          { id: 'other-var', kind: 'text', x: 60, y: 270, w: 520, h: 24, label: 'Other variations (2)', size: 13, hidden: true },
          { id: 'total-line', kind: 'text', x: 60, y: 330, w: 520, h: 24, label: '800 in stock across all 3 variations.', size: 13, hidden: true },
        ],
      },
    ],
    steps: [
      { id: 's1', say: 'Open Price check and tap Scan with camera. Scan the Bee keyring.', tap: 'price-tile', focus: 'price-tile', screen: 'checkout' },
      { id: 's2', say: 'The sheet opens. The result shows the Bee keyring at $8.00, a deal badge for the 20% off Keyrings deal, and "800 in stock".', screen: 'lookup-price', set: { 'clear-btn': { hidden: false }, 'result-card': { hidden: false }, 'result-price': { hidden: false }, 'result-deal': { hidden: false }, 'result-stock': { hidden: false } }, focus: 'result-stock' },
      { id: 's3', say: 'Tap Clear, then open Stock check and scan the Bee keyring again.', tap: 'clear-btn', screen: 'checkout' },
      { id: 's4', say: 'Open Stock check from the grid.', tap: 'stock-tile', focus: 'stock-tile', screen: 'checkout' },
      { id: 's5', say: 'The Stock check result shows "800 in stock" for this variation, the other variations of the Bee product, and the total at the bottom.', screen: 'lookup-stock', set: { 'clear-btn2': { hidden: false }, 'result-card2': { hidden: false }, 'result-stock2': { hidden: false }, 'other-var': { hidden: false }, 'total-line': { hidden: false } }, focus: 'total-line' },
    ],
  },
  guide: [
    {
      id: 'g1',
      say: 'Open Price check and search for "dragon". Tap the Dragon figurine. Read the price and the deal badge.',
      target: 'grid.action:price_check',
      until: { kind: 'visible', id: SPOT.lookupSearch },
      allow: [],
      at: { ...atWin },
    },
    {
      id: 'g2',
      say: 'The price is $25.00 and it shows "2500 in stock". No deal badge appears because the 20% off Keyrings deal only applies to Keyrings.',
      until: { kind: 'state', test: (s) => s.lookupMode === 'price' && s.lookupResult?.variantId === DRAGON },
      allow: [],
      at: { ...atWin },
    },
    {
      id: 'g3',
      say: 'Tap Clear, open Stock check, and scan the Keyring (KEY). Read the stock line and the other variations.',
      target: SPOT.lookupClear,
      until: { kind: 'press', id: 'grid.action:stock_check' },
      allow: [],
      at: { ...atWin },
    },
    {
      id: 'g4',
      say: 'Stock check shows "500 in stock" for the Keyring, lists the other variations of the Keyring product, and shows the total at the bottom.',
      until: { kind: 'state', test: (s) => s.lookupMode === 'stock' && s.lookupResult?.variantId === KEY },
      allow: [],
      at: { ...atWin },
    },
  ],
  check1: [
    {
      id: 'c1',
      title: 'Price check Egg timer',
      until: { kind: 'state', test: (s) => s.lookupMode === 'price' && s.lookupResult?.variantId === EGG },
      ladder: [
        'Open Price check from the grid.',
        'Scan the Egg timer or search for "egg".',
        'Read the price line and the stock line.',
      ],
      reveal: SPOT.lookupSearch,
      allow: [],
      at: { ...atWin },
      inject: [],
    },
    {
      id: 'c2',
      title: 'Stock check Sticker pack',
      until: { kind: 'state', test: (s) => s.lookupMode === 'stock' && s.lookupResult?.variantId === STICKER },
      ladder: [
        'Open Stock check from the grid.',
        'Scan the Sticker pack or search for "sticker".',
        'Read the stock line and the other variations.',
      ],
      reveal: SPOT.lookupSearch,
      allow: [],
      at: { ...atWin },
      inject: [],
    },
  ],
  check2: [
    {
      id: 'c3',
      title: 'Price check Cow small - no deal',
      until: { kind: 'state', test: (s) => s.lookupMode === 'price' && s.lookupResult?.variantId === COW_S },
      ladder: [
        'Open Price check from the grid.',
        'Search for "cow" and tap Small cow plush.',
        'Look for a deal badge - there should not be one.',
        'The 20% off deal only applies to Keyrings.',
      ],
      reveal: SPOT.lookupSearch,
      allow: [],
      at: { ...atWin },
      inject: [],
      taughtBy: 's2',
    },
    {
      id: 'c4',
      title: 'Stock check Cow large - variations total',
      until: { kind: 'state', test: (s) => s.lookupMode === 'stock' && s.lookupResult?.variantId === COW_L },
      ladder: [
        'Open Stock check from the grid.',
        'Scan the Large cow plush or search for "cow".',
        'Count the other variations listed.',
        'Read the total stock line at the bottom.',
      ],
      reveal: SPOT.lookupSearch,
      allow: [],
      at: { ...atWin },
      inject: [],
      taughtBy: 's5',
    },
    {
      id: 'c5',
      title: 'Stock words meaning',
      until: { kind: 'state', test: (s) => s.lookupMode === 'price' && s.lookupResult?.variantId === TAD },
      ladder: [
        'Open Price check from the grid.',
        'Scan the Tadpole toy or search for "tad".',
        'Read the stock line. This one has gone negative, so it says "5 oversold".',
        'Remember the four stock words and their meanings.',
      ],
      reveal: SPOT.lookupSearch,
      allow: [],
      at: { ...atWin },
      inject: [{ kind: 'stock', counts: { [TAD]: -5 } }],
      taughtBy: 'what',
    },
  ],
  recap: [
    'You can use Price check to read prices and deals without adding items to the cart.',
    'You can use Stock check to see stock across all variations of a product.',
    'The stock words are: In stock, Out of stock, Not tracked, and Oversold.',
    'Both tools work by scanning or searching and never touch the cart.',
  ],
};