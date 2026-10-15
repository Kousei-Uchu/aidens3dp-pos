// Location: src/training/modules/orders.ts
// "Find a past sale": navigate the Orders screen, switch tabs, open an order, mark fulfilled, and print a receipt.
// Practice data: three made-up orders in src/lib/trainingOrders.ts (open, unfulfilled, completed). Nothing reaches Shopify.
import type { TrainingModule, TrainSnap } from '../../lib/trainingModule';
import { SPOT, orderRowSpot } from '../../lib/trainingSpots';
import { PRACTICE_ORDER_CARD, PRACTICE_ORDER_CASH, PRACTICE_ORDER_CARD2 } from '../../lib/trainingOrders';

const at = { tabs: ['more'], routes: ['orders'], sheets: true };
const atWin = { tabs: ['more'], routes: ['orders'], sheets: true };
const atPage = { tabs: ['more'], routes: ['orders'], sheets: false };

export const ordersModule: TrainingModule = {
  id: 'orders',
  title: 'Find a past sale',
  summary: 'Open the Orders screen, switch between Open, Unfulfilled and Completed, view an order, mark it fulfilled, and print a receipt.',
  minutes: 6,
  suggestedFirst: false,
  flow: 'standard',
  card: 'auto',
  practiceStaff: false,
  tabs: ['more'],
  routes: ['orders'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      {
        id: 'overview',
        nodes: [
          { id: 'in-title', kind: 'text', x: 40, y: 18, w: 560, h: 34, label: 'Find a past sale', size: 22, align: 'center' },
          { id: 'in-sub', kind: 'text', x: 60, y: 54, w: 520, h: 60, label: 'Orders lives under the More tab. It shows every sale with three tabs: Open, Unfulfilled and Completed. Tap an order to mark it fulfilled or print a receipt.', size: 13, align: 'center', hidden: true },
          { id: 'c-tabs', kind: 'panel', x: 40, y: 120, w: 270, h: 110, label: 'THE THREE TABS', hidden: true },
          { id: 'i-tabs', kind: 'icon', x: 52, y: 148, w: 44, h: 44, icon: 'list-outline', tone: 'accent', size: 34, hidden: true },
          { id: 't-tabs', kind: 'text', x: 104, y: 140, w: 198, h: 78, label: 'Open, Unfulfilled, Completed', sub: 'Switch tabs to find the sale you need.', size: 13, hidden: true },
          { id: 'c-order', kind: 'panel', x: 330, y: 120, w: 270, h: 110, label: 'ORDER DETAILS', hidden: true },
          { id: 'i-order', kind: 'icon', x: 342, y: 148, w: 44, h: 44, icon: 'file-tray-outline', tone: 'accent', size: 34, hidden: true },
          { id: 't-order', kind: 'text', x: 394, y: 140, w: 198, h: 78, label: 'Tap any order', sub: 'See the lines, mark fulfilled, or print a receipt.', size: 13, hidden: true },
          { id: 'c-vs', kind: 'panel', x: 40, y: 250, w: 560, h: 110, label: 'ORDERS VS TRANSACTIONS', hidden: true },
          { id: 't-vs', kind: 'text', x: 60, y: 278, w: 520, h: 66, label: 'Orders = sales you can act on (mark fulfilled, refund, receipt). Transactions = a read-only log of every payment.', size: 13, align: 'center', hidden: true },
        ],
      },
    ],
    steps: [
      { id: 'what', say: 'Orders is where you find a past sale to mark it fulfilled or print a receipt.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub' },
      { id: 'tabs', say: 'Three tabs filter the list: Open (everything still open), Unfulfilled (needs fulfilment), and Completed (already fulfilled).', set: { 'c-tabs': { hidden: false }, 'i-tabs': { hidden: false }, 't-tabs': { hidden: false } }, focus: 't-tabs' },
      { id: 'order', say: 'Tap an order to open its window. You see every line, the total, and buttons for Mark fulfilled, Refund or return, and Receipt.', set: { 'c-order': { hidden: false }, 'i-order': { hidden: false }, 't-order': { hidden: false } }, focus: 't-order' },
      { id: 'vs', say: 'Orders is for acting on a sale. Transactions (also under More) is a read-only log of every payment for reconciliation.', set: { 'c-vs': { hidden: false }, 't-vs': { hidden: false } }, focus: 't-vs' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      {
        id: 'orders-page',
        nodes: [
          { id: 'bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Orders', sub: 'Practice data' },
          { id: 'tabs', kind: 'panel', x: 20, y: 56, w: 600, h: 50, label: 'Open | Unfulfilled | Completed' },
          { id: 'tab-unfulfilled', kind: 'button', x: 240, y: 62, w: 160, h: 38, label: 'Unfulfilled' },
          { id: 'tab-completed', kind: 'button', x: 420, y: 62, w: 160, h: 38, label: 'Completed' },
          { id: 'list', kind: 'panel', x: 20, y: 120, w: 600, h: 240, label: 'ORDER LIST' },
          { id: 'row-1', kind: 'row', x: 40, y: 140, w: 560, h: 60, label: '#1001 · Alex', sub: 'Today · paid · unfulfilled · $25.00' },
          { id: 'row-2', kind: 'row', x: 40, y: 210, w: 560, h: 60, label: '#1002 · Sam', sub: 'Yesterday · paid · fulfilled · $14.00' },
          { id: 'row-3', kind: 'row', x: 40, y: 280, w: 560, h: 60, label: '#1003 · Priya', sub: 'Last week · refunded · completed · $8.00' },
        ],
      },
      {
        id: 'order-window',
        nodes: [
          { id: 'bar2', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: '#1001', sub: 'Practice data' },
          { id: 'lines', kind: 'panel', x: 20, y: 56, w: 600, h: 180, label: 'LINES' },
          { id: 'line-1', kind: 'text', x: 40, y: 80, w: 520, h: 24, label: '2 × Dragon Egg - $12.00', size: 13 },
          { id: 'line-2', kind: 'text', x: 40, y: 110, w: 520, h: 24, label: '1 × Keyring - $5.00', size: 13 },
          { id: 'line-3', kind: 'text', x: 40, y: 140, w: 520, h: 24, label: 'Total: $17.00', size: 13 },
          { id: 'buttons', kind: 'panel', x: 20, y: 250, w: 600, h: 100, label: 'ACTIONS' },
          { id: 'fulfill-btn', kind: 'button', x: 40, y: 270, w: 260, h: 44, label: 'Mark fulfilled' },
          { id: 'refund-btn', kind: 'button', x: 340, y: 270, w: 260, h: 44, label: 'Refund or return' },
          { id: 'receipt-btn', kind: 'button', x: 40, y: 324, w: 260, h: 44, label: 'Receipt' },
        ],
      },
    ],
    steps: [
      { id: 's1', say: 'Open More and tap Orders. The list shows three tabs at the top: Open, Unfulfilled, Completed.', screen: 'orders-page', focus: 'tabs' },
      { id: 's2', say: 'Tap the Unfulfilled tab. Only orders that need fulfilment show.', tap: 'tab-unfulfilled', screen: 'orders-page', focus: 'row-1' },
      { id: 's3', say: 'Tap the first order (#1001). The window opens showing the lines and three buttons.', tap: 'row-1', screen: 'order-window', focus: 'line-1' },
      { id: 's4', say: 'The window shows the lines, Mark fulfilled, Refund or return, and Receipt.', screen: 'order-window', focus: 'fulfill-btn' },
      { id: 's5', say: 'Tap Mark fulfilled. The order is now fulfilled and moves to the Completed tab.', tap: 'fulfill-btn', screen: 'orders-page' },
      { id: 's6', say: 'Tap the Completed tab. The order you just fulfilled is now there.', tap: 'tab-completed', screen: 'orders-page', focus: 'row-2' },
      { id: 's7', say: 'Open an order and tap Receipt. You can print or email a copy.', tap: 'row-2', screen: 'order-window', focus: 'receipt-btn' },
      { id: 's8', say: 'The Receipt window opens. Tap No receipt to close it.', tap: 'receipt-btn', screen: 'order-window' },
    ],
  },
  guide: [
    {
      id: 'g1',
      say: 'Open More and tap Orders. You start on the Open tab.',
      target: SPOT.moreOrders,
      until: { kind: 'state', test: (s) => s.tab === 'more' && s.route === 'orders' },
      allow: [],
      gesture: 'tap',
      at: atPage,
    },
    {
      id: 'g2',
      say: 'Tap the Unfulfilled tab. The list now shows only orders that need fulfilment.',
      target: SPOT.ordersTabUnfulfilled,
      until: { kind: 'press', id: SPOT.ordersTabUnfulfilled },
      at: atPage,
    },
    {
      id: 'g3',
      say: 'Tap the first order in the list (#1001). The order window opens.',
      target: orderRowSpot(PRACTICE_ORDER_CARD),
      until: { kind: 'visible', id: SPOT.sheetClose },
      at: atWin,
    },
    {
      id: 'g4',
      say: 'Tap Mark fulfilled. The order is now fulfilled and moves to the Completed tab.',
      target: SPOT.ordersMarkFulfilled,
      until: { kind: 'press', id: SPOT.ordersMarkFulfilled },
      at: atWin,
    },
    {
      id: 'g5',
      say: 'Tap the Completed tab. The order you just fulfilled is now there.',
      target: SPOT.ordersTabCompleted,
      until: { kind: 'press', id: SPOT.ordersTabCompleted },
      at: atPage,
    },
    {
      id: 'g6',
      say: 'Open an order and tap Receipt. You can print or email a copy.',
      target: orderRowSpot(PRACTICE_ORDER_CASH),
      until: { kind: 'visible', id: SPOT.sheetClose },
      at: atWin,
    },
    {
      id: 'g7',
      say: 'The Receipt window opens. Tap No receipt to close it.',
      target: SPOT.ordersReceipt,
      until: { kind: 'press', id: SPOT.ordersReceipt },
      at: atWin,
    },
  ],
  check1: [
    {
      id: 'c1',
      title: 'Switch to Unfulfilled and open an order',
      until: { kind: 'state', test: (s) => s.tab === 'more' && s.route === 'orders' && s.sheets >= 1 },
      ladder: [
        'Open More and tap Orders.',
        'Tap the Unfulfilled tab at the top.',
        'Tap the first order in the list.',
      ],
      reveal: SPOT.ordersTabUnfulfilled,
      via: SPOT.moreOrders,
      allow: [],
      at: { ...atWin },
      inject: [],
    },
    {
      id: 'c2',
      title: 'Mark an order fulfilled',
      until: { kind: 'state', test: (s) => s.sheets === 0 },
      ladder: [
        'Open the order window.',
        'Tap Mark fulfilled.',
        'The window closes and the order moves to Completed.',
      ],
      reveal: SPOT.ordersMarkFulfilled,
      allow: [],
      at: { ...atWin },
      inject: [],
    },
    {
      id: 'c3',
      title: 'Print a receipt for a past sale',
      until: { kind: 'state', test: (s) => s.sheets >= 1 },
      ladder: [
        'Open the Orders screen.',
        'Tap the Completed tab.',
        'Tap an order, then tap Receipt.',
      ],
      reveal: SPOT.ordersReceipt,
      via: SPOT.ordersTabCompleted,
      allow: [],
      at: { ...atWin },
      inject: [],
    },
  ],
  check2: [
    {
      id: 'c4',
      title: 'Fulfil the wrong order, then fix it',
      until: { kind: 'state', test: (s) => s.sheets === 0 },
      ladder: [
        'You marked the wrong order fulfilled.',
        'Go to the Completed tab, open that order.',
        'The order is already fulfilled - no action needed.',
        'Open the correct order from Unfulfilled and mark it fulfilled.',
      ],
      reveal: SPOT.ordersMarkFulfilled,
      via: SPOT.ordersTabCompleted,
      allow: [],
      at: { ...atWin },
      inject: [],
      taughtBy: 'g4',
    },
    {
      id: 'c5',
      title: 'Receipt for an order that was refunded',
      until: { kind: 'state', test: (s) => s.sheets >= 1 },
      ladder: [
        'A refunded order still has a receipt.',
        'Open the Orders screen and find the refunded order.',
        'Tap Receipt to print a copy showing the refund.',
      ],
      reveal: SPOT.ordersReceipt,
      via: SPOT.ordersTabCompleted,
      allow: [],
      at: { ...atWin },
      inject: [{ kind: 'cart', items: [{ variantId: 'train-v-egg', qty: 1 }] }],
      taughtBy: 'g7',
    },
  ],
  recap: [
    'Orders is under the More tab. Use the three tabs (Open, Unfulfilled, Completed) to find the sale.',
    'Tap an order to see its lines, mark it fulfilled, or print a receipt.',
    'Mark fulfilled moves an order from Unfulfilled to Completed.',
    'Receipt prints or emails a copy of any past sale, even refunded ones.',
    'Transactions (also under More) is a read-only log for reconciliation.',
  ],
};