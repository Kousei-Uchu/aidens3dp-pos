// Location: src/training/modules/scanning.ts
// "Scan items": the camera and the Bluetooth scanner, the green and red messages, a torn label that will not read, and a gift card scanned by mistake.
// In practice a window of drawn practice barcodes stands in for the camera (src/ui/PracticeScan.tsx, src/lib/trainingScan.ts), because a camera cannot scan an item that is not real.
// A cashier pass is taught in Info and Show only: on the Checkout screen a scanned pass signs that person in, and practice never changes who is signed in on the real till.
import type { TrainingModule } from '../../lib/trainingModule';
import { SPOT, cartLineSpot, gridItemSpot, scanCardSpot } from '../../lib/trainingSpots';

const BEE = 'train-v-bee'; const DRG = 'train-v-dragon'; const KEY = 'train-v-key'; const STK = 'train-v-sticker';
const has = (s: { cart: { variantId?: string }[] }, id: string): boolean => s.cart.some(l => l.variantId === id);
const qtyOf = (s: { cart: { variantId?: string; qty: number }[] }, id: string): number => s.cart.filter(l => l.variantId === id).reduce((n, l) => n + l.qty, 0);
const place = { tabs: ['checkout'], routes: ['cart'], sheets: false };
const placeWin = { tabs: ['checkout'], routes: ['cart'], sheets: true };
const placePay = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: true };
const phoneCart = { say: 'On a phone, tap the cart bar at the bottom of the screen to see the cart.', target: SPOT.cartOpen };
const reopen = { say: 'Tap the barcode button next to Search to open the camera again.', target: SPOT.scanCamera };

export const scanning: TrainingModule = {
  id: 'scanning', title: 'Scan items', summary: 'Scan items into the cart with the camera or a Bluetooth scanner, read the green and red messages, and handle a torn label and a gift card. Six minutes with practice barcodes.', minutes: 6,
  flow: 'standard', tabs: ['checkout'], routes: ['cart', 'pay'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 20, w: 560, h: 34, label: 'Scan items', size: 22, align: 'center' },
        { id: 'in-sub', kind: 'text', x: 60, y: 58, w: 520, h: 40, label: 'A scan is the quickest way to add an item. Your job is to know what each scan does.', size: 13, align: 'center', hidden: true },
        { id: 'c-item', kind: 'panel', x: 40, y: 108, w: 176, h: 112, label: 'ITEM BARCODE', hidden: true },
        { id: 'i-item', kind: 'icon', x: 50, y: 142, w: 40, h: 40, icon: 'barcode-outline', tone: 'accent', size: 32, hidden: true },
        { id: 't-item', kind: 'text', x: 96, y: 134, w: 112, h: 76, label: 'Adds one', sub: 'to the cart.', size: 15, hidden: true },
        { id: 'c-pass', kind: 'panel', x: 232, y: 108, w: 176, h: 112, label: 'CASHIER PASS', hidden: true },
        { id: 'i-pass', kind: 'icon', x: 242, y: 142, w: 40, h: 40, icon: 'person-circle-outline', tone: 'accent', size: 32, hidden: true },
        { id: 't-pass', kind: 'text', x: 288, y: 134, w: 112, h: 76, label: 'Signs in', sub: 'that person.', size: 15, hidden: true },
        { id: 'c-gift', kind: 'panel', x: 424, y: 108, w: 176, h: 112, label: 'GIFT CARD QR', hidden: true },
        { id: 'i-gift', kind: 'icon', x: 434, y: 142, w: 40, h: 40, icon: 'gift-outline', tone: 'accent', size: 32, hidden: true },
        { id: 't-gift', kind: 'text', x: 480, y: 134, w: 112, h: 76, label: 'Not an item', sub: 'Take it at Charge.', size: 15, hidden: true },
        { id: 'c-bt', kind: 'panel', x: 40, y: 232, w: 270, h: 96, label: 'BLUETOOTH SCANNER', hidden: true },
        { id: 'i-bt', kind: 'icon', x: 52, y: 262, w: 44, h: 44, icon: 'bluetooth', tone: 'accent', size: 34, hidden: true },
        { id: 't-bt', kind: 'text', x: 104, y: 254, w: 198, h: 66, label: 'Scan, and it goes in', sub: 'No window to open.', size: 15, hidden: true },
        { id: 'c-cam', kind: 'panel', x: 330, y: 232, w: 270, h: 96, label: 'CAMERA', hidden: true },
        { id: 'i-cam', kind: 'icon', x: 342, y: 262, w: 44, h: 44, icon: 'camera-outline', tone: 'accent', size: 34, hidden: true },
        { id: 't-cam', kind: 'text', x: 394, y: 254, w: 198, h: 66, label: 'Opens a window', sub: 'It stays open. Tap Done.', size: 15, hidden: true },
        { id: 'c-res', kind: 'panel', x: 40, y: 340, w: 560, h: 52, label: 'GREEN OR RED', hidden: true },
        { id: 't-res', kind: 'text', x: 52, y: 362, w: 536, h: 26, label: 'Green means it worked. Red means no item matched. Nothing was added.', size: 13, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', title: 'Scanning is quick', say: 'A scan adds an item with no tapping or searching. The till understands three kinds of code, and each one does something different.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub', note: 'Know the three' },
      { id: 'kinds', title: 'Three kinds of code', say: 'An item barcode adds one of that item. A cashier pass signs that person in and leaves the cart alone. A gift card QR is not an item: it is taken at payment.', set: { 'c-item': { hidden: false }, 'i-item': { hidden: false }, 't-item': { hidden: false }, 'c-pass': { hidden: false }, 'i-pass': { hidden: false }, 't-pass': { hidden: false }, 'c-gift': { hidden: false }, 'i-gift': { hidden: false }, 't-gift': { hidden: false } }, focus: 'c-item', note: 'Each differs' },
      { id: 'bt', title: 'The Bluetooth scanner', say: 'A Bluetooth scanner types the code for you. With Checkout showing nothing on top, scan and the item goes straight in. There is no window.', set: { 'c-bt': { hidden: false }, 'i-bt': { hidden: false }, 't-bt': { hidden: false } }, focus: 'c-bt', note: 'No window' },
      { id: 'cam', title: 'The camera', say: 'The barcode button next to Search opens the camera in a window. It stays open so you can scan several items in a row, until you tap Done.', set: { 'c-cam': { hidden: false }, 'i-cam': { hidden: false }, 't-cam': { hidden: false } }, focus: 'c-cam', note: 'Tap Done' },
      { id: 'result', title: 'Green or red', say: 'After each camera scan a message appears. Green says what was added. Red says there was no item for that code, and nothing was added.', set: { 'c-res': { hidden: false }, 't-res': { hidden: false } }, focus: 'c-res', note: 'Read it' },
      { id: 'nothing', title: 'When nothing happens', say: 'If the scanner does nothing, a window is open on top of Checkout, or you were typing a moment ago. Close the window, wait a few seconds, and scan again.', set: { 'c-res': { label: 'IF NOTHING HAPPENS' }, 't-res': { label: 'A window is open, or you were just typing. Close it and try again.' } }, focus: 'c-res', note: 'Check the screen' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'checkout', nodes: [
        { id: 'bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Checkout', sub: 'Practice data' },
        { id: 'search', kind: 'field', x: 20, y: 52, w: 360, h: 40, label: 'Search items, customers, discounts' },
        { id: 'cam-icon', kind: 'icon', x: 392, y: 52, w: 44, h: 40, icon: 'barcode-outline', tone: 'accent', size: 28 },
        { id: 'cart', kind: 'panel', x: 20, y: 104, w: 400, h: 170, label: 'CART' },
        { id: 'l-bee', kind: 'row', x: 30, y: 128, w: 380, h: 40, label: 'Bumble Bee', sub: '1 x $8.00', value: '$8.00', hidden: true },
        { id: 'l-dragon', kind: 'row', x: 30, y: 172, w: 380, h: 40, label: 'Red Dragon', sub: '1 x $25.00', value: '$25.00', hidden: true },
        { id: 'l-key', kind: 'row', x: 30, y: 216, w: 380, h: 40, label: 'Keyring', sub: '1 x $5.00', value: '$5.00', hidden: true },
        { id: 'dock', kind: 'panel', x: 0, y: 366, w: 640, h: 34 },
        { id: 'dock-say', kind: 'text', x: 14, y: 370, w: 612, h: 26, label: 'The cart is empty. The camera button is next to Search.', size: 13 },
      ] },
      { id: 'cam', nodes: [
        { id: 'win', kind: 'panel', x: 110, y: 20, w: 420, h: 340, label: 'SCAN BARCODE' },
        { id: 'frame', kind: 'panel', x: 130, y: 52, w: 380, h: 190 },
        { id: 'frame-idle', kind: 'icon', x: 290, y: 116, w: 60, h: 60, icon: 'scan-outline', tone: 'accent', size: 46 },
        { id: 'sticker', kind: 'panel', x: 168, y: 84, w: 304, h: 90, hidden: true },
        { id: 'sticker-code', kind: 'icon', x: 186, y: 98, w: 96, h: 60, icon: 'barcode-outline', hidden: true },
        { id: 'sticker-name', kind: 'text', x: 292, y: 102, w: 166, h: 20, label: 'Bumble Bee', size: 14, hidden: true },
        { id: 'sticker-price', kind: 'text', x: 292, y: 124, w: 166, h: 18, label: '$8.00', size: 12, hidden: true },
        { id: 'sticker-scan', kind: 'text', x: 292, y: 146, w: 166, h: 16, label: 'Scanning...', size: 11, hidden: true },
        { id: 'res', kind: 'chip', x: 130, y: 254, w: 380, h: 32, label: 'Added Bumble Bee', tone: 'good', hidden: true },
        { id: 'done', kind: 'button', x: 130, y: 296, w: 380, h: 34, label: 'Done', tone: 'neutral' },
      ] },
    ],
    steps: [
      { id: 'open', title: 'Open the camera', say: 'The barcode button next to Search opens the camera in a window. It stays open so you can scan several items in a row.', tap: 'cam-icon', screen: 'cam', focus: 'win', note: 'Camera window', set: { 'dock-say': { label: 'The camera is open on top of Checkout.' } } },
      { id: 'scan-item', title: 'Hold a barcode up', say: 'Hold the item barcode in front of the camera. A sticker carrying the code comes into the frame, and a green message says what was added. Here it is the Bumble Bee.', set: { sticker: { hidden: false }, 'sticker-code': { hidden: false }, 'sticker-name': { label: 'Bumble Bee' }, 'sticker-price': { label: '$8.00' }, 'sticker-scan': { label: 'Scanning...' }, 'frame-idle': { hidden: true }, res: { hidden: false, label: 'Added Bumble Bee', tone: 'good' } }, focus: 'sticker', note: 'Green: added' },
      { id: 'scan-next', title: 'Scan the next', say: 'The camera is still open, so scan the next item straight away. Each scan adds one.', set: { 'sticker-name': { label: 'Red Dragon' }, 'sticker-price': { label: '$25.00' }, 'sticker-scan': { label: 'Scanning...' }, res: { label: 'Added Red Dragon', tone: 'good' } }, focus: 'res', note: 'One per scan' },
      { id: 'scan-pass', title: 'A cashier pass', say: 'A cashier pass is another kind of code. Scanned here, it signs that person in and leaves the cart exactly as it was.', set: { 'sticker-name': { label: 'Cashier pass' }, 'sticker-price': { label: '' }, 'sticker-scan': { label: 'Reading pass' }, res: { label: 'Signed in: Casey', tone: 'good' } }, focus: 'res', note: 'Signs in' },
      { id: 'scan-torn', title: 'A label that will not read', say: 'A torn label, or a code the shop does not have, turns the message red. Nothing is added. Add that item another way: search for it, or tap its tile.', set: { 'sticker-name': { label: 'Torn label' }, 'sticker-price': { label: '' }, 'sticker-scan': { label: 'No match' }, res: { label: 'Not found: 9300000009421', tone: 'bad' } }, focus: 'res', note: 'Red: add by hand' },
      { id: 'scan-gift', title: 'A gift card', say: 'A gift card is not an item, so it shows red here too. The till tells you to redeem it from Charge, then Gift card. That is where a customer pays with it.', set: { 'sticker-name': { label: 'Gift card' }, 'sticker-price': { label: '' }, 'sticker-scan': { label: 'No match' }, res: { label: 'Not an item. Take it at Charge', tone: 'bad' } }, focus: 'res', note: 'Pay at Charge' },
      { id: 'done', title: 'Tap Done', say: 'Tap Done to close the camera. The two items that scanned are in the cart. The pass signed a person in without touching the cart, and the torn label and the gift card added nothing.', tap: 'done', screen: 'checkout', set: { 'l-bee': { hidden: false }, 'l-dragon': { hidden: false }, 'dock-say': { label: 'Two items scanned. The red scans added nothing.' } }, focus: 'cart', note: 'Two added' },
      { id: 'bluetooth', title: 'The Bluetooth scanner', say: 'A Bluetooth scanner types the code for you. With nothing on top of Checkout, a scan goes straight in, with no window at all.', set: { 'l-key': { hidden: false } }, focus: 'l-key', note: 'No window' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will scan practice barcodes with the camera, see what the till says for each, and deal with two that do not work. All with practice data.', until: { kind: 'next' }, at: place },
    { id: 'g-camera', target: SPOT.scanCamera, say: 'Tap the barcode button next to Search. It opens the camera.', until: { kind: 'press', id: SPOT.scanCamera }, allow: [], at: place, recover: { say: 'On the Checkout tab, tap the barcode button next to Search.', target: SPOT.tabCheckout } },
    { id: 'g-window', target: scanCardSpot('bee'), say: 'This is the camera window. In practice, drawn barcodes stand in for the camera. Each card is a barcode, and Scan this plays the part of holding it up.', until: { kind: 'next' }, at: placeWin, recover: reopen },
    { id: 'g-bee', target: scanCardSpot('bee'), say: 'Scan the Bumble Bee: tap Scan this on its card.', until: { kind: 'press', id: scanCardSpot('bee') }, allow: ['add'], at: placeWin, recover: reopen },
    { id: 'g-added', target: SPOT.scanResult, say: 'Green: the till found the item and added one. The camera stays open, ready for the next scan.', until: { kind: 'next' }, at: placeWin, recover: reopen },
    { id: 'g-dragon', target: scanCardSpot('dragon'), say: 'Scan the Red Dragon too. Each scan adds one to the cart.', until: { kind: 'press', id: scanCardSpot('dragon') }, allow: ['add'], at: placeWin, recover: reopen },
    { id: 'g-torn', target: scanCardSpot('torn'), say: 'Now a Keyring with a torn label. Tap Scan this on it.', until: { kind: 'press', id: scanCardSpot('torn') }, allow: [], at: placeWin, recover: reopen },
    { id: 'g-notfound', target: SPOT.scanResult, say: 'Red: no item matched that code, so nothing was added. Do not keep scanning it. Close the camera and add the Keyring another way.', until: { kind: 'next' }, at: placeWin, recover: reopen },
    { id: 'g-gift-scan', target: scanCardSpot('gift'), say: 'A customer hands you their gift card. Tap Scan this on it, as if you had scanned it by mistake.', until: { kind: 'press', id: scanCardSpot('gift') }, allow: [], at: placeWin, recover: reopen },
    { id: 'g-gift', target: SPOT.scanResult, say: 'A gift card is not an item, so this is red too, and the till says to redeem it from Charge, then Gift card. A customer pays with a gift card at payment, never by scanning it here.', until: { kind: 'next' }, at: placeWin, recover: reopen },
    { id: 'g-close', target: SPOT.scanDone, say: 'Tap Done to close the camera.', until: { kind: 'press', id: SPOT.scanDone }, allow: [], at: placeWin, recover: reopen },
    { id: 'g-torn-fix', target: gridItemSpot(KEY), say: 'The torn label was a Keyring. Add it another way: tap the Keyring tile.', until: { kind: 'state', test: s => has(s, KEY) }, gesture: 'tap', allow: ['add'], at: place, recover: { say: 'On the Checkout tab, tap the Keyring tile.', target: SPOT.tabCheckout } },
    { id: 'g-cart', target: cartLineSpot(KEY), say: 'Three items: the Bumble Bee and Red Dragon from the camera, and the Keyring you added by hand when its label would not read. The torn label and the gift card added nothing. On a phone, open the cart from the bar at the bottom.', until: { kind: 'next' }, recover: phoneCart, at: place },
    { id: 'g-bt', say: 'A Bluetooth scanner works the same way with no window: with nothing on top of Checkout, scan and the item goes in. If it does nothing, a window is open, or you were typing a moment ago.', until: { kind: 'next' }, at: place },
    { id: 'g-end', say: 'You can scan items in, read green and red, add an item by hand when its label will not read, and send a gift card to Charge. A scanned cashier pass signs that person in, so only scan one to sign in.', until: { kind: 'next' }, at: place },
  ],
  check1: [
    { id: 'c1-dragon', title: 'Open the camera and scan the Red Dragon', until: { kind: 'press', id: scanCardSpot('dragon') },
      ladder: ['The camera is the barcode button next to Search.', 'In the camera window, find the Red Dragon card.', 'Tap Scan this on the Red Dragon card.'], reveal: scanCardSpot('dragon'), via: SPOT.scanCamera, gesture: 'tap', allow: ['add'], at: placeWin },
    { id: 'c1-two', title: 'Scan a Bumble Bee and a Sticker Pack, then tap Done', until: { kind: 'state', test: s => has(s, BEE) && has(s, STK) && s.sheets === 0 },
      ladder: ['Scan two different items, then close the camera.', 'The Bumble Bee and the Sticker Pack.', 'Tap Scan this on each of those two cards, then tap Done.'], reveal: scanCardSpot('bee'), via: SPOT.scanCamera, gesture: 'tap', allow: ['add'], at: placeWin },
    { id: 'c1-twice', title: 'The customer wants two Bumble Bees. Scan one more, then tap Done', until: { kind: 'state', test: s => qtyOf(s, BEE) >= 2 && s.sheets === 0 },
      ladder: ['Each scan adds one.', 'Scan the Bumble Bee again.', 'Open the camera, tap Scan this on the Bumble Bee, then tap Done.'], reveal: scanCardSpot('bee'), via: SPOT.scanCamera, gesture: 'tap', allow: ['add', 'qty'], at: placeWin },
  ],
  check2: [
    { id: 'c2-torn', title: 'A Keyring has a torn label and will not scan. Get the Keyring into the cart another way', until: { kind: 'state', test: s => has(s, KEY) }, inject: [{ kind: 'cart', items: [{ variantId: DRG, qty: 1 }] }], taughtBy: 'g-torn-fix',
      ladder: ['The camera cannot read a torn label.', 'Close the camera and use the grid or Search.', 'Tap the Keyring tile on the grid.'], reveal: gridItemSpot(KEY), via: SPOT.scanDone, gesture: 'tap', allow: ['add'], at: placeWin },
    { id: 'c2-gift', title: 'A customer wants to pay with their gift card. Take them to the right place to use it', until: { kind: 'state', test: s => s.payOpen === 'gift' }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }] }], taughtBy: 'g-gift',
      ladder: ['A gift card is not paid for with the scanner.', 'Gift cards are taken at payment, with cash and card.', 'Tap Charge, then Gift card.'], reveal: SPOT.payGift, via: SPOT.cartCharge, gesture: 'tap', allow: [], at: placePay },
  ],
  recap: ['A scan adds one of that item, so scan again for each one.', 'Green means it was added. Red means no item matched, and nothing was added.', 'A torn label or a missing barcode is not a dead end: add the item by search or by tile.', 'A gift card is never scanned as an item. Take it at Charge, then Gift card.'],
};
