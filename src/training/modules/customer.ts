// Location: src/training/modules/customer.ts
// "Customers and notes": attach a customer to a sale (pick or search), create one on the spot, put a note on a line, and take the customer off.
// In practice a new customer is made on this iPad only (nothing goes to Shopify), and "Search Shopify" is hidden.
import type { TrainingModule } from '../../lib/trainingModule';
import { SPOT, cartLineSpot, customerRowSpot, gridItemSpot, lineNoteSpot } from '../../lib/trainingSpots';

const BEE = 'train-v-bee'; const EGG = 'train-v-egg'; const KEY = 'train-v-key';
const SAM = 'train-cu-1'; const PRIYA = 'train-cu-2'; const ALEX = 'train-cu-3';
const has = (s: { cart: { variantId?: string }[] }, id: string): boolean => s.cart.some(l => l.variantId === id);
const noted = (s: { cart: { variantId?: string; noted?: boolean }[] }, id: string): boolean => s.cart.some(l => l.variantId === id && !!l.noted);
const place = { tabs: ['checkout'], routes: ['cart'], sheets: false };
const placeWin = { tabs: ['checkout'], routes: ['cart'], sheets: true };
const phone = { say: 'On a phone, tap the cart bar at the bottom of the screen, then tap the customer row.', target: SPOT.cartOpen };

export const customer: TrainingModule = {
  id: 'customer', title: 'Customers and notes', summary: 'Attach a customer to a sale, create one who is not on the list, put a note on a line, and take the customer off. Six minutes with practice data.', minutes: 6,
  flow: 'standard', tabs: ['checkout'], routes: ['cart'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'overview', nodes: [
        { id: 'in-title', kind: 'text', x: 40, y: 20, w: 560, h: 34, label: 'Customers and notes', size: 22, align: 'center' },
        { id: 'in-sub', kind: 'text', x: 60, y: 58, w: 520, h: 40, label: 'A sale does not need a customer. Attach one when you want the sale kept with their name.', size: 13, align: 'center', hidden: true },
        { id: 'c-pick', kind: 'panel', x: 40, y: 108, w: 270, h: 96, label: 'PICK OR SEARCH', hidden: true },
        { id: 'i-pick', kind: 'icon', x: 52, y: 138, w: 44, h: 44, icon: 'people', tone: 'accent', size: 34, hidden: true },
        { id: 't-pick', kind: 'text', x: 104, y: 130, w: 198, h: 66, label: 'Find them', sub: 'Tap the customer row at the top of the cart.', size: 15, hidden: true },
        { id: 'c-new', kind: 'panel', x: 330, y: 108, w: 270, h: 96, label: 'NOT ON THE LIST', hidden: true },
        { id: 'i-new', kind: 'icon', x: 342, y: 138, w: 44, h: 44, icon: 'person-add', tone: 'accent', size: 34, hidden: true },
        { id: 't-new', kind: 'text', x: 394, y: 130, w: 198, h: 66, label: 'Create them', sub: 'Make a new customer and attach them in one go.', size: 15, hidden: true },
        { id: 'c-note', kind: 'panel', x: 40, y: 216, w: 270, h: 96, label: 'A NOTE ON A LINE', hidden: true },
        { id: 'i-note', kind: 'icon', x: 52, y: 246, w: 44, h: 44, icon: 'create', tone: 'accent', size: 34, hidden: true },
        { id: 't-note', kind: 'text', x: 104, y: 238, w: 198, h: 66, label: 'Say it once', sub: 'Open a line and type, for example, Gift wrap.', size: 15, hidden: true },
        { id: 'c-off', kind: 'panel', x: 330, y: 216, w: 270, h: 96, label: 'CHANGED THEIR MIND', hidden: true },
        { id: 'i-off', kind: 'icon', x: 342, y: 246, w: 44, h: 44, icon: 'close-circle', tone: 'accent', size: 34, hidden: true },
        { id: 't-off', kind: 'text', x: 394, y: 238, w: 198, h: 66, label: 'Take them off', sub: 'The small x next to the name. The items stay.', size: 15, hidden: true },
        { id: 'c-why', kind: 'panel', x: 40, y: 324, w: 560, h: 60, label: 'WHY BOTHER', hidden: true },
        { id: 't-why', kind: 'text', x: 52, y: 346, w: 536, h: 36, label: 'The sale is saved with their name, so it is easy to find later. Receipts start from their details.', size: 13, hidden: true },
      ] },
    ],
    steps: [
      { id: 'what', title: 'Optional, and quick', say: 'Most sales are walk-ups with no name. When a customer wants their sale kept with them, you attach them in a few taps.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub', note: 'Never required' },
      { id: 'find', title: 'Find them', say: 'Tap the customer row at the top of the cart. The list shows people already known. Type in the search box to narrow it by name, email or phone.', set: { 'c-pick': { hidden: false }, 'i-pick': { hidden: false }, 't-pick': { hidden: false } }, focus: 'c-pick', note: 'Search to narrow' },
      { id: 'create', title: 'Create one', say: 'If they are not on the list, Create customer opens a short form. Fill in a name and an email or mobile, and they are made and attached together.', set: { 'c-new': { hidden: false }, 'i-new': { hidden: false }, 't-new': { hidden: false } }, focus: 'c-new', note: 'Made on the spot' },
      { id: 'note', title: 'A note on a line', say: 'A note belongs to one item. Tap the line, type the note, and tap Done. It shows under the item in the cart.', set: { 'c-note': { hidden: false }, 'i-note': { hidden: false }, 't-note': { hidden: false } }, focus: 'c-note', note: 'Saved with Done' },
      { id: 'off', title: 'Take them off', say: 'Attached the wrong person? Tap the small x next to the name. The items in the cart stay exactly as they are.', set: { 'c-off': { hidden: false }, 'i-off': { hidden: false }, 't-off': { hidden: false } }, focus: 'c-off', note: 'Easy to undo' },
      { id: 'why', title: 'Why it matters', say: 'The sale is saved with the customer\'s name, and email or text receipts start from their details. That is the whole point of attaching one.', set: { 'c-why': { hidden: false }, 't-why': { hidden: false } }, focus: 'c-why', note: 'Findable later' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      { id: 'cart', nodes: [
        { id: 'bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Cart', sub: 'Practice data' },
        { id: 'cust', kind: 'row', x: 40, y: 56, w: 480, h: 44, icon: 'person-add-outline', label: 'Add a customer' },
        { id: 'cust-x', kind: 'button', x: 528, y: 60, w: 72, h: 36, label: 'Remove', tone: 'neutral', hidden: true },
        { id: 'line-bee', kind: 'row', x: 40, y: 112, w: 560, h: 60, label: 'Bumble Bee', sub: '1 x $8.00', value: '$8.00' },
        { id: 'line-note', kind: 'text', x: 56, y: 176, w: 400, h: 20, label: 'Gift wrap', size: 13, hidden: true },
        { id: 'total', kind: 'row', x: 40, y: 300, w: 560, h: 34, label: 'Total', value: '$8.00' },
        { id: 'charge', kind: 'button', x: 40, y: 342, w: 560, h: 40, label: 'Charge  $8.00', icon: 'card' },
      ] },
      { id: 'list', nodes: [
        { id: 'ls-sheet', kind: 'panel', x: 60, y: 20, w: 520, h: 360, label: 'CUSTOMER' },
        { id: 'ls-search', kind: 'field', x: 80, y: 52, w: 480, h: 44, label: 'Search', value: '' },
        { id: 'r-sam', kind: 'row', x: 80, y: 108, w: 480, h: 44, icon: 'person', label: 'Sam Rivera', sub: 'sam@example.com' },
        { id: 'r-priya', kind: 'row', x: 80, y: 156, w: 480, h: 44, icon: 'person', label: 'Priya Patel', sub: '0400 000 111' },
        { id: 'r-alex', kind: 'row', x: 80, y: 204, w: 480, h: 44, icon: 'person', label: 'Alex Chen', sub: 'alex@example.com' },
        { id: 'ls-create', kind: 'button', x: 80, y: 276, w: 480, h: 40, label: 'Create customer', icon: 'person-add-outline', tone: 'neutral' },
      ] },
      { id: 'line', nodes: [
        { id: 'ln-sheet', kind: 'panel', x: 60, y: 20, w: 520, h: 360, label: 'BUMBLE BEE' },
        { id: 'ln-note', kind: 'field', x: 80, y: 150, w: 480, h: 44, label: 'Note', value: '' },
        { id: 'ln-done', kind: 'button', x: 80, y: 210, w: 480, h: 40, label: 'Done', tone: 'neutral' },
      ] },
      { id: 'form', nodes: [
        { id: 'fm-sheet', kind: 'panel', x: 60, y: 20, w: 520, h: 360, label: 'NEW CUSTOMER' },
        { id: 'fm-first', kind: 'field', x: 80, y: 56, w: 235, h: 44, label: 'First name', value: '' },
        { id: 'fm-last', kind: 'field', x: 325, y: 56, w: 235, h: 44, label: 'Last name', value: '' },
        { id: 'fm-email', kind: 'field', x: 80, y: 112, w: 480, h: 44, label: 'Email', value: '' },
        { id: 'fm-save', kind: 'button', x: 80, y: 176, w: 480, h: 40, label: 'Create & attach' },
      ] },
    ],
    steps: [
      { id: 'cart', title: 'A sale with no customer', say: 'This sale has no customer, which is fine. The row at the top of the cart is how you attach one.', screen: 'cart', focus: 'cust', note: 'Optional' },
      { id: 'open', title: 'Open the list', say: 'Tap the customer row. The Customer window opens with the people already known.', tap: 'cust', screen: 'list', focus: 'ls-sheet', note: 'Known customers' },
      { id: 'search', title: 'Search', say: 'Type a few letters of a name, email or mobile. The list narrows as you type.', set: { 'ls-search': { value: 'priya' }, 'r-sam': { hidden: true }, 'r-alex': { hidden: true } }, focus: 'ls-search', note: 'Narrows the list' },
      { id: 'pick', title: 'Tap the person', say: 'Tap Priya Patel. The window closes and her name is at the top of the cart.', tap: 'r-priya', screen: 'cart', set: { cust: { icon: 'person-circle', label: 'Priya Patel' }, 'cust-x': { hidden: false } }, focus: 'cust', note: 'Attached' },
      { id: 'note-open', title: 'A note on a line', say: 'For a note, tap the line you mean. Its window opens.', tap: 'line-bee', screen: 'line', focus: 'ln-note', note: 'Per item' },
      { id: 'note-type', title: 'Type the note', say: 'Type what you need to remember, for example Gift wrap.', set: { 'ln-note': { value: 'Gift wrap' } }, focus: 'ln-note', note: 'Short and clear' },
      { id: 'note-done', title: 'Done saves it', say: 'Tap Done. The note is saved and shows under the item in the cart.', tap: 'ln-done', screen: 'cart', set: { 'line-note': { hidden: false } }, focus: 'line-note', note: 'Saved' },
      { id: 'remove', title: 'Take them off', say: 'To take the customer off, use the small x next to their name. The items stay.', tap: 'cust-x', set: { cust: { icon: 'person-add-outline', label: 'Add a customer' }, 'cust-x': { hidden: true } }, focus: 'cust', note: 'Items stay' },
      { id: 'new-open', title: 'Someone new', say: 'A new customer is not on the list. Open the list again and tap Create customer.', tap: 'cust', screen: 'list', set: { 'ls-search': { value: '' }, 'r-sam': { hidden: false }, 'r-alex': { hidden: false } }, focus: 'ls-create', note: 'Not listed' },
      { id: 'form', title: 'The short form', say: 'Fill in a first name, and an email or mobile.', tap: 'ls-create', screen: 'form', set: { 'fm-first': { value: 'Jordan' }, 'fm-last': { value: 'Lee' }, 'fm-email': { value: 'jordan@example.com' } }, focus: 'fm-sheet', note: 'Name plus contact' },
      { id: 'saved', title: 'Create and attach', say: 'Tap Create & attach. They are made and attached to the sale in one go.', tap: 'fm-save', screen: 'cart', set: { cust: { icon: 'person-circle', label: 'Jordan Lee' }, 'cust-x': { hidden: false } }, focus: 'cust', note: 'Done in one step' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will attach a customer to a sale on the real till with practice data, put a note on a line, take the customer off, and create a new one. Nothing is saved.', until: { kind: 'next' } },
    { id: 'g-add', target: gridItemSpot(BEE), say: 'First a sale. Tap the Bumble Bee tile to add it to the cart.', until: { kind: 'state', test: s => has(s, BEE) }, gesture: 'tap', allow: ['add'], recover: { say: 'On the Checkout tab, tap the Bumble Bee tile.', target: SPOT.tabCheckout }, at: place },
    { id: 'g-open', target: SPOT.cartCustomer, say: 'Tap the customer row at the top of the cart. On a phone, open the cart from the bar at the bottom first.', until: { kind: 'visible', id: SPOT.customerSearch }, gesture: 'tap', recover: phone, at: place },
    { id: 'g-search', target: SPOT.customerSearch, say: 'Type priya in the search box. The list narrows to match.', until: { kind: 'state', test: s => (s.customerQuery ?? '').toLowerCase().includes('priya') }, gesture: 'tap', allow: [], at: placeWin },
    { id: 'g-pick', target: customerRowSpot(PRIYA), say: 'Tap Priya Patel to attach her to the sale.', until: { kind: 'state', test: s => s.customerId === PRIYA }, gesture: 'tap', allow: ['customer'], at: placeWin },
    { id: 'g-attached', target: SPOT.cartCustomer, say: 'Priya Patel is on the sale, and her name sits at the top of the cart. The sale is saved with her name, and email or text receipts start from her details.', until: { kind: 'next' }, recover: phone, at: place },
    { id: 'g-line', target: cartLineSpot(BEE), say: 'Now a note. Tap the Bumble Bee line to open its window.', until: { kind: 'visible', id: lineNoteSpot(BEE) }, gesture: 'tap', recover: { say: 'On a phone, tap the cart bar at the bottom of the screen, then tap the Bumble Bee line.', target: SPOT.cartOpen }, at: place },
    { id: 'g-note', target: lineNoteSpot(BEE), say: 'Tap the Note box and type Gift wrap.', until: { kind: 'state', test: s => /gift\s*wrap/i.test(s.noteDraft ?? '') }, typing: true, gesture: 'tap', allow: ['note'], at: placeWin },
    { id: 'g-note-done', target: SPOT.lineDone, say: 'Tap Done. The note is saved when you close the window.', until: { kind: 'state', test: s => noted(s, BEE) }, gesture: 'tap', allow: ['note'], at: placeWin },
    { id: 'g-remove', target: SPOT.cartCustomerOff, say: 'To take the customer off the sale, tap the small x next to their name. The items stay.', until: { kind: 'state', test: s => !s.hasCustomer }, gesture: 'tap', allow: ['customer', 'note'], recover: phone, at: place },
    { id: 'g-create-open', target: SPOT.cartCustomer, say: 'Not everyone is on the list. Tap the customer row again.', until: { kind: 'visible', id: SPOT.customerCreate }, gesture: 'tap', allow: ['note'], recover: phone, at: place },
    { id: 'g-create', target: SPOT.customerCreate, say: 'Tap Create customer.', until: { kind: 'visible', id: SPOT.customerForm }, gesture: 'tap', allow: ['note'], at: placeWin },
    { id: 'g-form', target: SPOT.customerForm, say: 'Type your own first name, and your own email or mobile. Nothing is kept: practice data is thrown away when you leave. Tap Next when you have.', until: { kind: 'next' }, typing: true, ready: s => !!s.customerDraft && s.customerDraft.first.trim().length > 0 && (/^\S+@\S+\.\S+$/.test(s.customerDraft.email.trim()) || s.customerDraft.phone.replace(/\D/g, '').length >= 6), gesture: 'tap', allow: ['note'], at: placeWin },
    { id: 'g-save', target: SPOT.customerSave, say: 'Tap Create & attach. In practice the new customer is made on this iPad only, nothing goes to Shopify.', until: { kind: 'state', test: s => !!s.customerId?.startsWith('train-cu-new-') }, gesture: 'tap', allow: ['customer', 'note'], at: placeWin },
    { id: 'g-done', say: 'You can attach, search, create, note and take off. A customer is always optional, so never hold a sale up for one.', until: { kind: 'next' }, at: place },
  ],
  check1: [
    { id: 'c1-attach', title: 'Attach Alex Chen to this sale', until: { kind: 'state', test: s => s.customerId === ALEX }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }],
      ladder: ['A sale can have a customer. Look at the top of the cart.', 'The customer row at the top of the cart opens the list.', 'Tap the row, then tap Alex Chen. You can search first.'], reveal: customerRowSpot(ALEX), via: SPOT.cartCustomer, gesture: 'tap', allow: ['customer'], at: placeWin },
    { id: 'c1-note', title: 'Put a note on the Bumble Bee line, for example Gift wrap', until: { kind: 'state', test: s => noted(s, BEE) },
      ladder: ['A note belongs to one line, not the whole sale.', 'Tap the Bumble Bee line to open its window.', 'Type the note, then tap Done to save it.'], reveal: SPOT.lineDone, via: cartLineSpot(BEE), gesture: 'tap', allow: ['customer', 'note'], at: placeWin },
    { id: 'c1-off', title: 'Alex has gone. Take Alex Chen off the sale', until: { kind: 'state', test: s => !s.hasCustomer },
      ladder: ['The customer is shown at the top of the cart.', 'There is a small x next to the name.', 'Tap the x. The items stay.'], reveal: SPOT.cartCustomerOff, gesture: 'tap', allow: ['customer', 'note'], at: place },
  ],
  check2: [
    { id: 'c2-swap', title: 'This sale is for Priya Patel, but Sam Rivera is on it. Put it right', until: { kind: 'state', test: s => s.customerId === PRIYA }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: KEY, qty: 1 }], customer: SAM }], taughtBy: 'g-pick',
      ladder: ['The wrong person is attached.', 'The customer row at the top of the cart opens the list again.', 'Tap Priya Patel. She takes Sam\'s place.'], reveal: customerRowSpot(PRIYA), via: SPOT.cartCustomer, gesture: 'tap', allow: ['customer'], at: placeWin },
    { id: 'c2-new', title: 'Jordan Lee is a new customer and is not on the list. Create Jordan and attach them to the sale', until: { kind: 'state', test: s => !!s.customerId?.startsWith('train-cu-new-') }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }], taughtBy: 'g-save',
      ladder: ['Jordan will not be in the list.', 'The Customer window has a button for someone new.', 'Tap Create customer, fill in the form, then tap Create & attach.'], reveal: SPOT.customerCreate, via: SPOT.cartCustomer, gesture: 'tap', allow: ['customer'], at: placeWin },
  ],
  recap: ['You attach a customer by tapping the customer row, then picking or searching for them.', 'You create a new customer from the same window, and put a note on one line with Done.', 'You take a customer off with the small x, and you never hold up a sale for one.'],
};
