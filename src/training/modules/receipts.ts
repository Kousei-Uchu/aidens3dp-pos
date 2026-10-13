// Location: src/training/modules/receipts.ts
// "Finish a sale and send the receipt": the Receipt window after a card sale: Email, Text, Share, the QR code, the "Not published yet" note, and No receipt.
// The card is taken automatically (the card course teaches that). In practice nothing is sent: Email, Text and Share only say what would have opened,
// and the QR page always says "Not published yet" because uploads are switched off in training.
import type { TrainingModule } from '../../lib/trainingModule';
import { SPOT, gridItemSpot } from '../../lib/trainingSpots';

const BEE = 'train-v-bee'; const EGG = 'train-v-egg'; const KEY = 'train-v-key';
const has = (s: { cart: { variantId?: string }[] }, id: string): boolean => s.cart.some(l => l.variantId === id);
const NOT_CARD = ['cash', 'gift_card', 'exchange_credit'];
/** This course takes card payments. A Cash, Gift card or Split choice is closed again, and a sale already paid another way can only be started again. */
const wrongWays = [
  { id: 'wrong-way-open', when: (s: { payOpen?: string }) => !!s.payOpen, say: 'This part needs a card payment. Close this window, then tap Card.', target: SPOT.sheetClose, how: ['Tap Close at the top of the window.', 'Tap Card on the Payment page.'], taughtIn: 'welcome' },
  { id: 'wrong-way-done', when: (s: { lastSaleKinds?: string[] }) => !!s.lastSaleKinds?.some(k => NOT_CARD.includes(k)), say: 'That sale was paid another way. Tap Start this part again.', fix: 'restart' as const, how: ['Tap Start this part again.'] },
];
const place = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: false };
const placeWin = { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: true };
/** The sale has finished and the Receipt window is closed. */
const closed = (s: { sales: number; sheets: number }): boolean => s.sales >= 1 && s.sheets === 0;

export const receipts: TrainingModule = {
  id: 'receipts', title: 'Finish a sale and send the receipt', summary: 'After a sale, send the customer their receipt by email, text, share or QR code, or send none. Six minutes with practice data, nothing is sent.', minutes: 6,
  flow: 'standard', card: 'auto', tabs: ['checkout'], routes: ['cart', 'pay'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 20, w: 560, h: 34, label: 'Finish a sale and send the receipt', size: 22, align: 'center' },
        { id: 'in-sub', kind: 'text', x: 60, y: 58, w: 520, h: 40, label: 'When a sale is paid, a Receipt window opens. The sale is already saved. This is only the customer\'s copy.', size: 13, align: 'center', hidden: true },
        { id: 'c-link', kind: 'panel', x: 40, y: 108, w: 270, h: 96, label: 'EMAIL OR TEXT', hidden: true },
        { id: 'i-link', kind: 'icon', x: 52, y: 138, w: 44, h: 44, icon: 'mail', tone: 'accent', size: 34, hidden: true },
        { id: 't-link', kind: 'text', x: 104, y: 130, w: 198, h: 66, label: 'Send a link', sub: 'Opens Mail or Messages with the receipt ready.', size: 15, hidden: true },
        { id: 'c-qr', kind: 'panel', x: 330, y: 108, w: 270, h: 96, label: 'QR CODE', hidden: true },
        { id: 'i-qr', kind: 'icon', x: 342, y: 138, w: 44, h: 44, icon: 'qr-code', tone: 'accent', size: 34, hidden: true },
        { id: 't-qr', kind: 'text', x: 394, y: 130, w: 198, h: 66, label: 'Scan it', sub: 'The customer scans it with their phone camera.', size: 15, hidden: true },
        { id: 'c-share', kind: 'panel', x: 40, y: 216, w: 270, h: 96, label: 'SHARE', hidden: true },
        { id: 'i-share', kind: 'icon', x: 52, y: 246, w: 44, h: 44, icon: 'share', tone: 'accent', size: 34, hidden: true },
        { id: 't-share', kind: 'text', x: 104, y: 238, w: 198, h: 66, label: 'Any app', sub: 'AirDrop, WhatsApp or whatever the customer uses.', size: 15, hidden: true },
        { id: 'c-none', kind: 'panel', x: 330, y: 216, w: 270, h: 96, label: 'NO RECEIPT', hidden: true },
        { id: 'i-none', kind: 'icon', x: 342, y: 246, w: 44, h: 44, icon: 'close-circle', tone: 'accent', size: 34, hidden: true },
        { id: 't-none', kind: 'text', x: 394, y: 238, w: 198, h: 66, label: 'Skip it', sub: 'Closes the window and clears the cart.', size: 15, hidden: true },
        { id: 'c-pub', kind: 'panel', x: 40, y: 324, w: 560, h: 60, label: 'NOT PUBLISHED YET', hidden: true },
        { id: 'i-pub', kind: 'icon', x: 52, y: 338, w: 36, h: 36, icon: 'cloud-offline', tone: 'accent', size: 28, hidden: true },
        { id: 't-pub', kind: 'text', x: 98, y: 338, w: 490, h: 40, label: 'If the iPad cannot reach the receipt server, the page goes live later, once it can.', size: 13, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', title: 'The customer\'s copy', say: 'As soon as a sale is paid, the Receipt window opens. The sale is already saved. The window only decides how the customer gets their copy.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub', note: 'Sale is saved' },
      { id: 'links', title: 'Email or text', say: 'Email link and Text link open Mail or Messages with the receipt ready. If the sale has a customer, their address or number is filled in.', set: { 'c-link': { hidden: false }, 'i-link': { hidden: false }, 't-link': { hidden: false } }, focus: 'c-link', note: 'Quick and clear' },
      { id: 'qr', title: 'QR code', say: 'Show QR code puts a code on the screen. The customer scans it with their phone camera and the receipt page opens.', set: { 'c-qr': { hidden: false }, 'i-qr': { hidden: false }, 't-qr': { hidden: false } }, focus: 'c-qr', note: 'Nothing to type' },
      { id: 'share', title: 'Share', say: 'Share opens the iPad share sheet, so you can send the receipt through any app the customer prefers.', set: { 'c-share': { hidden: false }, 'i-share': { hidden: false }, 't-share': { hidden: false } }, focus: 'c-share', note: 'Their choice' },
      { id: 'none', title: 'No receipt', say: 'Many customers want nothing. Tap No receipt and the window closes. The sale stays saved either way.', set: { 'c-none': { hidden: false }, 'i-none': { hidden: false }, 't-none': { hidden: false } }, focus: 'c-none', note: 'Always allowed' },
      { id: 'pub', title: 'Not published yet', say: 'A receipt is a web page. If the iPad is offline, the QR code says Not published yet. The page goes live as soon as the iPad is back online.', set: { 'c-pub': { hidden: false }, 'i-pub': { hidden: false }, 't-pub': { hidden: false } }, focus: 'c-pub', note: 'It is not lost' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'receipt', nodes: [
        { id: 'bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Payment', sub: 'Practice data' },
        { id: 'sheet', kind: 'panel', x: 110, y: 46, w: 420, h: 310, label: 'RECEIPT' },
        { id: 'rc-name', kind: 'text', x: 130, y: 70, w: 380, h: 24, label: 'Thank you for shopping with us', size: 14, align: 'center' },
        { id: 'rc-total', kind: 'text', x: 130, y: 98, w: 380, h: 40, label: '$14.00', size: 28, align: 'center' },
        { id: 'rc-done', kind: 'text', x: 130, y: 138, w: 380, h: 20, label: 'Sale complete', size: 13, align: 'center' },
        { id: 'b-qr', kind: 'button', x: 150, y: 168, w: 340, h: 32, label: 'Show QR code', icon: 'qr-code' },
        { id: 'b-email', kind: 'button', x: 150, y: 204, w: 340, h: 32, label: 'Email link', icon: 'mail', tone: 'neutral' },
        { id: 'b-text', kind: 'button', x: 150, y: 240, w: 340, h: 32, label: 'Text link', icon: 'chatbubble', tone: 'neutral' },
        { id: 'b-share', kind: 'button', x: 150, y: 276, w: 340, h: 32, label: 'Share', icon: 'share', tone: 'neutral' },
        { id: 'b-none', kind: 'button', x: 150, y: 316, w: 340, h: 32, label: 'No receipt' },
        { id: 'qr-box', kind: 'icon', x: 270, y: 168, w: 100, h: 100, icon: 'qr-code', size: 90, hidden: true },
        { id: 'qr-note', kind: 'text', x: 150, y: 272, w: 340, h: 36, label: 'Not published yet. It goes live when this iPad can reach the receipt server.', size: 12, align: 'center', hidden: true },
        { id: 'qr-back', kind: 'button', x: 150, y: 316, w: 340, h: 32, label: 'Back', tone: 'neutral', hidden: true },
        { id: 'dock', kind: 'panel', x: 0, y: 366, w: 640, h: 34 },
        { id: 'dock-say', kind: 'text', x: 14, y: 370, w: 612, h: 26, label: 'The sale is paid. Choose how the customer gets a receipt.', size: 13 },
      ] },
    ],
    steps: [
      { id: 'complete', title: 'The window opens', say: 'The sale is paid and saved. This Receipt window only decides how the customer gets their copy.', focus: 'rc-total', note: 'Sale complete' },
      { id: 'email', title: 'Email link', say: 'Tap Email link. Mail opens with the receipt ready to send. If the sale has a customer, their address is already filled in.', tap: 'b-email', set: { 'dock-say': { label: 'Mail opens. Send it, then come back to the till.' } }, focus: 'b-email', note: 'Opens Mail' },
      { id: 'text', title: 'Text link', say: 'Text link does the same in Messages, with the customer\'s number if the sale has one.', tap: 'b-text', set: { 'dock-say': { label: 'Messages opens with the receipt ready.' } }, focus: 'b-text', note: 'Opens Messages' },
      { id: 'share', title: 'Share', say: 'Share opens the iPad share sheet, so the receipt can go through AirDrop, WhatsApp or any app the customer likes.', tap: 'b-share', set: { 'dock-say': { label: 'Choose any app from the share sheet.' } }, focus: 'b-share', note: 'Any app' },
      { id: 'qr', title: 'QR code', say: 'Show QR code puts a code on the screen. The customer scans it with their phone camera to open the receipt page.', tap: 'b-qr', set: { 'b-qr': { hidden: true }, 'b-email': { hidden: true }, 'b-text': { hidden: true }, 'b-share': { hidden: true }, 'b-none': { hidden: true }, 'qr-box': { hidden: false }, 'qr-back': { hidden: false }, 'dock-say': { label: 'The customer scans this with their camera.' } }, focus: 'qr-box', note: 'Scan me' },
      { id: 'unpublished', title: 'Not published yet', say: 'If the iPad could not reach the receipt server, it says Not published yet. The page is not lost: it goes live once the iPad is online. A link sent now will work then too.', set: { 'qr-note': { hidden: false }, 'dock-say': { label: 'Do not worry. It goes live when the iPad is online.' } }, focus: 'qr-note', note: 'Goes live later' },
      { id: 'back', title: 'Back to the choices', say: 'Tap Back to return to the choices. You can send it another way if the customer prefers.', tap: 'qr-back', set: { 'qr-box': { hidden: true }, 'qr-note': { hidden: true }, 'qr-back': { hidden: true }, 'b-qr': { hidden: false }, 'b-email': { hidden: false }, 'b-text': { hidden: false }, 'b-share': { hidden: false }, 'b-none': { hidden: false }, 'dock-say': { label: 'The customer does not want a receipt? Tap No receipt.' } }, focus: 'b-none', note: 'Your choices' },
      { id: 'none', title: 'No receipt', say: 'Tap No receipt. The window closes and the cart clears for the next customer. The sale stays saved.', tap: 'b-none', set: { sheet: { hidden: true }, 'rc-name': { hidden: true }, 'rc-total': { hidden: true }, 'rc-done': { hidden: true }, 'b-qr': { hidden: true }, 'b-email': { hidden: true }, 'b-text': { hidden: true }, 'b-share': { hidden: true }, 'b-none': { hidden: true }, 'dock-say': { label: 'Ready for the next customer.' } }, focus: 'bar', note: 'All clear' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will take a card sale on the real till with practice data, then send its receipt each way. Nothing is charged or sent. The practice terminal taps the card for you.', until: { kind: 'next' } },
    { id: 'g-add', target: gridItemSpot(BEE), say: 'First a sale. Tap the Bumble Bee tile to add it to the cart.', until: { kind: 'state', test: s => has(s, BEE) }, gesture: 'tap', allow: ['add'], recover: { say: 'On the Checkout tab, tap the Bumble Bee tile.', target: SPOT.tabCheckout }, at: { tabs: ['checkout'], routes: ['cart'], sheets: false } },
    { id: 'g-charge', target: SPOT.cartCharge, say: 'Tap Charge. On a phone, open the cart from the bar at the bottom first.', until: { kind: 'press', id: SPOT.cartCharge }, gesture: 'tap', allow: [], recover: { say: 'On a phone, tap the cart bar at the bottom of the screen, then tap Charge.', target: SPOT.cartOpen }, at: { tabs: ['checkout'], routes: ['cart'], sheets: false } },
    { id: 'g-card', target: SPOT.payCard, say: 'Tap Card. In this course the practice terminal taps the card for you.', until: { kind: 'press', id: SPOT.payCard }, gesture: 'tap', allow: ['tender'], recover: { say: 'Tap Charge to open the Payment page, then tap Card.', target: SPOT.cartCharge }, at: { tabs: ['checkout'], routes: ['pay'], sheets: false }, watch: [wrongWays[0]] },
    { id: 'g-wait', say: 'Wait a moment while the terminal approves the card. The Receipt window opens by itself.', until: { kind: 'visible', id: SPOT.receiptNone }, allow: ['tender', 'sale'], at: placeWin, watch: [wrongWays[1]] },
    { id: 'g-window', target: SPOT.receiptNone, say: 'This is the Receipt window. The sale is already saved. These buttons only decide how the customer gets their copy. You will try each one.', until: { kind: 'next' }, allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-email', target: SPOT.receiptEmail, say: 'Tap Email link. On a real till Mail opens with the receipt ready. In practice it only tells you so.', until: { kind: 'press', id: SPOT.receiptEmail }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-text', target: SPOT.receiptText, say: 'Tap Text link. Messages would open the same way.', until: { kind: 'press', id: SPOT.receiptText }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-share', target: SPOT.receiptShare, say: 'Tap Share. This opens the iPad share sheet, for AirDrop, WhatsApp or any other app.', until: { kind: 'press', id: SPOT.receiptShare }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-qr', target: SPOT.receiptQr, say: 'Tap Show QR code. A customer scans this with their phone camera.', until: { kind: 'press', id: SPOT.receiptQr }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-unpublished', target: SPOT.receiptQrBack, say: 'Read the note under the code: Not published yet. The receipt page goes live as soon as the iPad can reach the receipt server, so it is not lost. Tap Back to return.', until: { kind: 'press', id: SPOT.receiptQrBack }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-none', target: SPOT.receiptNone, say: 'Many customers want no receipt. Tap No receipt to close the window and clear the cart.', until: { kind: 'state', test: closed }, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'g-done', say: 'The cart is clear and the till is ready for the next customer. A sale is saved whichever receipt you choose, or none.', until: { kind: 'next' }, at: { tabs: ['checkout'], routes: ['cart', 'pay'], sheets: false } },
  ],
  check1: [
    { id: 'send-email', title: 'Take a card payment for the sale in the cart, then choose Email link', until: { kind: 'press', id: SPOT.receiptEmail }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }],
      ladder: ['The cart is ready to be paid. The receipt comes after the payment.', 'When the sale is paid, a Receipt window opens with the choices.', 'Tap Charge, then Card, then wait for the window and tap Email link.'], reveal: SPOT.receiptEmail, via: SPOT.payCard, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin, watch: wrongWays },
    { id: 'send-text', title: 'The customer would rather have it by text. Choose Text link', until: { kind: 'press', id: SPOT.receiptText },
      ladder: ['The Receipt window is still open.', 'One button opens Messages.', 'Tap Text link.'], reveal: SPOT.receiptText, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'send-none', title: 'Finish the sale with no receipt', until: { kind: 'state', test: closed },
      ladder: ['The sale is paid. Only the window is left.', 'The button at the bottom closes it.', 'Tap No receipt.'], reveal: SPOT.receiptNone, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
  ],
  check2: [
    { id: 'qr-not-live', title: 'Take a card payment. The customer wants to scan a QR code, but it will say Not published yet. Send it by text instead', until: { kind: 'press', id: SPOT.receiptText }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: KEY, qty: 1 }] }], taughtBy: 'unpublished',
      ladder: ['Try the QR code first and read what the page says.', 'Not published yet means the page is not live. You do not have to wait for it.', 'Go Back, then tap Text link.'], reveal: SPOT.receiptText, via: SPOT.payCard, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin, watch: wrongWays },
    { id: 'share-it', title: 'The customer asks for it through their messaging app. Use Share', until: { kind: 'press', id: SPOT.receiptShare },
      ladder: ['The Receipt window is still open.', 'One button lets the customer pick any app.', 'If you are on the QR page, tap Back, then tap Share.'], reveal: SPOT.receiptShare, via: SPOT.receiptQrBack, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
    { id: 'close-it', title: 'They have changed their mind and want nothing. Close the sale with No receipt', until: { kind: 'state', test: closed },
      ladder: ['The sale is paid. Only the window is left.', 'The button at the bottom closes it.', 'Tap No receipt.'], reveal: SPOT.receiptNone, gesture: 'tap', allow: ['tender', 'sale'], at: placeWin },
  ],
  recap: ['You know the sale is saved before the Receipt window opens, so the receipt is only the customer\'s copy.', 'You can send it by Email link, Text link, Share or a QR code, or send none.', 'You know Not published yet means the page goes live once the iPad is online, and that the sale is not lost.'],
};
