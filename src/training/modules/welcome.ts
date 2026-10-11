// Location: src/training/modules/welcome.ts
// "How training works": small, but it uses every stage, so the whole engine can be tried before the real courses arrive.
import type { TrainingModule } from '../../lib/trainingModule';
import { SPOT, cartLineSpot, gridItemSpot } from '../../lib/trainingSpots';

export const welcome: TrainingModule = {
  id: 'welcome', title: 'How training works', summary: 'A five minute tour of the course format. Start here if you have never used training before.', minutes: 5, suggestedFirst: true,
  flow: 'standard', tabs: ['checkout'], routes: ['cart'],
  info: {
    actors: [
      { id: 'you', icon: 'person', label: 'You', x: 12, y: 62 }, { id: 'course', icon: 'school', label: 'A course', x: 50, y: 28 },
      { id: 'parts', icon: 'list', label: 'Six parts', x: 50, y: 62, hidden: true }, { id: 'hint', icon: 'help-circle', label: 'Hint', x: 30, y: 62, hidden: true },
      { id: 'tick', icon: 'checkmark-circle', label: 'Green tick', x: 88, y: 62, hidden: true },
    ],
    beats: [
      { id: 'what', say: 'Training is a short course for one job at the till, like taking a payment. Pick any course, in any order.', pulse: ['course'] },
      { id: 'parts', say: 'Each course has six parts: Info, Show, Guide, two Checks, and a finish.', show: ['parts'], pulse: ['parts'] },
      { id: 'practice', say: 'In Guide and Check you use the real till with practice data. Nothing is saved, sent or charged.', place: { you: { x: 40 } }, pulse: ['you'] },
      { id: 'hints', say: 'Stuck in a Check? Tap Hint. You get a small pointer first, then a clearer one, and in the end the answer is shown.', show: ['hint'], pulse: ['hint'] },
      { id: 'tick', say: 'Finish both Checks and the course gets a green tick next to your name.', show: ['tick'], tone: { tick: 'good' }, pulse: ['tick'] },
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
