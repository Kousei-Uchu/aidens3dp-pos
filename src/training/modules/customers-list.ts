// Location: src/training/modules/customers-list.ts
// "The Customers page": everyone the till knows. Create a customer, fix what is on file for one, and start a sale with a
// customer already on it. Practice data only: in practice a customer is made on this iPad and nothing goes to Shopify.
import type { TrainingModule, TrainSnap } from '../../lib/trainingModule';
import { SPOT, customersRowSpot } from '../../lib/trainingSpots';

const BEE = 'train-v-bee'; const EGG = 'train-v-egg';
const SAM = 'train-cu-1'; const PRIYA = 'train-cu-2';
const has = (s: TrainSnap, id: string): boolean => s.cart.some(l => l.variantId === id);
/** A customer made during this run (practice customers are train-cu-1/2/3, so anything else is new). */
const isNew = (id?: string): boolean => !!id && id.startsWith('train-cu-new-');
const anyNew = (s: TrainSnap): boolean => (s.customers ?? []).some(c => isNew(c.id));
/** A customer made during this run has a mobile on file (the Edit lesson). */
const newHasPhone = (s: TrainSnap): boolean => (s.customers ?? []).some(c => isNew(c.id) && !!c.phone);
/** Sam Rivera, an existing customer who has no mobile on file, now has one. */
const samHasPhone = (s: TrainSnap): boolean => (s.customers ?? []).some(c => c.id === SAM && !!c.phone);

const base = { tabs: ['checkout', 'more'], routes: ['customers'] };
const list = { ...base, sheets: false }; const win = { ...base, sheets: true };

export const customersList: TrainingModule = {
  id: 'customers-list',
  title: 'Customers on file',
  summary: 'Use the Customers page: find someone, add a new customer, correct their details, and start a sale with them already on it. Practice data only, nothing goes to Shopify.',
  minutes: 7,
  flow: 'standard',
  card: 'auto',
  tabs: ['checkout', 'more'],
  routes: ['customers'],
  info: {
    canvas: { w: 640, h: 400 },
    screens: [
      {
        id: 'overview',
        nodes: [
          { id: 'in-title', kind: 'text', x: 40, y: 14, w: 560, h: 34, label: 'Customers on file', size: 22, align: 'center', hidden: true },
          { id: 'in-sub', kind: 'text', x: 60, y: 52, w: 520, h: 54, label: 'The Customers page is everyone the till knows: what is on file for them, and a way to put them on a sale.', size: 13, align: 'center', hidden: true },
          { id: 'c-card', kind: 'panel', x: 40, y: 116, w: 270, h: 132, label: 'ON FILE', hidden: true },
          { id: 'i-card', kind: 'icon', x: 52, y: 142, w: 44, h: 44, icon: 'person', tone: 'accent', size: 34, hidden: true },
          { id: 't-card', kind: 'text', x: 104, y: 138, w: 198, h: 106, label: 'Who they are', sub: 'New customer adds someone. Open a row to Edit their details.', size: 13, hidden: true },
          { id: 'c-sale', kind: 'panel', x: 330, y: 116, w: 270, h: 132, label: 'START A SALE', hidden: true },
          { id: 'i-sale', kind: 'icon', x: 342, y: 142, w: 44, h: 44, icon: 'cart', tone: 'accent', size: 34, hidden: true },
          { id: 't-sale', kind: 'text', x: 394, y: 138, w: 198, h: 106, label: 'Their sale', sub: 'Open a row and tap Start sale: they go on the sale and you land on Checkout.', size: 13, hidden: true },
          { id: 'c-search', kind: 'panel', x: 40, y: 264, w: 560, h: 110, label: 'FIND THEM FAST', hidden: true },
          { id: 't-search', kind: 'text', x: 60, y: 292, w: 520, h: 66, label: 'The search box takes a name, an email or a mobile, so the queue keeps moving.', size: 13, align: 'center', hidden: true },
        ],
      },
    ],
    steps: [
      { id: 'what', say: 'The Customers page is everyone the till knows. It is under More, then Customers.', set: { 'in-sub': { hidden: false } }, focus: 'in-sub' },
      { id: 'card', say: 'Each customer keeps a name, an email, a mobile and a note. New customer adds someone, and opening a row lets you Edit what is on file.', set: { 'c-card': { hidden: false }, 'i-card': { hidden: false }, 't-card': { hidden: false } }, focus: 't-card' },
      { id: 'sale', say: 'Open a row and tap Start sale. The customer goes on the sale and you land on Checkout, ready to ring up their items.', set: { 'c-sale': { hidden: false }, 'i-sale': { hidden: false }, 't-sale': { hidden: false } }, focus: 't-sale' },
      { id: 'search', say: 'The search box takes a name, an email or a mobile, so you find the right person before you make a sale to the wrong one.', set: { 'c-search': { hidden: false }, 't-search': { hidden: false } }, focus: 't-search' },
    ],
  },
  show: {
    canvas: { w: 640, h: 400 },
    screens: [
      {
        id: 'list',
        nodes: [
          { id: 'l-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Customers', sub: 'Practice data' },
          { id: 'l-new', kind: 'button', x: 468, y: 52, w: 152, h: 36, label: 'New customer' },
          { id: 'l-search', kind: 'field', x: 20, y: 100, w: 600, h: 40, label: 'Search', value: '' },
          { id: 'l-sam', kind: 'row', x: 20, y: 152, w: 600, h: 48, label: 'Sam Rivera', sub: 'sam@example.com' },
          { id: 'l-priya', kind: 'row', x: 20, y: 204, w: 600, h: 48, label: 'Priya Patel', sub: '0400 000 111' },
          { id: 'l-alex', kind: 'row', x: 20, y: 256, w: 600, h: 48, label: 'Alex Chen', sub: 'alex@example.com' },
          { id: 'l-note', kind: 'text', x: 20, y: 316, w: 600, h: 64, label: 'Rows are the people the till knows. Tap one to see everything on file for them.', size: 13, hidden: true },
        ],
      },
      {
        id: 'form',
        nodes: [
          { id: 'f-panel', kind: 'panel', x: 60, y: 16, w: 520, h: 368, label: 'NEW CUSTOMER' },
          { id: 'f-first', kind: 'field', x: 80, y: 56, w: 235, h: 44, label: 'First name', value: '' },
          { id: 'f-last', kind: 'field', x: 325, y: 56, w: 235, h: 44, label: 'Last name', value: '' },
          { id: 'f-email', kind: 'field', x: 80, y: 112, w: 480, h: 44, label: 'Email', value: '' },
          { id: 'f-phone', kind: 'field', x: 80, y: 168, w: 480, h: 44, label: 'Mobile', value: '' },
          { id: 'f-save', kind: 'button', x: 80, y: 232, w: 480, h: 40, label: 'Save' },
          { id: 'f-note', kind: 'text', x: 80, y: 292, w: 480, h: 72, label: 'A first name plus an email or a mobile is enough. In practice the customer stays on this iPad.', size: 12, hidden: true },
        ],
      },
      {
        id: 'detail',
        nodes: [
          { id: 'd-panel', kind: 'panel', x: 60, y: 16, w: 520, h: 368, label: 'SAM RIVERA' },
          { id: 'd-sub', kind: 'text', x: 80, y: 52, w: 480, h: 22, label: 'sam@example.com', size: 13 },
          { id: 'd-orders', kind: 'text', x: 80, y: 80, w: 480, h: 22, label: '3 orders, $64.00', size: 13 },
          { id: 'd-start', kind: 'button', x: 80, y: 200, w: 480, h: 40, label: 'Start sale' },
          { id: 'd-edit', kind: 'button', x: 80, y: 248, w: 480, h: 40, label: 'Edit' },
          { id: 'd-note', kind: 'text', x: 80, y: 304, w: 480, h: 68, label: 'Start sale puts this customer on the sale and takes you to Checkout. Edit changes their details.', size: 12, hidden: true },
        ],
      },
      {
        id: 'cart',
        nodes: [
          { id: 'c-bar', kind: 'bar', x: 0, y: 0, w: 640, h: 40, label: 'Checkout', sub: 'Practice data' },
          { id: 'c-cust', kind: 'row', x: 40, y: 60, w: 560, h: 48, label: 'Sam Rivera', sub: 'Customer on this sale', icon: 'person-circle' },
          { id: 'c-line', kind: 'row', x: 40, y: 120, w: 560, h: 52, label: 'Bumble Bee', sub: '1 x $8.00' },
          { id: 'c-charge', kind: 'button', x: 40, y: 342, w: 560, h: 40, label: 'Charge' },
        ],
      },
    ],
    steps: [
      { id: 'list', title: 'The Customers page', say: 'Under More, then Customers. Everyone the till knows is here, and New customer adds someone.', focus: 'l-new' },
      { id: 'search', title: 'Find them', say: 'The search box takes a name, an email or a mobile. Here it narrows to Sam.', tap: 'l-search', set: { 'l-search': { value: 'sam' }, 'l-priya': { hidden: true }, 'l-alex': { hidden: true }, 'l-note': { hidden: false } }, focus: 'l-search' },
      { id: 'open', title: 'Open a customer', say: 'Tap a row to open that customer. Their window shows what is on file and the two buttons.', tap: 'l-sam', screen: 'detail', focus: 'd-panel' },
      { id: 'start', title: 'Start a sale', say: 'Start sale puts this customer on the sale and takes you straight to Checkout.', tap: 'd-start', screen: 'cart', focus: 'c-cust' },
      { id: 'reset', title: 'Back to the list', say: 'Every customer, back on one page.', screen: 'list', set: { 'l-search': { value: '' }, 'l-priya': { hidden: false }, 'l-alex': { hidden: false }, 'l-note': { hidden: false } }, focus: 'l-new' },
      { id: 'new', title: 'Someone new', say: 'New customer opens a blank form.', tap: 'l-new', screen: 'form', set: { 'f-note': { hidden: false } }, focus: 'f-panel' },
      { id: 'fill', title: 'What is on file', say: 'A first name plus an email or a mobile is enough.', set: { 'f-first': { value: 'Jordan' }, 'f-last': { value: 'Lee' }, 'f-email': { value: 'jordan@example.com' } }, focus: 'f-first' },
      { id: 'save', title: 'Saved', say: 'Save keeps the customer, and their window opens so a sale can start with them straight away.', tap: 'f-save', screen: 'detail', set: { 'd-panel': { label: 'JORDAN LEE' }, 'd-sub': { value: 'jordan@example.com' }, 'd-orders': { label: 'New customer' }, 'd-note': { hidden: false } }, focus: 'd-start' },
    ],
  },
  guide: [
    { id: 'g-intro', say: 'You will find a customer, correct their details, start a sale with them on it, and add someone new. Nothing here touches Shopify.', until: { kind: 'next' }, at: list },
    { id: 'g-more', target: SPOT.tabMore, say: 'Open More at the bottom of the screen. Customers sits near the top.', until: { kind: 'state', test: s => s.tab === 'more' }, gesture: 'tap', allow: [], at: list, recover: { say: 'Tap More at the bottom of the screen.', target: SPOT.tabCheckout } },
    { id: 'g-open', target: SPOT.moreCustomers, say: 'Tap Customers to open the list.', until: { kind: 'state', test: s => s.route === 'customers' }, gesture: 'tap', allow: [], at: list, recover: { say: 'Tap More, then Customers.', target: SPOT.tabMore } },
    { id: 'g-sam', target: customersRowSpot(SAM), say: 'Sam Rivera is on the list. Tap Sam\'s row to open their window.', until: { kind: 'visible', id: SPOT.customersEdit }, gesture: 'tap', allow: [], at: win, recover: { say: 'Find Sam Rivera on the list and tap the row.', target: SPOT.customersSearch } },
    { id: 'g-edit', target: SPOT.customersEdit, say: 'Sam has no mobile on file. Tap Edit to change their details.', until: { kind: 'visible', id: SPOT.customersForm }, gesture: 'tap', allow: [], at: win, recover: { say: 'Open Sam\'s row, then tap Edit.', target: customersRowSpot(SAM) } },
    { id: 'g-edit-form', target: SPOT.customersForm, say: 'Add a mobile number for Sam, then tap Next.', until: { kind: 'next' }, typing: true, ready: s => !!s.customersDraft?.phone.trim(), allow: [], at: win },
    { id: 'g-edit-save', target: SPOT.customersSave, say: 'Tap Save. The change is kept, and Sam\'s window opens again.', until: { kind: 'state', test: samHasPhone }, gesture: 'tap', allow: [], at: win, recover: { say: 'Open Sam\'s row, tap Edit, add a mobile, then tap Save.', target: customersRowSpot(SAM) } },
    { id: 'g-start', target: SPOT.customersStart, say: 'Now start a sale with Sam on it. Tap Start sale.', until: { kind: 'state', test: s => s.customerId === SAM && s.tab === 'checkout' }, gesture: 'tap', allow: ['customer'], at: win, recover: { say: 'Open Sam\'s row and tap Start sale.', target: customersRowSpot(SAM) } },
    { id: 'g-done', say: 'That is finding someone, fixing their details and starting a sale with them on it. Next, add a customer of your own.', until: { kind: 'next' }, at: list },
  ],
  check1: [
    {
      id: 'c1-new', title: 'A new customer wants to be on file. Add them', until: { kind: 'state', test: anyNew }, reveal: SPOT.customersSave, via: SPOT.customersNew, gesture: 'tap', allow: [], at: win,
      ladder: ['A new customer is made on the Customers page.', 'Open More, tap Customers, then the New customer button at the top.', 'Fill in a first name and an email or a mobile, then tap Save.'],
    },
    {
      id: 'c1-sale', title: 'Start a sale for the customer you just made', until: { kind: 'state', test: s => isNew(s.customerId) && s.tab === 'checkout' }, inject: [{ kind: 'cart', items: [] }], reveal: SPOT.customersStart, via: SPOT.moreCustomers, gesture: 'tap', allow: ['customer'], at: win,
      ladder: ['The customer you just made is on the Customers page.', 'Open their row, then tap Start sale.', 'Start sale puts them on the sale and takes you to Checkout.'],
    },
  ],
  check2: [
    {
      id: 'c2-edit', title: 'Sam Rivera has no mobile on file. Add one', until: { kind: 'state', test: samHasPhone }, reveal: SPOT.customersSave, via: customersRowSpot(SAM), gesture: 'tap', allow: [], at: win,
      ladder: ['Sam is on the Customers page, but the mobile is missing.', 'Open Sam\'s row, then tap Edit.', 'Type a mobile for Sam, then tap Save.'],
    },
    {
      id: 'c2-sale', title: 'The till has Priya\'s items. Start a sale with Priya on it', until: { kind: 'state', test: s => s.customerId === PRIYA && has(s, BEE) && has(s, EGG) }, inject: [{ kind: 'cart', items: [{ variantId: BEE, qty: 1 }, { variantId: EGG, qty: 1 }] }], reveal: SPOT.customersStart, via: SPOT.moreCustomers, gesture: 'tap', allow: ['customer'], at: win, taughtBy: 'g-start',
      ladder: ['There are already items on the till for Priya.', 'Find Priya on the Customers page and open her row.', 'Tap Start sale: it puts Priya on the sale that is already there.'],
    },
  ],
  recap: [
    'The Customers page is under More, then Customers: everyone the till knows.',
    'The search box takes a name, an email or a mobile, so you open the right person.',
    'New customer adds someone; opening a row and tapping Edit corrects their details.',
    'Start sale puts a customer on the sale and takes you to Checkout, so their items go on the right account.',
  ],
};
