// Location: src/training/modules/sign-in.ts
// "Sign in, lock and switch staff": PIN or cashier pass, the Switch staff tile, and Lock POS.
// Runs with two practice staff (Casey, a cashier, PIN 1234; Morgan, a manager, PIN 2468 and a cashier pass). See `practiceStaff` in trainingSandbox.ts.
import type { TrainingModule } from '../../lib/trainingModule';
import { SPOT, gridActionSpot } from '../../lib/trainingSpots';
import { PRACTICE_CASEY, PRACTICE_MORGAN } from '../../lib/trainingSandbox';

const SWITCH = gridActionSpot('switch_staff'); const LOCK = gridActionSpot('lock_pos');
const caseyIn = (s: { staffId?: string; locked?: boolean }): boolean => s.staffId === PRACTICE_CASEY && !s.locked;
const morganIn = (s: { staffId?: string; locked?: boolean }): boolean => s.staffId === PRACTICE_MORGAN && !s.locked;

export const signIn: TrainingModule = {
  id: 'sign-in', title: 'Sign in, lock and switch staff', summary: 'Sign in with a PIN or a cashier pass, hand the till to a colleague, and lock it when you step away. Six minutes with practice data.', minutes: 6, suggestedFirst: false,
  flow: 'standard', practiceStaff: true, tabs: ['checkout'], routes: [],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 20, w: 560, h: 34, label: 'Signing in', size: 22, align: 'center' },
        { id: 'ppl', kind: 'panel', x: 40, y: 70, w: 260, h: 136, label: 'EVERYONE HAS A NAME', hidden: true },
        { id: 'p1', kind: 'row', x: 52, y: 96, w: 236, h: 42, icon: 'person', label: 'Casey', sub: 'Cashier', hidden: true },
        { id: 'p2', kind: 'row', x: 52, y: 146, w: 236, h: 42, icon: 'person', label: 'Morgan', sub: 'Manager', hidden: true },
        { id: 'ways', kind: 'panel', x: 330, y: 70, w: 270, h: 136, label: 'TWO WAYS IN', hidden: true },
        { id: 'w-pin', kind: 'button', x: 346, y: 100, w: 112, h: 44, label: 'PIN', icon: 'keypad', tone: 'neutral', hidden: true },
        { id: 'w-pass', kind: 'button', x: 470, y: 100, w: 116, h: 44, label: 'Pass', icon: 'qr-code', tone: 'neutral', hidden: true },
        { id: 'w-note', kind: 'text', x: 346, y: 152, w: 240, h: 44, label: 'A PIN is keyed in. A pass is scanned.', size: 12, hidden: true },
        { id: 'away', kind: 'panel', x: 40, y: 224, w: 560, h: 118, label: 'WHEN YOU STEP AWAY', hidden: true },
        { id: 'away-icon', kind: 'icon', x: 56, y: 258, w: 48, h: 48, icon: 'lock-closed', tone: 'accent', hidden: true },
        { id: 'away-text', kind: 'text', x: 116, y: 252, w: 470, h: 44, label: 'Lock POS puts the till on the Sign in screen. The sale in the cart is kept.', size: 14, hidden: true },
        { id: 'away-chip', kind: 'chip', x: 116, y: 302, w: 150, h: 28, label: 'Cart kept', tone: 'good', hidden: true },
        { id: 'role-text', kind: 'text', x: 40, y: 354, w: 560, h: 30, label: 'Your role decides which menus you can open.', size: 13, align: 'center', hidden: true },
      ] },
    ],
    steps: [
      { id: 'who', title: 'Who is at the till', say: 'Each person who works the till has their own name and role. Signing in tells the till who is working, so each sale carries the right name.', set: { ppl: { hidden: false }, p1: { hidden: false }, p2: { hidden: false } }, focus: 'ppl', note: 'One name each' },
      { id: 'ways', title: 'Two ways in', say: 'You sign in with a PIN, or by scanning your cashier pass. Both take a second, and both lead to the same place.', set: { ways: { hidden: false }, 'w-pin': { hidden: false }, 'w-pass': { hidden: false }, 'w-note': { hidden: false } }, focus: 'ways', note: 'PIN or pass' },
      { id: 'away', title: 'Stepping away', say: 'Lock POS hides the till behind the Sign in screen. Whatever is in the cart waits there until someone signs back in.', set: { away: { hidden: false }, 'away-icon': { hidden: false }, 'away-text': { hidden: false }, 'away-chip': { hidden: false } }, focus: 'away', note: 'Nothing is lost' },
      { id: 'role', title: 'Your role', say: 'Your role is set when you are added. A cashier sees the selling screens. A manager or owner sees more of the menus.', set: { 'role-text': { hidden: false }, p1: { tone: 'accent' } }, focus: 'role-text', note: 'Roles differ' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'checkout', nodes: [
        { id: 'co-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Checkout', sub: 'Practice data' },
        { id: 'tile-staff', kind: 'tile', x: 14, y: 56, w: 104, h: 82, icon: 'person-circle', label: 'Casey', sub: 'Cashier', color: '#DDD6FE' },
        { id: 'tile-lock', kind: 'tile', x: 126, y: 56, w: 104, h: 82, icon: 'lock-closed', label: 'Lock POS', color: '#E5E7EB' },
        { id: 'tile-bee', kind: 'tile', x: 14, y: 146, w: 104, h: 82, icon: 'bug', label: 'Bumble Bee', sub: '$8.00', color: '#FEF08A' },
        { id: 'tile-dragon', kind: 'tile', x: 126, y: 146, w: 104, h: 82, icon: 'flame', label: 'Red Dragon', sub: '$25.00', color: '#FED7AA' },
        { id: 'cart', kind: 'panel', x: 372, y: 52, w: 254, h: 250, label: 'CART' },
        { id: 'line-bee', kind: 'row', x: 380, y: 76, w: 238, h: 40, label: 'Bumble Bee', sub: '2 x $8.00', value: '$16.00' },
        { id: 'line-dragon', kind: 'row', x: 380, y: 116, w: 238, h: 40, label: 'Red Dragon', sub: '1 x $25.00', value: '$25.00' },
        { id: 'total', kind: 'row', x: 380, y: 224, w: 238, h: 34, label: 'Total', value: '$41.00' },
        { id: 'charge', kind: 'button', x: 380, y: 264, w: 238, h: 30, label: 'Charge', icon: 'card' },
        { id: 'dock', kind: 'panel', x: 0, y: 340, w: 640, h: 60 },
        { id: 'dock-say', kind: 'text', x: 14, y: 346, w: 600, h: 48, label: 'Tap the tile that names who is signed in.', size: 14 },
      ] },
      { id: 'switch', nodes: [
        { id: 'sw-sheet', kind: 'panel', x: 150, y: 20, w: 340, h: 316, label: 'Switch staff' },
        { id: 'sw-who', kind: 'text', x: 166, y: 56, w: 308, h: 36, label: 'Signed in as Casey (cashier). The next PIN or pass takes over.', size: 12 },
        { id: 'sw-pad', kind: 'panel', x: 190, y: 100, w: 260, h: 130, label: 'PIN PAD' },
        { id: 'sw-unlock', kind: 'button', x: 166, y: 242, w: 150, h: 36, label: 'Unlock' },
        { id: 'sw-scan', kind: 'button', x: 324, y: 242, w: 150, h: 36, label: 'Scan pass', icon: 'qr-code', tone: 'neutral' },
        { id: 'sw-lock', kind: 'button', x: 166, y: 288, w: 308, h: 32, label: 'Lock register', tone: 'neutral' },
      ] },
      { id: 'pass', nodes: [
        { id: 'ps-sheet', kind: 'panel', x: 150, y: 20, w: 340, h: 316, label: 'Scan your cashier pass' },
        { id: 'ps-card', kind: 'panel', x: 180, y: 64, w: 280, h: 150, label: 'PRACTICE PASS' },
        { id: 'ps-name', kind: 'text', x: 196, y: 88, w: 248, h: 28, label: 'Morgan', size: 20 },
        { id: 'ps-role', kind: 'text', x: 196, y: 118, w: 248, h: 20, label: 'Manager', size: 13, tone: 'neutral' },
        { id: 'ps-bars', kind: 'icon', x: 196, y: 146, w: 248, h: 56, icon: 'barcode', size: 52 },
        { id: 'ps-scan', kind: 'button', x: 180, y: 232, w: 280, h: 40, label: 'Scan this pass', icon: 'scan' },
        { id: 'ps-ok', kind: 'chip', x: 180, y: 284, w: 280, h: 28, label: 'Signed in as Morgan', tone: 'good', hidden: true },
      ] },
      { id: 'locked', nodes: [
        { id: 'lk-title', kind: 'text', x: 120, y: 30, w: 400, h: 36, label: 'Sign in', size: 26, align: 'center' },
        { id: 'lk-dots', kind: 'text', x: 120, y: 76, w: 400, h: 34, label: '. . . .', size: 24, align: 'center', hidden: true },
        { id: 'lk-pad', kind: 'panel', x: 230, y: 120, w: 180, h: 130, label: 'PIN PAD' },
        { id: 'lk-unlock', kind: 'button', x: 230, y: 260, w: 180, h: 34, label: 'Unlock' },
        { id: 'lk-scan', kind: 'button', x: 230, y: 300, w: 180, h: 34, label: 'Scan pass', icon: 'qr-code', tone: 'neutral' },
        { id: 'lk-err', kind: 'text', x: 120, y: 344, w: 400, h: 40, label: 'That pass is not recognised. It may have been cancelled or replaced.', size: 12, align: 'center', tone: 'bad', hidden: true },
      ] },
    ],
    steps: [
      { id: 'tile', title: 'The staff tile', say: 'This tile names whoever is signed in. Tap it to hand the till to someone else without locking it.', focus: 'tile-staff', note: 'Who is signed in' },
      { id: 'open', title: 'Switch staff', say: 'A window opens. The sale in the cart is not touched by anything you do in it.', tap: 'tile-staff', screen: 'switch', focus: 'sw-sheet', note: 'Cart stays as it is' },
      { id: 'pass', title: 'Scan a pass', say: 'Tap Scan pass, then hold the cashier pass under the scanner or the camera.', tap: 'sw-scan', screen: 'pass', focus: 'ps-card', note: 'A cashier pass' },
      { id: 'scanned', title: 'Signed in', say: 'The pass is read and the new person is signed in straight away. No PIN is needed.', tap: 'ps-scan', set: { 'ps-ok': { hidden: false } }, focus: 'ps-ok', note: 'Morgan is in' },
      { id: 'keep', title: 'The cart stays', say: 'The tile now names Morgan, and the cart is exactly as it was. Switching staff never clears a sale.', screen: 'checkout', set: { 'tile-staff': { label: 'Morgan', sub: 'Manager' }, 'dock-say': { label: 'Same cart, new person signed in.' } }, focus: 'cart', note: 'Same sale' },
      { id: 'lock', title: 'Lock POS', say: 'Stepping away? Tap Lock POS. The Sign in screen covers the till, and the cart waits behind it.', tap: 'tile-lock', screen: 'locked', focus: 'lk-title', note: 'Till is hidden' },
      { id: 'pin', title: 'Key your PIN', say: 'To sign back in, key your PIN. It signs in by itself on the fourth digit, or tap Unlock.', tap: 'lk-pad', set: { 'lk-dots': { hidden: false } }, focus: 'lk-dots', note: 'PIN dots' },
      { id: 'show-fail', title: 'A pass that fails', say: 'If a pass says it is not recognised, it may have been cancelled or replaced. Do not keep scanning it.', tap: 'lk-scan', set: { 'lk-err': { hidden: false } }, focus: 'lk-err', note: 'Not recognised' },
      { id: 'show-fallback', title: 'Use your PIN', say: 'Key your PIN instead, which always works. Ask a manager or owner for a new pass.', tap: 'lk-pad', set: { 'lk-err': { hidden: true } }, focus: 'lk-pad', note: 'PIN always works' },
    ],
  },
  guide: [
    { id: 'g-who', say: 'The Casey tile names who is signed in. This practice till starts with Casey, a cashier.', target: SWITCH, until: { kind: 'next' } },
    { id: 'g-open', say: 'Tap the Casey tile to hand the till to someone else without locking it.', target: SWITCH, until: { kind: 'visible', id: SPOT.loginPinpad }, gesture: 'tap', recover: { say: 'Open the Checkout tab, then tap the tile that names who is signed in.', target: SPOT.tabCheckout } },
    { id: 'g-pass-open', say: 'Morgan has a cashier pass. Tap Scan pass.', target: SPOT.loginScanPass, until: { kind: 'visible', id: SPOT.passScan }, at: { sheets: true } },
    { id: 'g-pass-scan', say: 'On a real till you hold the pass under the scanner. Here, tap Scan this pass.', target: SPOT.passScan, until: { kind: 'state', test: morganIn }, gesture: 'tap', allow: [], at: { sheets: true } },
    { id: 'g-keep-cart', say: 'The tile now names Morgan. Switching never clears the cart, so a sale in progress carries straight on.', target: SWITCH, until: { kind: 'next' } },
    { id: 'g-lock', say: 'Stepping away? Tap Lock POS to cover the till with the Sign in screen.', target: LOCK, until: { kind: 'state', test: s => !!s.locked }, gesture: 'tap', allow: [] },
    { id: 'g-pin-info', say: 'This is the Sign in screen. Anyone can use it with a PIN or a pass. A wrong PIN clears and lets you try again.', target: SPOT.loginPinpad, until: { kind: 'next' } },
    { id: 'g-pin', say: 'Key the practice cashier PIN: 1 2 3 4. It signs in on the fourth digit, or tap Unlock.', target: SPOT.loginPinpad, until: { kind: 'state', test: caseyIn }, gesture: 'tap', allow: [] },
    { id: 'g-fallback', say: 'A pass that will not scan, or is not recognised, may have been cancelled or replaced. Key your PIN instead, and ask a manager or owner for a new pass.', until: { kind: 'next' } },
  ],
  check1: [
    { id: 'c1-pass', title: 'Switch the till to Morgan with their cashier pass', until: { kind: 'state', test: morganIn }, inject: [{ kind: 'staff', who: 'casey' }], ladder: ['Look at the grid for the tile that names who is signed in.', 'Tap that tile to open the Switch staff window.', 'Tap Scan pass, then scan the practice pass.', 'In the pass window, tap Scan this pass.'], reveal: SWITCH, allow: [], at: { sheets: true } },
    { id: 'c1-lock', title: 'Morgan is stepping away. Lock the register', until: { kind: 'state', test: s => !!s.locked }, inject: [{ kind: 'staff', who: 'morgan' }], ladder: ['Look for a button that covers the till.', 'It is on the grid, next to the staff tile.', 'The tile is called Lock POS.'], reveal: LOCK, allow: [], at: { sheets: true } },
    { id: 'c1-pin', title: 'Sign in as Casey. Casey\'s PIN is 1234', until: { kind: 'state', test: caseyIn }, inject: [{ kind: 'staff', who: 'locked' }], ladder: ['The till is on the Sign in screen.', 'Use the PIN pad.', 'Key 1 2 3 4. It signs in on the fourth digit.', 'Tap 1, then 2, then 3, then 4.'], reveal: SPOT.loginPinpad, allow: [], at: { sheets: true } },
  ],
  check2: [
    { id: 'c2-cancelled', title: 'Sign in as Morgan, whose pass has been cancelled. Morgan\'s PIN is 2468', until: { kind: 'state', test: morganIn }, inject: [{ kind: 'staff', who: 'locked' }, { kind: 'pass', state: 'cancelled' }], taughtBy: 'g-fallback', ladder: ['The pass will not work. Look for another way in.', 'The Sign in screen also takes a PIN.', 'Key Morgan\'s PIN: 2 4 6 8.', 'Tap 2, then 4, then 6, then 8.'], reveal: SPOT.loginPinpad, allow: [], at: { sheets: true } },
    { id: 'c2-mid-sale', title: 'A sale is in progress and Morgan needs the till. Switch to Morgan without losing the cart', until: { kind: 'state', test: s => morganIn(s) && s.lines >= 2 }, inject: [{ kind: 'staff', who: 'casey' }, { kind: 'cart', items: [{ variantId: 'train-v-bee', qty: 2 }, { variantId: 'train-v-dragon', qty: 1 }] }], taughtBy: 'g-keep-cart', ladder: ['You do not need to lock the till to hand it over.', 'Tap the tile that names who is signed in.', 'Morgan has a cashier pass. Tap Scan pass.', 'Tap Scan this pass. The cart stays.'], reveal: SWITCH, allow: [], at: { sheets: true },
      watch: [{ id: 'cart-lost', when: s => s.lines < 2, say: 'The cart lost an item. Switching staff never does that, so something was removed. Tap Start this part again.', how: ['Tap Start this part again.', 'Switch staff from the grid tile, not from the cart.'] }] },
  ],
  recap: ['You sign in with a PIN, or by scanning your cashier pass.', 'You switch staff from the grid tile, and the sale in the cart carries on.', 'You lock the till when you step away, and key your PIN if a pass will not scan.'],
};
