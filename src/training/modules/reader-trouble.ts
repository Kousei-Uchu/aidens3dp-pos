// Location: src/training/modules/reader-trouble.ts
// "When the reader is not ready": tell reader trouble (not paired, offline, out of reach) from a declined card, and re-pair.
// Practice data only: the reader state is a practice one, pairing it never touches the real terminal, and no card is charged.
import type { TrainingModule, TrainSnap } from '../../lib/trainingModule';
import { SPOT } from '../../lib/trainingSpots';

const BEE = 'train-v-bee'; const EGG = 'train-v-egg';
const payWin = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: true };
const diag = { tabs: ['more'], routes: ['diagnostics'], sheets: false };
/** A finished sale, paid wholly one way, with the Receipt window closed again. */
const saleDone = (n: number, kind: 'card' | 'cash') => (s: TrainSnap): boolean => s.sales >= n && s.sheets === 0 && !!s.lastSaleKinds?.length && s.lastSaleKinds.every(k => k === kind);

export const readerTroubleModule: TrainingModule = {
  id: 'reader-trouble',
  title: 'When the reader is not ready',
  summary: 'Tell reader trouble from a declined card, pair the terminal again, and know what still works when the reader is down.',
  minutes: 7,
  suggestedFirst: false,
  flow: 'standard',
  card: 'auto',
  practiceStaff: false,
  tabs: ['checkout', 'more'],
  routes: ['cart', 'pay', 'diagnostics'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      {
        id: 'overview',
        nodes: [
          { id: 'in-title', kind: 'text', x: 40, y: 14, w: 560, h: 34, label: 'When the reader is not ready', size: 22, align: 'center', hidden: true },
          { id: 'in-sub', kind: 'text', x: 60, y: 50, w: 520, h: 60, label: 'The reader is the card terminal your till talks to. It can be not paired, offline, busy or out of reach. That is not the same as a card being declined.', size: 13, align: 'center', hidden: true },
          { id: 'c-reader', kind: 'panel', x: 40, y: 124, w: 270, h: 124, label: 'READER TROUBLE', hidden: true },
          { id: 'i-reader', kind: 'icon', x: 52, y: 148, w: 44, h: 44, icon: 'alert-circle', tone: 'bad', size: 34, hidden: true },
          { id: 't-reader', kind: 'text', x: 104, y: 140, w: 198, h: 104, label: 'The reader is the problem', sub: 'Not paired, offline, busy or out of reach.', size: 13, hidden: true },
          { id: 'c-decline', kind: 'panel', x: 330, y: 124, w: 270, h: 124, label: 'A DECLINED CARD', hidden: true },
          { id: 'i-decline', kind: 'icon', x: 342, y: 148, w: 44, h: 44, icon: 'card', tone: 'neutral', size: 34, hidden: true },
          { id: 't-decline', kind: 'text', x: 394, y: 140, w: 198, h: 104, label: 'The card is the problem', sub: 'The reader is fine. Try another card, or another way to pay.', size: 13, hidden: true },
          { id: 'c-works', kind: 'panel', x: 40, y: 264, w: 560, h: 120, label: 'WHAT STILL WORKS', hidden: true },
          { id: 't-works', kind: 'text', x: 60, y: 292, w: 520, h: 76, label: 'Cash keeps working when the reader is down. Take the sale another way, then fix the reader when the counter is quiet.', size: 13, align: 'center', hidden: true },
        ],
      },
    ],
    steps: [
      { id: 'what', say: 'The reader is the card terminal your till talks to. When it is not ready the till shows Reader issue, and that is not the same as a card being declined.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub' },
      { id: 'reader', say: 'Reader trouble is the reader itself: not paired, offline, busy, or out of reach. Fix it in More, Support & diagnostics.', set: { 'c-reader': { hidden: false }, 'i-reader': { hidden: false }, 't-reader': { hidden: false } }, focus: 't-reader' },
      { id: 'decline', say: 'A declined card is different. The reader is working, but the card was refused. The Not approved window lets you try another card or another way to pay.', set: { 'c-decline': { hidden: false }, 'i-decline': { hidden: false }, 't-decline': { hidden: false } }, focus: 't-decline' },
      { id: 'works', say: 'Cash keeps working when the reader is down, so a customer is never stuck. Take the sale another way, then fix the reader.', set: { 'c-works': { hidden: false }, 't-works': { hidden: false } }, focus: 't-works' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      {
        id: 'pay',
        nodes: [
          { id: 'p-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Payment', sub: 'Practice data' },
          { id: 'p-total', kind: 'row', x: 20, y: 54, w: 600, h: 40, label: 'Still to pay', value: '$14.00' },
          { id: 'p-issue', kind: 'panel', x: 20, y: 108, w: 600, h: 52, label: 'READER ISSUE', tone: 'bad', hidden: true },
          { id: 'p-issue-text', kind: 'text', x: 34, y: 124, w: 572, h: 26, label: 'Terminal not paired - open Diagnostics > Zeller > Setup.', size: 12, hidden: true },
          { id: 'p-card', kind: 'button', x: 20, y: 300, w: 600, h: 44, label: 'Card' },
        ],
      },
      {
        id: 'diag',
        nodes: [
          { id: 'd-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Support & diagnostics', sub: 'Practice data' },
          { id: 'd-reader', kind: 'row', x: 20, y: 56, w: 600, h: 44, label: 'Reader issue', sub: 'Terminal not paired', icon: 'alert-circle' },
          { id: 'd-ready', kind: 'row', x: 20, y: 56, w: 600, h: 44, label: 'Reader ready', sub: 'Paired and reachable', icon: 'checkmark-circle', hidden: true },
          { id: 'd-setup', kind: 'button', x: 20, y: 112, w: 600, h: 40, label: 'Setup (pair terminal)' },
          { id: 'd-check', kind: 'button', x: 20, y: 160, w: 600, h: 40, label: 'Check reader' },
          { id: 'd-note', kind: 'text', x: 20, y: 216, w: 600, h: 30, label: 'Check the reader here, and pair it again if it says Reader issue.', size: 13, hidden: true },
        ],
      },
    ],
    steps: [
      { id: 'look', say: 'A card payment starts on the Payment page. If the reader is not ready, the till shows Reader issue along the top.', screen: 'pay', focus: 'p-card' },
      { id: 'issue', say: 'Tap Card and the till asks the reader. When it is not paired, it says so here. This is reader trouble, not a declined card.', screen: 'pay', set: { 'p-issue': { hidden: false }, 'p-issue-text': { hidden: false } }, focus: 'p-issue-text' },
      { id: 'open', say: 'To fix it, open More and tap Support & diagnostics, under Help and settings. The reader row says what is wrong.', screen: 'diag', set: { 'd-note': { hidden: false } }, focus: 'd-setup' },
      { id: 'fix', say: 'Tap Setup (pair terminal). The terminal pairs with the till again, and the reader row turns to Reader ready.', tap: 'd-setup', screen: 'diag', set: { 'd-ready': { hidden: false }, 'd-reader': { hidden: true } }, focus: 'd-ready' },
      { id: 'check', say: 'Tap Check reader to confirm it can be reached.', tap: 'd-check', screen: 'diag', focus: 'd-check' },
      { id: 'decline', say: 'A declined card looks different. The reader is fine, and the Not approved window lets you try the card again.', screen: 'pay', set: { 'p-issue': { tone: 'bad', label: 'NOT APPROVED' }, 'p-issue-text': { label: 'Card declined - try another card.' } }, focus: 'p-issue-text' },
    ],
  },
  guide: [
    {
      id: 'g-open',
      say: 'Open More and tap Support & diagnostics. This is where reader trouble is put right.',
      target: SPOT.moreDiagnostics,
      until: { kind: 'state', test: (s) => s.tab === 'more' && s.route === 'diagnostics' },
      allow: [],
      gesture: 'tap',
      at: diag,
    },
    {
      id: 'g-check',
      say: 'Tap Check reader. The row says Reader ready when the till can reach the terminal.',
      target: SPOT.diagnosticsCheck,
      until: { kind: 'press', id: SPOT.diagnosticsCheck },
      at: diag,
    },
    {
      id: 'g-setup',
      say: 'If the row says Reader issue instead, tap Setup (pair terminal) to pair it with the till again.',
      target: SPOT.diagnosticsSetup,
      until: { kind: 'press', id: SPOT.diagnosticsSetup },
      at: diag,
    },
    {
      id: 'g-done',
      say: 'Remember: a declined card is not a reader problem, so try the card again there. If the reader is offline, cash still works.',
      until: { kind: 'next' },
      at: diag,
    },
  ],
  check1: [
    {
      id: 'r-pair',
      title: 'The reader is not paired. Pair it again',
      until: { kind: 'state', test: (s) => s.reader?.ready === true },
      ladder: [
        'The till says the reader is not paired.',
        'Reader trouble is fixed in More, Support & diagnostics.',
        'Tap Support & diagnostics, then tap Setup (pair terminal). The row turns to Reader ready.',
      ],
      reveal: SPOT.diagnosticsSetup,
      via: SPOT.moreDiagnostics,
      gesture: 'tap',
      allow: [],
      at: { ...diag },
      inject: [{ kind: 'reader', ready: false, message: 'Terminal not paired - open Diagnostics > Zeller > Setup.' }],
    },
    {
      id: 'r-card',
      title: 'Take a card payment now the reader is ready',
      until: { kind: 'state', test: saleDone(1, 'card') },
      ladder: [
        'The cart is ready to be paid.',
        'Charge opens the Payment page, and Card starts the terminal.',
        'This terminal plays the customer by itself. Wait, then tap No receipt.',
      ],
      reveal: SPOT.payCard,
      via: SPOT.cartCharge,
      gesture: 'tap',
      allow: ['tender', 'sale'],
      at: { ...payWin },
      inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }],
    },
  ],
  check2: [
    {
      id: 'r-decline',
      title: 'A card is declined. That is not reader trouble',
      until: { kind: 'state', test: saleDone(1, 'card') },
      ladder: [
        'The reader is fine here; the card was refused.',
        'The Not approved window has two buttons. One tries the card again.',
        'Tap Try card again, wait for the terminal, then tap No receipt.',
      ],
      reveal: SPOT.payRetry,
      via: SPOT.payCard,
      gesture: 'tap',
      allow: ['tender', 'sale'],
      at: { ...payWin },
      inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }, { kind: 'decline', times: 1 }],
      taughtBy: 'decline',
    },
    {
      id: 'r-offline',
      title: 'The reader is offline. Take the sale by cash instead',
      until: { kind: 'state', test: saleDone(1, 'cash') },
      ladder: [
        'The reader cannot reach the bank, so no card will go through.',
        'Cash keeps working even when the reader is down.',
        'Tap Charge, tap Cash, take the notes and coins, then finish the sale.',
      ],
      reveal: SPOT.payCash,
      via: SPOT.cartCharge,
      gesture: 'tap',
      allow: ['tender', 'sale'],
      at: { ...payWin },
      inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }, { kind: 'reader', ready: false, message: 'No internet - card payments need a connection. Cash still works.' }],
      taughtBy: 'works',
    },
  ],
  recap: [
    'Reader issue in the till is reader trouble: not paired, offline, busy, or out of reach.',
    'Fix it in More, Support & diagnostics: Check reader, and Setup (pair terminal) to pair it again.',
    'A declined card is not reader trouble: the Not approved window lets you try the card again.',
    'When the reader is down, cash still works, so the customer is never stuck.',
  ],
};
