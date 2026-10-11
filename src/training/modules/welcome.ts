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
    actors: [
      { id: 'a1', icon: 'book', label: 'Info', x: 10, y: 55 }, { id: 'a2', icon: 'eye', label: 'Show', x: 30, y: 55 }, { id: 'a3', icon: 'hand-left', label: 'Guide', x: 50, y: 55 },
      { id: 'a4', icon: 'checkbox', label: 'Checks', x: 70, y: 55 }, { id: 'a5', icon: 'trophy', label: 'Done', x: 90, y: 55 }, { id: 'dot', icon: 'ellipse', x: 10, y: 28, tone: 'accent' },
    ],
    beats: [
      { say: 'You start by reading what the job is and when you need it.', place: { dot: { x: 10 } }, pulse: ['a1'] },
      { say: 'Then you watch it happen as a simple picture.', place: { dot: { x: 30 } }, pulse: ['a2'] },
      { say: 'Then you do it on the real till, with arrows showing you where to tap.', place: { dot: { x: 50 } }, pulse: ['a3'] },
      { say: 'Then you do it alone, once when everything goes right and once when things go wrong.', place: { dot: { x: 70 } }, pulse: ['a4'] },
      { say: 'Get through both and you are done.', place: { dot: { x: 90 } }, tone: { dot: 'good', a5: 'good' }, pulse: ['a5'] },
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
