// Location: src/training/modules/offline.ts
// "When the internet is down": what still works offline (cash, saving a cart), where finished sales wait in the outbox,
// and how to retry one without charging the customer twice. Practice data only: nothing is ever uploaded and the
// practice outbox is separate from the real one.
import type { TrainingModule, TrainSnap } from '../../lib/trainingModule';
import { SPOT, cashDenomSpot, gridItemSpot, outboxRetrySpot } from '../../lib/trainingSpots';
import { FIXTURE_OUTBOX_SALE } from '../../lib/trainingSandbox';

const BEE = 'train-v-bee'; const EGG = 'train-v-egg';
const has = (s: { cart: { variantId?: string }[] }, id: string): boolean => s.cart.some(l => l.variantId === id);
/** The sale has finished and the Receipt window is closed again. */
const closed = (s: { sales: number; sheets: number }): boolean => s.sales >= 1 && s.sheets === 0;
/** What the customer handed over so far in the Cash window. */
const received = (cents: number) => (s: TrainSnap): boolean => s.cash?.step === 'receive' && s.cash.received === cents;
/** A queued sale count of at least n. */
const queuedAtLeast = (n: number) => (s: TrainSnap): boolean => (s.outbox?.queued ?? 0) >= n;
/** No sale is stuck on a person any more (Retry was tapped). */
const noneStuck = (s: TrainSnap): boolean => (s.outbox?.stuck ?? 0) === 0;
const place = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: false };
const placeWin = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: true };

export const offlineModule: TrainingModule = {
  id: 'offline',
  title: 'When the internet is down',
  summary: 'What still works when the till is offline, where finished sales wait, and how to retry one without charging the customer twice.',
  minutes: 8,
  suggestedFirst: false,
  flow: 'standard',
  card: 'auto',
  practiceStaff: false,
  startSync: 'offline',
  tabs: ['checkout', 'notifications', 'more'],
  routes: ['cart', 'pay', 'diagnostics'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      {
        id: 'overview',
        nodes: [
          { id: 'in-title', kind: 'text', x: 40, y: 14, w: 560, h: 34, label: 'When the internet is down', size: 22, align: 'center', hidden: true },
          { id: 'in-sub', kind: 'text', x: 60, y: 50, w: 520, h: 60, label: 'The connection drops mid-shift. The till keeps selling. Card payments wait, cash does not, and every finished sale is stored until it can upload.', size: 13, align: 'center', hidden: true },
          { id: 'c-works', kind: 'panel', x: 40, y: 124, w: 270, h: 124, label: 'STILL WORKS', hidden: true },
          { id: 'i-works', kind: 'icon', x: 52, y: 148, w: 44, h: 44, icon: 'checkmark-circle', tone: 'good', size: 34, hidden: true },
          { id: 't-works', kind: 'text', x: 104, y: 140, w: 198, h: 104, label: 'Cash, saving a cart, and adding items you already have.', sub: 'None of it needs the internet.', size: 13, hidden: true },
          { id: 'c-needs', kind: 'panel', x: 330, y: 124, w: 270, h: 124, label: 'NEEDS THE INTERNET', hidden: true },
          { id: 'i-needs', kind: 'icon', x: 342, y: 148, w: 44, h: 44, icon: 'cloud-offline', tone: 'bad', size: 34, hidden: true },
          { id: 't-needs', kind: 'text', x: 394, y: 140, w: 198, h: 104, label: 'Card payments, importing items, and uploading receipts', sub: 'Card says No internet. Cash is the fallback.', size: 13, hidden: true },
          { id: 'c-outbox', kind: 'panel', x: 40, y: 264, w: 560, h: 120, label: 'THE OUTBOX', hidden: true },
          { id: 't-outbox', kind: 'text', x: 60, y: 292, w: 520, h: 76, label: 'Every finished sale is kept in the outbox and uploads by itself when the connection returns. Each sale is stamped once, so retrying it never charges the customer twice.', size: 13, align: 'center', hidden: true },
        ],
      },
    ],
    steps: [
      { id: 'what', say: 'The till keeps selling when the connection drops. The status bar at the top says Offline. Card payments wait; cash does not.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub' },
      { id: 'works', say: 'What still works offline: taking cash, saving a cart, and selling items the till already holds. None of that needs the internet.', set: { 'c-works': { hidden: false }, 'i-works': { hidden: false }, 't-works': { hidden: false } }, focus: 't-works' },
      { id: 'needs', say: 'What needs the internet: card payments, importing items, and uploading receipts. If the customer wants to pay by card, the reader says No internet, so take the sale another way.', set: { 'c-needs': { hidden: false }, 'i-needs': { hidden: false }, 't-needs': { hidden: false } }, focus: 't-needs' },
      { id: 'outbox', say: 'Every finished sale is written down and waits in the outbox. It uploads by itself when the connection returns, so nothing is lost. And each sale is stamped once, so retrying it never charges the customer twice.', set: { 'c-outbox': { hidden: false }, 't-outbox': { hidden: false } }, focus: 't-outbox' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      {
        id: 'checkout',
        nodes: [
          { id: 's-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Checkout', sub: 'Offline' },
          { id: 's-total', kind: 'text', x: 40, y: 70, w: 560, h: 50, label: '$14.00', size: 40, align: 'center' },
          { id: 's-sub', kind: 'text', x: 40, y: 122, w: 560, h: 22, label: 'Still to pay', size: 14, align: 'center' },
          { id: 's-charge', kind: 'button', x: 120, y: 190, w: 400, h: 48, label: 'Charge' },
          { id: 's-note', kind: 'text', x: 40, y: 260, w: 560, h: 60, label: 'The status bar says Offline. Items, saving a cart and cash still work.', size: 13, align: 'center', hidden: true },
        ],
      },
      {
        id: 'queue',
        nodes: [
          { id: 'q-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Notifications', sub: 'Practice data' },
          { id: 'q-queued', kind: 'row', x: 20, y: 60, w: 600, h: 48, label: '1 sale queued', sub: 'Uploads when the connection is back.', icon: 'time-outline' },
          { id: 'q-stuck', kind: 'row', x: 20, y: 120, w: 600, h: 48, label: 'Sale needs attention', sub: 'A customer email is missing.', icon: 'warning-outline', hidden: true },
          { id: 'q-retry', kind: 'button', x: 20, y: 180, w: 600, h: 40, label: 'Retry', hidden: true },
          { id: 'q-synced', kind: 'row', x: 20, y: 120, w: 600, h: 48, label: '1 sale uploaded', sub: 'Nothing else to do.', icon: 'cloud-done-outline', hidden: true },
          { id: 'q-note', kind: 'text', x: 20, y: 240, w: 600, h: 50, label: 'Retry sends the same sale again, so the customer is never charged twice.', size: 13, hidden: true },
        ],
      },
    ],
    steps: [
      { id: 'offline', say: 'When the connection drops, the status bar says Offline. The till keeps selling: items, saving a cart and cash still work.', screen: 'checkout', set: { 's-note': { hidden: false } }, focus: 's-note' },
      { id: 'cash', say: 'A cash sale finishes as usual. It is written down straight away, so no sale is ever lost.', screen: 'checkout', focus: 's-charge' },
      { id: 'queue', say: 'Finished sales wait in the outbox. Notifications lists them, and they upload by themselves when the connection is back.', screen: 'queue', focus: 'q-queued' },
      { id: 'stuck', say: 'Sometimes Shopify refuses a sale. It is held and marked. The row says what is wrong and offers Retry.', screen: 'queue', set: { 'q-stuck': { hidden: false }, 'q-retry': { hidden: false } }, focus: 'q-stuck' },
      { id: 'retry', say: 'Retry sends the same sale again. Each sale is stamped once, so retrying never charges the customer twice.', tap: 'q-retry', screen: 'queue', set: { 'q-stuck': { hidden: true }, 'q-retry': { hidden: true }, 'q-synced': { hidden: false } }, focus: 'q-synced' },
      { id: 'sync', say: 'Back online, the status bar reads Online and the outbox empties on its own. You can also push it from Support & diagnostics with Sync now.', screen: 'checkout', set: { 's-bar': { sub: 'Online' }, 's-note': { label: 'Back online, the queue clears by itself.' } }, focus: 's-note' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'The connection is down for this course, so the till is offline. Take one cash sale, then find it waiting to upload. Nothing is sent anywhere.', until: { kind: 'next' } },
    { id: 'g-add-bee', target: gridItemSpot(BEE), say: 'First a sale. Tap the Bumble Bee tile to add it to the cart. Selling from the grid does not need the internet.', until: { kind: 'state', test: s => has(s, BEE) }, gesture: 'tap', allow: ['add'], recover: { say: 'On the Checkout tab, tap the Bumble Bee tile.', target: SPOT.tabCheckout }, at: place },
    { id: 'g-add-egg', target: gridItemSpot(EGG), say: 'And the Dragon Egg, so the total is $14.00.', until: { kind: 'state', test: s => has(s, EGG) }, gesture: 'tap', allow: ['add'], recover: { say: 'Tap the Dragon Egg tile to add it.', target: SPOT.tabCheckout }, at: place },
    { id: 'g-charge', target: SPOT.cartCharge, say: 'Tap Charge to open the Payment page.', until: { kind: 'press', id: SPOT.cartCharge }, gesture: 'tap', allow: [], recover: { say: 'On a phone, tap the cart bar at the bottom, then tap Charge.', target: SPOT.cartOpen }, at: place },
    { id: 'g-cash', target: SPOT.payCash, say: 'The customer pays in cash. Tap Cash. Card would say No internet, but cash works offline.', until: { kind: 'press', id: SPOT.payCash }, gesture: 'tap', allow: ['tender'], at: placeWin },
    { id: 'g-window', target: SPOT.cashPad, say: 'This is the Cash window. Tap the notes and coins the customer hands over, just as you would online.', until: { kind: 'next' }, allow: ['tender'], at: placeWin },
    { id: 'g-twenty', target: cashDenomSpot(2000), say: 'The customer hands over a $20 note. Tap $20.', until: { kind: 'state', test: received(2000) }, gesture: 'tap', allow: ['tender'], at: placeWin },
    { id: 'g-next', target: SPOT.cashNext, say: 'Tap Next to give the $6.00 change.', until: { kind: 'visible', id: SPOT.cashGave }, gesture: 'tap', allow: ['tender'], at: placeWin },
    { id: 'g-give', target: SPOT.cashGave, say: 'Hand over the change, then tap Gave this.', until: { kind: 'state', test: s => s.sales >= 1 }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-receipt', target: SPOT.receiptNone, say: 'The sale is saved straight away, and the Receipt window opens. Tap No receipt.', until: { kind: 'state', test: closed }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-queued', target: SPOT.tabNotifications, say: 'The sale did not reach Shopify, because there is no connection. Open Notifications to see where it waits.', until: { kind: 'state', test: s => s.tab === 'notifications' }, gesture: 'tap', allow: [], recover: { say: 'Tap Notifications at the bottom of the screen.', target: SPOT.tabCheckout }, at: { tabs: ['checkout', 'notifications'], sheets: false } },
    { id: 'g-queued-note', say: 'Here it is: one sale queued. It uploads by itself when the connection is back, so you do not have to do anything. Each sale is stamped once, so it is never sent twice.', until: { kind: 'next' }, at: { tabs: ['notifications'] } },
    { id: 'g-more', target: SPOT.tabMore, say: 'You can also push the queue yourself. Tap More.', until: { kind: 'state', test: s => s.tab === 'more' }, gesture: 'tap', allow: [], recover: { say: 'Tap More at the bottom of the screen.', target: SPOT.tabNotifications }, at: { tabs: ['more', 'notifications'], sheets: false } },
    { id: 'g-diag', target: SPOT.moreDiagnostics, say: 'Tap Support & diagnostics.', until: { kind: 'state', test: s => s.route === 'diagnostics' }, gesture: 'tap', allow: [], recover: { say: 'Tap the More tab at the bottom, then Support & diagnostics.', target: SPOT.tabMore }, at: { tabs: ['more'], routes: ['diagnostics'], sheets: false } },
    { id: 'g-sync', target: SPOT.diagnosticsSync, say: 'Tap Sync now to try the outbox straight away. It sends what is waiting; it never makes a second sale.', until: { kind: 'press', id: SPOT.diagnosticsSync }, gesture: 'tap', allow: [], at: { tabs: ['more'], routes: ['diagnostics'], sheets: false } },
    { id: 'g-done', say: 'Remember: offline, cash still works, finished sales wait in the outbox and upload themselves, and a stuck sale is fixed with Retry, never by ringing the sale up again.', until: { kind: 'next' }, at: { tabs: ['more'], routes: ['diagnostics'], sheets: false } },
  ],
  check1: [
    {
      id: 'o-cash',
      title: 'Take the cash sale while the till is offline',
      until: { kind: 'state', test: s => closed(s) && queuedAtLeast(1)(s) },
      ladder: [
        'The till is offline and the cart is ready.',
        'Charge opens the Payment page, and Cash takes the customer\'s notes and coins.',
        'Tap Charge, tap Cash, take a $20 note, tap Next, tap Gave this, then tap No receipt.',
      ],
      reveal: SPOT.payCash,
      via: SPOT.cartCharge,
      gesture: 'tap',
      allow: ['tender', 'sale'],
      at: { ...placeWin },
      inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }],
    },
    {
      id: 'r-find',
      title: 'Find the sale waiting in the outbox',
      until: { kind: 'state', test: s => s.tab === 'notifications' && queuedAtLeast(1)(s) },
      ladder: [
        'The sale could not upload, because there is no connection.',
        'Notifications shows what is waiting.',
        'Tap Notifications at the bottom of the screen. The sale is listed as queued.',
      ],
      reveal: SPOT.tabNotifications,
      via: SPOT.tabCheckout,
      gesture: 'tap',
      allow: [],
      at: { tabs: ['notifications'], sheets: false },
    },
  ],
  check2: [
    {
      id: 'r-card-offline',
      title: 'No connection, so the card will not work. Take the sale by cash',
      until: { kind: 'state', test: s => closed(s) && !!s.lastSaleKinds?.length && s.lastSaleKinds.every(k => k === 'cash') },
      ladder: [
        'The till is offline, so the reader cannot reach the bank.',
        'Card says No internet. Cash keeps working.',
        'Tap Charge, tap Cash, take the notes and coins, then finish the sale and tap No receipt.',
      ],
      reveal: SPOT.payCash,
      via: SPOT.payCard,
      gesture: 'tap',
      allow: ['tender', 'sale'],
      at: { ...placeWin },
      inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }, { kind: 'reader', ready: false, message: 'No internet - card payments need a connection. Cash still works.' }],
      taughtBy: 'needs',
    },
    {
      id: 'r-retry',
      title: 'A sale is stuck. Retry it without making a second one',
      until: { kind: 'state', test: noneStuck },
      ladder: [
        'A finished sale was refused by Shopify, so it is held and marked.',
        'Notifications shows it needs attention, with a Retry button.',
        'Tap Notifications, then tap Retry on the stuck sale. It re-sends the same sale, never a new one.',
      ],
      reveal: outboxRetrySpot(FIXTURE_OUTBOX_SALE),
      via: SPOT.tabNotifications,
      gesture: 'tap',
      allow: [],
      at: { tabs: ['notifications'], routes: [], sheets: false },
      inject: [{ kind: 'outbox', stuck: 1 }],
      taughtBy: 'retry',
    },
  ],
  recap: [
    'Offline, the status bar says Offline, and the till keeps selling: items, saved carts and cash still work.',
    'Card payments need the internet, so take the sale by cash instead.',
    'Every finished sale waits in the outbox and uploads by itself when the connection is back.',
    'A stuck sale is retried from Notifications. Retry re-sends the same sale, so nobody is charged twice.',
  ],
};
