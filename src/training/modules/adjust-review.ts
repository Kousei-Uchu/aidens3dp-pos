// Location: src/training/modules/adjust-review.ts
// "Review price adjustments": understand that flagged adjustments need a second look before payment,
// and what the manager approval rules mean. Practice data only.
import type { TrainingModule } from '../../lib/trainingModule';
import { SPOT } from '../../lib/trainingSpots';
import { PRACTICE_CASEY, PRACTICE_MORGAN } from '../../lib/trainingSandbox';

const BEE = 'train-v-bee';
const place = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: false };
const placeWin = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: true };

export const adjustReview: TrainingModule = {
  id: 'adjust-review',
  title: 'Review price adjustments',
  summary: 'Check a flagged price before paying, and know when a role can or cannot keep an adjustment.',
  minutes: 5,
  flow: 'standard',
  card: 'auto',
  practiceStaff: true,
  perms: { cashier: { item: false, line: false, order: false } }, // restrict cashiers in practice so the second check is clear
  tabs: ['checkout'],
  routes: ['cart', 'pay'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 20, w: 560, h: 34, label: 'Review price adjustments', size: 22, align: 'center' },
        { id: 'in-sub', kind: 'text', x: 60, y: 58, w: 520, h: 40, label: 'When an adjustment changed after it was set, the till flags it and asks you to keep, adjust or remove it before you pay.', size: 13, align: 'center' },
        { id: 'c-flag', kind: 'panel', x: 40, y: 108, w: 560, h: 96, label: 'FLAGGED', hidden: true },
        { id: 'i-flag', kind: 'icon', x: 52, y: 138, w: 44, h: 44, icon: 'alert-circle', tone: 'accent', size: 34, hidden: true },
        { id: 't-flag', kind: 'text', x: 104, y: 130, w: 476, h: 66, label: 'A price was set for some units. More were added, so the same price does not cover all of them now.', size: 13, hidden: true },
        { id: 'c-choices', kind: 'panel', x: 40, y: 216, w: 560, h: 96, label: 'YOUR OPTIONS', hidden: true },
        { id: 't-choices', kind: 'text', x: 52, y: 238, w: 536, h: 66, label: 'Keep: it stays as it is. Adjust: change it. Remove: put it back. If your role cannot keep it, you can still remove it or ask a manager.', size: 13, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', title: 'A second look', say: 'Price adjustments are checked before payment. If nothing changed after you set one, it just lists them. If something changed, it is flagged.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub' },
      { id: 'flag', title: 'Why it is flagged', say: 'Setting an item price for a fixed quantity, or a line price, can become out of step if the cart changes. The till tells you why.', set: { 'c-flag': { hidden: false }, 'i-flag': { hidden: false }, 't-flag': { hidden: false } }, focus: 'c-flag' },
      { id: 'choices', title: 'Keep, adjust or remove', say: 'You must deal with any flagged adjustment. Depending on role limits, you may not be able to keep or adjust one, but you can always remove it.', set: { 'c-choices': { hidden: false }, 't-choices': { hidden: false } }, focus: 'c-choices' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'cart', nodes: [
        { id: 'bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Cart', sub: 'Practice data' },
        { id: 'line-bee', kind: 'row', x: 40, y: 56, w: 560, h: 60, label: 'Bumble Bee', sub: '2 x $6.00', value: '$12.00' },
        { id: 'total', kind: 'row', x: 40, y: 300, w: 560, h: 34, label: 'Total', value: '$12.00' },
        { id: 'charge', kind: 'button', x: 40, y: 342, w: 560, h: 40, label: 'Charge', icon: 'card' },
      ] },
      { id: 'review', nodes: [
        { id: 'rv-panel', kind: 'panel', x: 40, y: 12, w: 560, h: 376, label: 'CHECK THE PRICE ADJUSTMENTS' },
        { id: 'rv-a', kind: 'row', x: 60, y: 44, w: 520, h: 56, label: 'Bumble Bee', sub: 'Line price set to $6.00, but the line now has 2', value: '−$4.00' },
        { id: 'rv-flag', kind: 'text', x: 60, y: 108, w: 520, h: 40, label: 'The adjusted price was set for 1 Bumble Bee, the line now has 2.', size: 13, tone: 'bad' },
        { id: 'rv-keep', kind: 'button', x: 60, y: 156, w: 160, h: 38, label: 'Keep' },
        { id: 'rv-adj', kind: 'button', x: 230, y: 156, w: 160, h: 38, label: 'Adjust', tone: 'neutral' },
        { id: 'rv-rm', kind: 'button', x: 400, y: 156, w: 180, h: 38, label: 'Remove', tone: 'neutral' },
        { id: 'rv-total', kind: 'text', x: 60, y: 216, w: 520, h: 28, label: 'Total $12.00', size: 18, align: 'center' },
        { id: 'rv-go', kind: 'button', x: 60, y: 316, w: 520, h: 44, label: 'Continue to payment' },
      ] },
    ],
    steps: [
      { id: 'cart', title: 'A flagged line', say: 'The Bumble Bee had a line price set earlier, but another one was added. Tap Charge.', screen: 'cart', focus: 'charge', note: '$12.00 now' },
      { id: 'review', title: 'The check window', say: 'The till lists the adjustment and why it is flagged. You must choose before you can continue.', tap: 'charge', screen: 'review', focus: 'rv-flag', note: 'Deal with the flag' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'In this practice run Casey is a cashier and Morgan is a manager. Cashiers cannot keep line adjustments in this setup, but they can always remove them. You will see both.', until: { kind: 'next' } },
    { id: 'g-cart', target: SPOT.cartCharge, say: 'As Casey (cashier), charge to see the flagged adjustment.', until: { kind: 'visible', id: SPOT.reviewContinue }, gesture: 'tap', allow: ['adjust'], at: place },
    { id: 'g-denied', target: SPOT.reviewContinue, say: 'Because Casey cannot keep it, only Remove is offered to resolve the flag. Tap Remove, then Continue to payment.', until: { kind: 'state', test: s => s.paying }, gesture: 'tap', allow: ['adjust'], at: placeWin },
    { id: 'g-switch', target: SPOT.tabMore, say: 'Now switch to Morgan (manager). Tap the More tab, then Switch staff to sign in as Morgan.', until: { kind: 'visible', id: SPOT.loginUnlock }, gesture: 'tap', allow: ['sale'], at: place },
    { id: 'g-morgan', target: SPOT.loginUnlock, say: 'Morgan uses PIN 2468. Key it in and unlock.', until: { kind: 'state', test: s => s.staffId === PRACTICE_MORGAN }, typing: true, target: SPOT.loginPinpad, allow: [], at: { tabs: ['checkout'], routes: [], sheets: true } },
    { id: 'g-replay', target: SPOT.cartCharge, say: 'With Morgan, charge again. The flagged adjustment can be kept or adjusted. Keep it, then Continue to payment.', until: { kind: 'state', test: s => s.paying }, gesture: 'tap', allow: ['adjust'], at: placeWin },
    { id: 'g-done', say: 'The review catches changes after an adjustment was set. Removal is never blocked; keeping or adjusting can be limited by role.', until: { kind: 'next' }, at: place },
  ],
  check1: [
    { id: 'c1-review', title: 'As Casey, a cashier, deal with the flagged price and continue to payment',
      until: { kind: 'state', test: s => s.paying && s.staffId === PRACTICE_CASEY },
      inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 2, adjust: { finalCents: 600, seenQty: 1 } }] }, { kind: 'staff', who: 'casey' }],
      ladder: ['A flagged adjustment needs a second look.', 'Tap Charge. Only Remove can clear it for this role.', 'Tap Remove, then Continue to payment.'],
      reveal: SPOT.reviewRemove, via: SPOT.cartCharge, gesture: 'tap', allow: ['adjust'], at: placeWin },
  ],
  check2: [
    { id: 'c2-keep', title: 'As Morgan, a manager, the flagged price can be kept and you can continue',
      taughtBy: 'g-morgan',
      until: { kind: 'state', test: s => s.paying && s.staffId === PRACTICE_MORGAN },
      inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 2, adjust: { finalCents: 600, seenQty: 1 } }] }, { kind: 'staff', who: 'morgan' }],
      ladder: ['Morgan is a manager, so Keep is allowed.', 'Charge, Keep the flagged price, then Continue to payment.'],
      reveal: SPOT.reviewKeep, via: SPOT.cartCharge, gesture: 'tap', allow: ['adjust'], at: placeWin },
  ],
  recap: [
    'The till flags an adjustment when something changed after you set it.',
    'You must keep, adjust or remove flagged adjustments before you pay.',
    'Removal is never blocked; keeping or adjusting can be limited by role.',
  ],
};