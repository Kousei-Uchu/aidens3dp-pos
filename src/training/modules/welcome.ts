// Location: src/training/modules/welcome.ts
// "How training works": small, but it uses every stage, so the whole engine can be tried before the real courses arrive.
import type { TrainingModule } from '../../lib/trainingModule';
import { SPOT, cartLineSpot, gridItemSpot } from '../../lib/trainingSpots';

export const welcome: TrainingModule = {
  id: 'welcome', title: 'How training works', summary: 'A five minute tour of the course format. Start here if you have never used training before.', minutes: 5, suggestedFirst: true,
  flow: 'standard', tabs: ['checkout'], routes: ['cart'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 22, w: 560, h: 34, label: 'How training works', size: 22, align: 'center' },
        { id: 'card', kind: 'panel', x: 150, y: 76, w: 340, h: 84, label: 'COURSE', hidden: true },
        { id: 'card-icon', kind: 'icon', x: 166, y: 96, w: 48, h: 48, icon: 'school', tone: 'accent', hidden: true },
        { id: 'card-text', kind: 'text', x: 226, y: 98, w: 252, h: 48, label: 'Take a payment', sub: 'Six short parts, in any order', size: 16, hidden: true },
        { id: 'stages', kind: 'panel', x: 24, y: 184, w: 592, h: 124, label: 'THE SIX PARTS, IN ORDER', hidden: true },
        { id: 'c-info', kind: 'chip', x: 40, y: 212, w: 86, h: 28, label: 'Info', hidden: true },
        { id: 'i-info', kind: 'icon', x: 40, y: 250, w: 86, h: 44, icon: 'book', size: 32, hidden: true },
        { id: 'c-show', kind: 'chip', x: 134, y: 212, w: 86, h: 28, label: 'Show', hidden: true },
        { id: 'i-show', kind: 'icon', x: 134, y: 250, w: 86, h: 44, icon: 'eye', size: 32, hidden: true },
        { id: 'c-guide', kind: 'chip', x: 228, y: 212, w: 86, h: 28, label: 'Guide', hidden: true },
        { id: 'i-guide', kind: 'icon', x: 228, y: 250, w: 86, h: 44, icon: 'hand-left', size: 32, hidden: true },
        { id: 'c-c1', kind: 'chip', x: 322, y: 212, w: 86, h: 28, label: 'Check 1', hidden: true },
        { id: 'i-c1', kind: 'icon', x: 322, y: 250, w: 86, h: 44, icon: 'checkbox', size: 32, hidden: true },
        { id: 'c-c2', kind: 'chip', x: 416, y: 212, w: 86, h: 28, label: 'Check 2', hidden: true },
        { id: 'i-c2', kind: 'icon', x: 416, y: 250, w: 86, h: 44, icon: 'alert-circle', size: 32, hidden: true },
        { id: 'c-done', kind: 'chip', x: 510, y: 212, w: 86, h: 28, label: 'Done', hidden: true },
        { id: 'i-done', kind: 'icon', x: 510, y: 250, w: 86, h: 44, icon: 'trophy', size: 32, hidden: true },
        { id: 'practice-tag', kind: 'chip', x: 224, y: 324, w: 192, h: 28, label: 'PRACTICE DATA', tone: 'accent', hidden: true },
        { id: 'hint-btn', kind: 'button', x: 130, y: 322, w: 120, h: 36, label: 'Hint', icon: 'help-circle', tone: 'neutral', hidden: true },
        { id: 'hint-text', kind: 'text', x: 264, y: 318, w: 310, h: 44, label: 'A small pointer first, then a clearer one, then the answer.', size: 12, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', title: 'What a course is', say: 'Training is a short course for one job at the till, like taking a payment. Pick any course, in any order.', set: { card: { hidden: false }, 'card-icon': { hidden: false }, 'card-text': { hidden: false } }, focus: 'card', note: 'One job per course' },
      { id: 'parts', title: 'The six parts', say: 'Each course has six parts, done in order. You read about the job, watch it, do it with arrows, then prove it twice.', set: { stages: { hidden: false }, 'c-info': { hidden: false }, 'i-info': { hidden: false }, 'c-show': { hidden: false }, 'i-show': { hidden: false }, 'c-guide': { hidden: false }, 'i-guide': { hidden: false }, 'c-c1': { hidden: false }, 'i-c1': { hidden: false }, 'c-c2': { hidden: false }, 'i-c2': { hidden: false }, 'c-done': { hidden: false }, 'i-done': { hidden: false } }, focus: 'stages', note: 'Six parts' },
      { id: 'practice', title: 'Real till, practice data', say: 'In Guide and the Checks you use the real till with practice data. Nothing is saved, sent or charged.', set: { 'c-guide': { tone: 'accent' }, 'practice-tag': { hidden: false } }, focus: 'c-guide', note: 'Nothing is real' },
      { id: 'hints', title: 'Stuck? Tap Hint', say: 'Stuck in a Check? Tap Hint. You get a small pointer first, then a clearer one, and in the end the answer is shown.', set: { 'c-guide': { tone: 'neutral' }, 'practice-tag': { hidden: true }, 'c-c1': { tone: 'accent' }, 'c-c2': { tone: 'accent' }, 'hint-btn': { hidden: false }, 'hint-text': { hidden: false } }, focus: 'hint-btn', note: 'Help is one tap away' },
      { id: 'tick', title: 'Done', say: 'Finish both Checks and the course gets a green tick next to your name.', set: { 'c-c1': { tone: 'neutral' }, 'c-c2': { tone: 'neutral' }, 'c-done': { tone: 'good' }, 'i-done': { tone: 'good' } }, focus: 'c-done', note: 'Your green tick' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'checkout', nodes: [
        { id: 'co-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Checkout', sub: 'Practice data' },
        { id: 'tile-bee', kind: 'tile', x: 14, y: 56, w: 104, h: 82, icon: 'bug', label: 'Bumble Bee', sub: '$8.00', color: '#FEF08A' },
        { id: 'tile-dragon', kind: 'tile', x: 126, y: 56, w: 104, h: 82, icon: 'flame', label: 'Red Dragon', sub: '$25.00', color: '#FED7AA' },
        { id: 'tile-egg', kind: 'tile', x: 238, y: 56, w: 104, h: 82, icon: 'egg', label: 'Dragon Egg', sub: '$6.00', color: '#BBF7D0' },
        { id: 'tile-key', kind: 'tile', x: 14, y: 146, w: 104, h: 82, icon: 'key', label: 'Keyring', sub: '$5.00', color: '#BFDBFE' },
        { id: 'tile-cow', kind: 'tile', x: 126, y: 146, w: 104, h: 82, icon: 'paw', label: 'Highland Cow', sub: '$12.00', color: '#DDD6FE' },
        { id: 'tile-custom', kind: 'tile', x: 238, y: 146, w: 104, h: 82, icon: 'create', label: 'Custom amount', color: '#E5E7EB' },
        { id: 'cart', kind: 'panel', x: 372, y: 52, w: 254, h: 250, label: 'CART' },
        { id: 'line-bee', kind: 'row', x: 380, y: 76, w: 238, h: 40, label: 'Bumble Bee', sub: '1 x $8.00', value: '$8.00', hidden: true },
        { id: 'line-dragon', kind: 'row', x: 380, y: 116, w: 238, h: 40, label: 'Red Dragon', sub: '1 x $25.00', value: '$25.00', hidden: true },
        { id: 'total', kind: 'row', x: 380, y: 224, w: 238, h: 34, label: 'Total', value: '$0.00' },
        { id: 'charge', kind: 'button', x: 380, y: 264, w: 238, h: 30, label: 'Charge', icon: 'card' },
        { id: 'hint-box', kind: 'panel', x: 14, y: 240, w: 328, h: 52, hidden: true },
        { id: 'hint-text', kind: 'text', x: 24, y: 244, w: 308, h: 44, label: 'Items are added from the grid on the Checkout screen.', size: 12, hidden: true },
        { id: 'dock', kind: 'panel', x: 0, y: 340, w: 640, h: 60 },
        { id: 'dock-say', kind: 'text', x: 14, y: 346, w: 400, h: 48, label: 'Tap the Bumble Bee tile.', sub: 'Step 1 of 3', size: 14 },
        { id: 'hint', kind: 'button', x: 432, y: 351, w: 96, h: 38, label: 'Hint', icon: 'help-circle', tone: 'neutral' },
        { id: 'exit', kind: 'button', x: 536, y: 351, w: 90, h: 38, label: 'Exit', icon: 'close', tone: 'neutral' },
      ] },
      { id: 'done', nodes: [
        { id: 'dn-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Course complete' },
        { id: 'dn-tick', kind: 'icon', x: 270, y: 70, w: 100, h: 100, icon: 'checkmark-circle', tone: 'good', size: 96 },
        { id: 'dn-title', kind: 'text', x: 120, y: 184, w: 400, h: 34, label: 'Course complete', size: 22, align: 'center' },
        { id: 'dn-sub', kind: 'text', x: 120, y: 220, w: 400, h: 22, label: 'How training works', size: 13, align: 'center', tone: 'neutral' },
        { id: 'name-row', kind: 'row', x: 190, y: 270, w: 260, h: 44, icon: 'person', label: 'Your name', sub: 'How training works', value: 'Done', tone: 'good', hidden: true },
      ] },
    ],
    steps: [
      { id: 'ring', title: 'Guide: the real till', say: 'In Guide you use the real till with practice data. This is a picture of it. The screen dims, and a ring shows the one thing to touch.', focus: 'tile-bee', note: 'The ring shows where to tap' },
      { id: 'tap', title: 'You tap, it responds', say: 'You tap the ringed tile, the same as at a real sale. The item lands in the cart and the total changes.', tap: 'tile-bee', focus: 'cart', set: { 'line-bee': { hidden: false }, total: { value: '$8.00' }, 'dock-say': { label: 'Now add a second item.', sub: 'Step 2 of 3' } }, note: 'The cart updates' },
      { id: 'bar', title: 'The bar at the bottom', say: 'The bar at the bottom says what you are doing. When its words change, you have moved on to the next step.', focus: 'dock-say', zoom: 1.7, note: 'Your current job' },
      { id: 'hint1', title: 'Stuck? Tap Hint', say: 'Stuck in a Check? Tap Hint. The first one only tells you where to look.', tap: 'hint', focus: 'hint-text', set: { 'hint-box': { hidden: false }, 'hint-text': { hidden: false } }, note: 'A small pointer' },
      { id: 'hint2', title: 'Each hint is clearer', say: 'Tap again for a clearer pointer. After the last hint, the answer is ringed for you.', tap: 'hint', focus: 'tile-egg', set: { 'hint-text': { label: 'Tap one product tile, then tap a different one.' }, 'tile-egg': { tone: 'accent' } }, note: 'The answer, ringed' },
      { id: 'tick', title: 'Done', say: 'Finish both Checks and the course gets a green tick next to your name.', screen: 'done', focus: 'name-row', set: { 'name-row': { hidden: false } }, note: 'Your green tick' },
    ],
  },
  guide: [
    { id: 'g-dock', say: 'The bar at the bottom stays with you in practice. It shows what you are doing, and has Hint and Exit buttons.', until: { kind: 'next' } },
    { id: 'g-tile', target: gridItemSpot('train-v-bee'), say: 'Tap the Bumble Bee tile to add it to the cart.', until: { kind: 'press', id: gridItemSpot('train-v-bee') }, recover: { say: 'Go back to the Checkout tab.', target: SPOT.tabCheckout } },
    { id: 'g-charge', target: SPOT.cartCharge, say: 'The bee is in the cart. When the customer is ready you press Charge. We will not take a payment in this course.', until: { kind: 'next' }, recover: { say: 'On a phone, the bar at the bottom shows the cart. Charge is on it.', target: SPOT.cartOpen } },
    { id: 'g-remove', target: cartLineSpot('train-v-bee'), say: 'Swipe this line to the left, then tap Remove to take the item out.', until: { kind: 'state', test: s => s.lines === 0 }, recover: { say: 'Open the cart from the bar at the bottom. Swipe this line to the left, then tap Remove.', target: SPOT.cartOpen } },
  ],
  check1: [
    { id: 'add-two', title: 'Add two different items to the cart', until: { kind: 'state', test: s => s.lines >= 2 }, ladder: ['Items are added from the grid on the Checkout screen.', 'Tap one product tile, then tap a different one.', 'Tap the Dragon Egg tile, then the Keyring tile.'], reveal: gridItemSpot('train-v-egg') },
  ],
  check2: [
    { id: 'change-mind', title: 'The customer changed their mind. Take the Red Dragon out of the cart', until: { kind: 'state', test: s => s.lines <= 1 }, inject: [{ kind: 'cart', items: [{ variantId: 'train-v-bee', qty: 1 }, { variantId: 'train-v-dragon', qty: 1 }] }], taughtBy: 'g-remove',
      ladder: ['The cart lists everything that has been added.', 'A line can be removed from the cart.', 'Swipe the Red Dragon line to the left, then tap Remove.'], reveal: cartLineSpot('train-v-dragon'), via: SPOT.cartOpen },
  ],
  recap: ['You can add items to a sale from the grid.', 'You can take an item out of the cart.', 'You know where Hint and Exit are when you get stuck.'],
};
