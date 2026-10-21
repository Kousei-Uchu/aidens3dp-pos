// Location: src/lib/demoData.ts
// Patch 0187: what Demo mode (F8) puts on the till.
//
// Demo mode used to swap the whole till onto made-up data. It now works on a COPY of the real till's data, so a demo shows
// the shop's own catalogue, customers, sales and drawer. Practice data fills a gap only where a screen would otherwise have
// nothing worth showing (a new till with no sales yet). The rule for what is allowed is the guard's (src/lib/trainingGuard.ts):
// anything that stays in memory is fine, because leaving Demo mode puts the real state back exactly; anything that leaves the
// iPad or changes a file on it is switched off.
//
// Pure: no store imports except types, so the choices here can be tested without a device.
import type { Swap } from './trainingSandbox';
import { PRACTICE_RECEIPT_URL, TRAIN_PREFIX, buildSandbox } from './trainingSandbox';
import { DEMO_OWNER_ID, demoNotices, demoRollups, demoSales, demoStaff } from './demoFixtures';
import { emptyCart } from './cartOps';

/** The groups of data a demo can draw from, each either the till's own or practice. */
export type DemoPart = 'catalogue' | 'customers' | 'sales' | 'reports' | 'notices' | 'drawer' | 'saved' | 'outbox';
export type DemoSource = { real: DemoPart[]; practice: DemoPart[]; products: number; customers: number; sales: number };

const LABEL: Record<DemoPart, string> = {
  catalogue: 'catalogue', customers: 'customers', sales: 'sales', reports: 'reports',
  notices: 'notifications', drawer: 'cash drawer', saved: 'saved carts', outbox: 'upload queue',
};
const ORDER: DemoPart[] = ['catalogue', 'customers', 'sales', 'reports', 'drawer', 'saved', 'outbox', 'notices'];
/** "a", "a and b", "a, b and c". */
const list = (xs: string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
export const partsText = (parts: readonly DemoPart[]): string => list(ORDER.filter(p => parts.includes(p)).map(p => LABEL[p]));

/** A copy that shares nothing with the original, so nothing done in Demo mode can reach the real objects. The till's state is
 *  plain data (it is saved as JSON), so this loses nothing but keys that hold `undefined`, which read the same as a missing key. */
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * The state for Demo mode, built from the real till's. `real` is never changed and nothing in the result points into it.
 *
 * What is the till's own: the catalogue (with its grid, automatic deals, discount presets, bundles and display settings),
 * customers, this till's sales and the other tills' history, the day's totals, saved carts, the upload queue, the notifications
 * and the cash drawer. What is always left out: the cart being rung up and card payment attempts (they belong to a sale that is
 * really happening), and anything that points outside the iPad, which stays blank so a button cannot reach a real server even if
 * a guard were missed.
 */
export function buildDemoSwap(real: Swap): { swap: Swap; source: DemoSource } {
  const practice = buildSandbox(real, { sync: 'idle', outbox: { stuck: 1, queued: 3 } });
  const rp = real.pos;
  const has = {
    catalogue: Object.keys(real.data.variants).length > 0,
    customers: real.data.customers.length > 0,
    sales: rp.sales.length > 0,
    reports: Object.keys(rp.rollups).length > 0,
    notices: rp.notices.length > 0,
    drawer: Object.values(rp.ledger.counts).some(n => n > 0),
    saved: rp.saved.length > 0,
    outbox: rp.outbox.length > 0,
  };

  // The catalogue, its grid, deals, presets and the settings that describe them travel together: practice ids and real ids must never mix.
  const data = {
    variants: copy(has.catalogue ? real.data.variants : practice.data.variants),
    collections: copy(has.catalogue ? real.data.collections : practice.data.collections),
    autos: copy(has.catalogue ? real.data.autos : practice.data.autos),
    presets: copy(has.catalogue ? real.data.presets : practice.data.presets),
    customers: copy(has.customers ? real.data.customers : practice.data.customers),
  };
  const base = has.catalogue ? copy(real.settings) : practice.settings;
  const settings = {
    ...base,
    // Everything that points outside the iPad stays blank or practice, whatever else is real.
    receipt: { ...base.receipt, serverUrl: PRACTICE_RECEIPT_URL },
    passServerUrl: '', giftClaimUrl: '', locationId: `${TRAIN_PREFIX}loc`,
    // Signed in as a made-up owner with no PIN, so every feature is on show and the demo can never lock itself out. The real staff stay
    // in the list, so Staff and the sales that name them look like the real till.
    staff: [...demoStaff(), ...copy(real.settings.staff)],
    requirePin: false,
  };

  const sales = has.sales ? copy(rp.sales) : demoSales(real.settings.registerId, real.settings.registerName);
  const pos: Swap['pos'] = {
    saved: has.saved ? copy(rp.saved) : has.catalogue ? [] : practice.pos.saved,
    // A till with a real catalogue and nothing waiting to upload is the normal, healthy case, so it is not given pretend queued sales.
    outbox: has.outbox ? copy(rp.outbox) : has.catalogue ? [] : practice.pos.outbox,
    sales,
    attempts: [],
    notices: has.notices ? copy(rp.notices) : demoNotices(),
    rollups: has.reports ? copy(rp.rollups) : demoRollups(sales),
    shift: has.drawer ? copy(rp.shift) : practice.pos.shift,
    ledger: has.drawer ? copy(rp.ledger) : practice.pos.ledger,
    cart: emptyCart(),
    shared: copy(rp.shared),
  };

  const swap: Swap = {
    settings, data,
    grid: has.catalogue ? copy(real.grid) : practice.grid, gridVersion: has.catalogue ? real.gridVersion : 0,
    pos, sync: practice.sync, zeller: practice.zeller, staffId: DEMO_OWNER_ID, unlocked: true,
  };

  const realParts: DemoPart[] = []; const practiceParts: DemoPart[] = [];
  const put = (p: DemoPart, isReal: boolean) => (isReal ? realParts : practiceParts).push(p);
  put('catalogue', has.catalogue); put('customers', has.customers); put('sales', has.sales);
  put('reports', has.reports || has.sales); // totals worked out from the till's own sales are the till's own
  put('notices', has.notices); put('drawer', has.drawer); put('saved', has.saved);
  if (has.outbox || has.catalogue) realParts.push('outbox'); else practiceParts.push('outbox');
  const products = new Set(Object.values(data.variants).map(v => v.productId)).size;
  return { swap, source: { real: ORDER.filter(p => realParts.includes(p)), practice: ORDER.filter(p => practiceParts.includes(p)), products, customers: data.customers.length, sales: sales.length } };
}

/** True when nothing in the demo is the till's own. */
export const allPractice = (s: DemoSource | null | undefined): boolean => !s || s.real.length === 0;

/** The bar across the top of the app. */
export const demoBannerText = (s: DemoSource | null | undefined): string =>
  allPractice(s) ? 'DEMO MODE  ·  nothing here is real' : 'DEMO MODE  ·  your real data, nothing is saved or sent';

/** The home screen's introduction: what is the till's own, what is practice, and what is switched off. */
export function demoIntro(s: DemoSource | null | undefined): { using: string; gaps: string; rules: string } {
  const rules = 'Anything you change stays on this iPad for as long as Demo mode is on, and is dropped when you leave. Card payments go to a practice terminal, and nothing is sent to Shopify, saved to the cloud, emailed, or written to your real files.';
  if (allPractice(s)) return { using: 'This till has no catalogue or sales of its own yet, so everything here is practice data.', gaps: '', rules };
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const bits = [
    s!.real.includes('catalogue') ? n(s!.products, 'product', 'products') : '',
    s!.real.includes('customers') ? n(s!.customers, 'customer', 'customers') : '',
    s!.real.includes('sales') ? n(s!.sales, 'sale', 'sales') : '',
  ].filter(Boolean);
  const using = `This is a copy of your till's own data: ${partsText(s!.real)}${bits.length ? ` (${list(bits)})` : ''}.`;
  const gaps = s!.practice.length ? `Practice data fills in what the till has none of yet: ${partsText(s!.practice)}.` : '';
  return { using, gaps, rules };
}
