// Location: src/lib/demoFixtures.ts
// Made-up sales and notices for Demo mode (F8), so Transactions and Reports have something to show.
// Built the same way a real sale is, and every id starts with "train-": nothing here is ever saved or sent.
import type { Notice, SaleLine, SaleRecord, StaffMember, Tender } from './types';
import { emptyTotals, applyRecord, rollupKey, type Totals } from './rollup';
import { TRAIN_PREFIX } from './trainingSandbox';

const P = TRAIN_PREFIX;
const DAY = 86_400_000;
/** A moment `days` ago, at a plausible hour for a shop (minutes is the time of day). */
const when = (days: number, minutes: number): string => new Date(Date.now() - days * DAY + minutes * 60_000).toISOString();

const line = (title: string, variantTitle: string | undefined, qty: number, unit: number, cost: number, extra: Partial<SaleLine> = {}): SaleLine => ({
  title, ...(variantTitle ? { variantTitle } : {}), qty, baseUnitCents: unit, grossCents: unit * qty, discountCents: 0, netCents: unit * qty, costCents: cost * qty, discountLabels: [], kind: 'item', ...extra,
});

/** A finished sale (or refund) from the given lines and tenders, with every total worked out for it. */
function sale(opts: {
  id: string; ts: string; registerId: string; registerName: string; staff?: string; type?: 'sale' | 'refund'; refundOf?: string;
  lines: SaleLine[]; tenders: Tender[]; discountCents?: number; customer?: SaleRecord['customer']; deals?: SaleRecord['deals']; adjustments?: SaleRecord['adjustments'];
}): SaleRecord {
  const items = opts.lines.reduce((n, l) => n + l.grossCents, 0);
  const discount = opts.discountCents ?? opts.lines.reduce((n, l) => n + l.discountCents, 0);
  const net = items - discount;
  const cogs = opts.lines.reduce((n, l) => n + l.costCents, 0);
  const card = opts.tenders.filter(t => t.kind === 'card').reduce((n, t) => n + t.amountCents, 0);
  const fees = Math.round(card * 0.014);
  return {
    uuid: opts.id, type: opts.type ?? 'sale', ...(opts.refundOf ? { refundOf: opts.refundOf } : {}), ts: opts.ts, registerId: opts.registerId, registerName: opts.registerName, ...(opts.staff ? { staff: opts.staff } : {}),
    ...(opts.customer ? { customer: opts.customer } : {}), lines: opts.lines, itemsCents: items, discountCents: discount, netCents: net, tipCents: 0, totalCents: net,
    cogsCents: cogs, feesCents: fees, roundingCents: 0, tenders: opts.tenders, deals: opts.deals ?? [], ...(opts.adjustments ? { adjustments: opts.adjustments } : {}),
  };
}
const cash = (id: string, cents: number, tendered: number, at: string): Tender => ({ id: `${P}dt-${id}`, kind: 'cash', amountCents: cents, tenderedCents: tendered, changeCents: tendered - cents, roundingCents: 0, at });
const cardT = (id: string, cents: number, at: string): Tender => ({ id: `${P}dt-${id}`, kind: 'card', amountCents: cents, at, card: { transactionUuid: `${P}txn-${id}`, externalReference: `${P}ref-${id}`, approvalCode: '123456', scheme: 'Visa', panMasked: 'XXXXXXXXXXXX4242', last4: '4242' } });
const giftT = (id: string, cents: number, at: string): Tender => ({ id: `${P}dt-${id}`, kind: 'gift_card', amountCents: cents, at, giftCardId: `${P}gc-1`, giftCardCode: 'DEMO-GIFT-0001' });

/** Five finished sales and a refund across the last few days, in the same shape the till writes. */
export function demoSales(registerId: string, registerName: string): SaleRecord[] {
  const R = { registerId, registerName, staff: 'Alex Demo' };
  return [
    sale({ id: `${P}sale-d1`, ts: when(4, 620), ...R, lines: [line('Highland Cow', 'Small', 1, 1200, 400), line('Keyring', undefined, 2, 500, 150)], tenders: [cash('d1', 2200, 2500, when(4, 621))] }),
    sale({ id: `${P}sale-d2`, ts: when(3, 300), ...R, staff: 'Jordan Demo', lines: [line('Red Dragon', undefined, 1, 2500, 900)], tenders: [cardT('d2', 2500, when(3, 302))], customer: { id: `${P}cu-1`, name: 'Sam Rivera', email: 'sam@example.com' } }),
    sale({
      id: `${P}sale-d3`, ts: when(2, 700), ...R, lines: [line('Bumble Bee', undefined, 2, 800, 250), line('Dragon Egg', undefined, 3, 600, 200)], tenders: [cash('d3', 3600, 5000, when(2, 701))], discountCents: 200,
      deals: [{ type: 'auto', id: `${P}deal-1`, label: 'Demo: 3 Dragon Eggs, $2 off', cents: 200 }],
    }),
    sale({ id: `${P}sale-d4`, ts: when(1, 540), ...R, lines: [line('Custom amount', undefined, 1, 2000, 0, { kind: 'custom' })], tenders: [giftT('d4', 2000, when(1, 541))] }),
    sale({ id: `${P}sale-d5`, ts: when(0, 200), ...R, staff: 'Jordan Demo', lines: [line('Dragon Egg', undefined, 1, 600, 200), line('Sticker Pack', undefined, 1, 300, 60)], tenders: [cardT('d5', 900, when(0, 201))] }),
    sale({ id: `${P}sale-r1`, type: 'refund', refundOf: `${P}sale-d2`, ts: when(1, 300), ...R, lines: [line('Red Dragon', undefined, 1, 2500, 900)], tenders: [cardT('r1', 2500, when(1, 301))] }),
  ];
}
/** What Reports shows for the demo: each day's takings, worked out from the sales above. */
export function demoRollups(sales: readonly SaleRecord[]): Record<string, Totals> {
  const m: Record<string, Totals> = {};
  for (const s of sales) { const k = rollupKey(s.registerId, s.ts); m[k] = applyRecord(m[k] ?? emptyTotals(), s); }
  return m;
}
/** A few finished notices, so the Notifications tab and the unread badge have something to show. */
export function demoNotices(): Notice[] {
  const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  return [
    { id: `${P}note-1`, ts: ago(2), kind: 'sync', title: 'Sales uploaded to Shopify', body: 'Every sale from today is on your Shopify store. This is a demo notice.', route: 'transactions', read: false },
    { id: `${P}note-2`, ts: ago(5), kind: 'stock', title: 'Low stock: Red Dragon', body: 'Only 8 left. Reorder or switch tracking off. This is a demo notice.', route: 'inventory', read: false },
    { id: `${P}note-3`, ts: ago(26), kind: 'queue', title: 'A sale is waiting to upload', body: 'It will go on its own when the connection comes back. This is a demo notice.', route: 'notifications', read: true },
  ];
}
/** The made-up people Demo mode has. The signed-in one is an owner, so every feature (Settings, Staff, Reports) is on show, and no real name appears. */
export const DEMO_OWNER_ID = `${P}staff-demo`;
export const demoStaff = (): StaffMember[] => [
  { id: DEMO_OWNER_ID, name: 'Alex Demo', role: 'owner', salt: '', pinHash: '' },
  { id: `${P}staff-demo-2`, name: 'Jordan Demo', role: 'manager', salt: '', pinHash: '' },
];

