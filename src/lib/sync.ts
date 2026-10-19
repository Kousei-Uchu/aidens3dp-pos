// Location: src/lib/sync.ts
// Outbox + polling. Cash and saved carts work offline; sales queue locally and upload later; card needs internet.
// Every outbox step is idempotent, so a crash or retry never double-books.
import { useApp, currentStaff, type OutboxItem, type SavedCart, type Shift } from '../state/store';
import { csv } from './csvStore';
import { applyRecord, emptyTotals, rollupKey, type RollupRow, type Totals } from './rollup';
import { afterPull, decodeSaleRow, emptySharedHistory, SALES_PULL_MS } from './salesHistory';
import { parseBundleConfig } from './bundles';
import { parseGrid } from './grid';
import { readLedger } from './cashLedger';
import { mergeDrawer, missingEntries } from './drawerSync';
import { buildWarningListEntries, mergeWarningList } from './warningList';
import { isTraining } from './trainingGuard';
import { hasCreds, isNetworkError, ShopifyUserError } from './shopify/client';
import * as shop from './shopify/catalogue';
import * as meta from './shopify/metaobjects';
import { readCalibration, type ScannerCalibration } from './scanSpeed';
import { createOrderForSale } from './shopify/orders';
import { createGiftCard } from './shopify/giftcards';
import { ReceiptConfigError, receiptsEnabled, uploadReceipt } from './receiptSync';
import { adjustStock } from './shopify/inventory';
import type { BundleConfig, Cart, SaleRecord } from './types';

const st = () => useApp.getState();
let running = false;

// ── record a finished sale locally (the single entry point after tender completes) ──────────────
export async function recordSale(sale: SaleRecord) {
  const s = st();
  if (s.pos.sales.some(r => r.uuid === sale.uuid) || s.pos.outbox.some(o => o.id === sale.uuid)) return;
  const done: OutboxItem['done'] = sale.type === 'refund' ? { order: true, stock: true } : {};
  s.patchPos({ sales: [sale, ...s.pos.sales].slice(0, 2000), outbox: [...s.pos.outbox, { id: sale.uuid, sale, queuedAt: new Date().toISOString(), done, tries: 0 }] });
  await csv.sale(sale).catch(e => s.notify({ kind: 'info', title: 'Could not write CSV history', body: String(e?.message ?? e) }));
  void processOutbox();
}

const patchItem = (id: string, f: (o: OutboxItem) => OutboxItem) =>
  st().patchPos({ outbox: st().pos.outbox.map(o => (o.id === id ? f(o) : o)) });

async function runItem(o: OutboxItem) {
  const s = st(); const { sale } = o; const cfg = s.settings;
  const mark = (k: keyof OutboxItem['done']) => patchItem(o.id, x => ({ ...x, done: { ...x.done, [k]: true }, error: undefined }));
  let cur = sale;
  // Receipt page first (it needs no Shopify), so the customer's QR code works within seconds. A receipt-server outage never blocks the Shopify
  // steps: the error is held until the end so the item stays queued and only the receipt step repeats.
  let deferred: unknown = null;
  const receiptStep = async (k: 'receipt' | 'receiptFinal') => {
    if (o.done[k] || !receiptsEnabled()) return;
    try { await uploadReceipt(cur); mark(k); }
    catch (e) {
      if (e instanceof ReceiptConfigError) { st().notify({ kind: 'sync', title: 'Receipt page not published', body: e.message, route: 'settings' }); mark(k); }
      else deferred = deferred ?? e;
    }
  };
  await receiptStep('receipt');
  if (!o.done.order) {
    const ord = await createOrderForSale(sale, { markFulfilled: true, locationId: cfg.locationId });
    cur = { ...cur, orderGid: ord.id, orderName: ord.name };
    patchItem(o.id, x => ({ ...x, sale: cur }));
    st().patchPos({ sales: st().pos.sales.map(r => (r.uuid === cur.uuid ? { ...r, orderGid: ord.id, orderName: ord.name } : r)) });
    mark('order');
  }
  await receiptStep('receiptFinal'); // now includes the Shopify order number
  if (!o.done.giftCards) {
    // A9.4: cards are only created here, from the outbox, which only exists once payment has completed. Declined or abandoned sales never reach this
    // point, so they leave no card behind. A failure queues and retries (createGiftCard is idempotent by code), so a paid sale never loses its card.
    // A9.3: Shopify emails the recipient itself when a card is created with a recipient (confirmed: sending it again from here made two emails),
    // so creating the card is the one and only send. `giftDone` records finished cards so a retry skips them.
    const giftLines = cur.lines.filter(l => l.kind === 'gift_card' && l.giftCardCode);
    let doneIds = st().pos.outbox.find(x => x.id === o.id)?.giftDone ?? o.giftDone ?? [];
    for (const l of giftLines) {
      if (doneIds.includes(l.giftCardCode!)) continue;
      await createGiftCard(l.netCents, l.giftCardCode!, cur.uuid, cur.customer?.id, l.giftRecipient);
      doneIds = [...doneIds, l.giftCardCode!];
      patchItem(o.id, x => ({ ...x, giftDone: doneIds }));
    }
    mark('giftCards');
  }
  if (!o.done.entry) {
    // The whole sale in `sale_json`, so another till can show this one's orders in full (the shop-wide view). The definition's
    // field is added on demand; a till that cannot add it still sends the row, the same way it did before.
    const detailed = await meta.ensureSaleDetailField();
    await meta.upsert(meta.TYPES.sale, cur.uuid, {
      sale_uuid: cur.uuid, order_gid: cur.orderGid, register_id: cur.registerId, employee: cur.staff, ts: cur.ts, entry_type: cur.type, items_cents: cur.itemsCents,
      discounts_cents: cur.discountCents, total_cents: cur.totalCents, cogs_cents: cur.cogsCents, fees_cents: cur.feesCents, rounding_cents: cur.roundingCents,
      refund_of: cur.refundOf, status: 'complete', tenders_json: JSON.stringify(cur.tenders.map(t => ({ k: t.kind, a: t.amountCents, r: t.card?.externalReference }))),
      lines_json: JSON.stringify(cur.lines.map(l => ({ v: l.variantId, q: l.qty, n: l.netCents }))), customer_gid: cur.customer?.id, receipt_link: cur.receiptLink,
      ...(detailed ? { sale_json: JSON.stringify(cur) } : {}),
    });
    mark('entry');
  }
  if (!o.done.rollup) {
    const key = rollupKey(cur.registerId, cur.ts);
    const row = await meta.getByHandle(meta.TYPES.rollup, key);
    const base: Totals = row?.f.totals_json ? { ...emptyTotals(), ...JSON.parse(row.f.totals_json) } : emptyTotals();
    const next = applyRecord(base, cur); // idempotent via `applied`
    await meta.upsert(meta.TYPES.rollup, key, { rollup_key: key, register_id: cur.registerId, date: key.split('|')[1], totals_json: JSON.stringify(next) });
    st().patchPos({ rollups: { ...st().pos.rollups, [key]: next } });
    mark('rollup');
  }
  if (deferred) throw deferred;
}

export async function processOutbox() {
  if (running || !hasCreds()) return;
  running = true;
  try {
    for (const o of st().pos.outbox.filter(x => !x.blocked)) {
      try {
        st().set({ sync: { state: 'syncing', at: st().sync.at } });
        await runItem(o);
        st().patchPos({ outbox: st().pos.outbox.filter(x => x.id !== o.id) });
      } catch (e: any) {
        if (isNetworkError(e)) { st().set({ sync: { state: 'offline', at: st().sync.at, error: 'No connection' } }); patchItem(o.id, x => ({ ...x, tries: x.tries + 1 })); break; }
        const user = e instanceof ShopifyUserError;
        patchItem(o.id, x => ({ ...x, tries: x.tries + 1, error: String(e?.message ?? e), blocked: user }));
        st().notify({ kind: 'sync', title: user ? 'Sale needs attention' : 'Sale upload failed', body: `${o.sale.orderName ?? o.sale.uuid.slice(0, 8)}: ${String(e?.message ?? e)}`, route: 'notifications' });
        void csv.event({ kind: 'error', saleUuid: o.sale.uuid, message: String(e?.message ?? e) });
      }
    }
    const left = st().pos.outbox.length;
    st().set({ sync: { state: left ? st().sync.state === 'offline' ? 'offline' : 'error' : 'idle', at: left ? st().sync.at : new Date().toISOString(), error: left ? `${left} queued` : undefined } });
    if (left) st().notify({ kind: 'queue', title: `${left} sale${left > 1 ? 's' : ''} queued`, body: 'They will upload when the connection is back.' });
  } finally { running = false; }
}
export const retryBlocked = (id: string) => { patchItem(id, o => ({ ...o, blocked: false, error: undefined })); void processOutbox(); };

// ── catalogue import ─────────────────────────────────────────────────────────────────────────────
export async function importFromShopify(onProgress: (s: string) => void) {
  const s = st();
  if (!s.settings.locationId) throw new Error('Pick a location first (Settings ▸ Shopify).');
  onProgress('Products & stock…'); const vs = await shop.fetchVariants(s.settings.locationId, onProgress);
  onProgress('Collections…'); const collections = await shop.fetchCollections(onProgress);
  onProgress('Customers…'); const customers = await shop.fetchCustomers(onProgress);
  onProgress('Discounts…'); const autos = await shop.fetchAutoDiscounts(); const presets = await shop.fetchManualPresets();
  s.patchData({ variants: Object.fromEntries(vs.map(v => [v.id, v])), collections, customers, autos, presets, catalogueAt: new Date().toISOString(), stockSince: new Date().toISOString() });
  return { variants: vs.length, collections: collections.length, customers: customers.length, discounts: autos.length + presets.length };
}

/** Pull what other registers may have changed. Cheap enough to poll every ~20 s while foregrounded. */
export async function pollShared() {
  const s = st(); if (!hasCreds()) return;
  try {
    if (s.settings.sharedSettingsPending) await pushSharedSettings();
    if (s.settings.scannerCalPending) await pushScannerCalibration().catch(() => {});
    if (s.settings.drawerPending) await pushDrawer().catch(() => {});
    if (s.settings.warningListPending) await pushWarningList().catch(() => {});
    // stock
    if (s.settings.locationId && s.data.stockSince) {
      const since = new Date().toISOString();
      const delta = await shop.fetchStockDelta(s.data.stockSince, s.settings.locationId);
      const ids = Object.keys(delta);
      if (ids.length) {
        const variants = { ...st().data.variants };
        for (const v of Object.values(variants)) if (v.inventoryItemId && delta[v.inventoryItemId] !== undefined) variants[v.id] = { ...v, stock: delta[v.inventoryItemId] };
        s.patchData({ variants });
      }
      s.patchData({ stockSince: since });
    }
    await pullSaved(); await pullLayout(); await pullSettings(); await pullScannerCalibration(); await pullDrawer(); await pullWarningList();
    await pullSalesHistory().catch(() => {}); // the shop-wide sales view: an enrichment, so a failure never marks the sync bad
    st().set({ sync: { state: st().pos.outbox.length ? 'error' : 'idle', at: new Date().toISOString(), error: st().pos.outbox.length ? `${st().pos.outbox.length} queued` : undefined } });
  } catch (e: any) {
    st().set({ sync: { state: isNetworkError(e) ? 'offline' : 'error', at: st().sync.at, error: String(e?.message ?? e) } });
  }
}

// ── the shop-wide sales view (the assistant across every till) ─────────────────────────────────────
// Every sale already uploads to pos_sale, but nothing pulled it back, so the assistant's data tools only saw this till. This
// fills pos.shared with the other tills' recent sales (the whole record, from `sale_json`) and their daily totals. It is the
// same rows the Reports screen reads; keeping them here lets the assistant answer without a live fetch per question. This till's
// own sales are never copied in, because its own live copy is the one the cash tools read.
const SALES_PAGES = 8;
const ROLLUP_PAGES = 8;
let salesPulledAt = 0;
/** Pull the other tills' sales and daily totals. Throttled (SALES_PULL_MS) so the 25 s poll does not fetch every time. */
export async function pullSalesHistory(force = false): Promise<void> {
  const s = st();
  if (isTraining() || !hasCreds()) return;
  if (!force && Date.now() - salesPulledAt < SALES_PULL_MS) return;
  salesPulledAt = Date.now();
  const own = s.settings.registerId;
  const cached = s.pos.shared?.sales ?? [];
  const known = new Set<string>([...s.pos.sales.map(x => x.uuid), ...cached.map(x => x.uuid)]);
  const fresh: SaleRecord[] = [];
  let after: string | null = null;
  for (let page = 0; page < SALES_PAGES; page++) {
    const r = await meta.list(meta.TYPES.sale, { first: 100, after });
    let added = 0;
    for (const row of r.rows) {
      const rec = decodeSaleRow(row.f);
      if (!rec || rec.registerId === own || known.has(rec.uuid)) continue;
      known.add(rec.uuid); fresh.push(rec); added++;
    }
    // Rows are newest first. Once this till holds other tills' sales, a page with nothing new means the older pages are already
    // held, so stop. The first pull never stops early: a page of this till's own sales would hide the others just behind them.
    if (!r.next || (cached.length > 0 && added === 0)) break;
    after = r.next;
  }
  const rollups: RollupRow[] = [];
  after = null;
  for (let page = 0; page < ROLLUP_PAGES; page++) {
    const r = await meta.list(meta.TYPES.rollup, { first: 100, after });
    for (const row of r.rows) {
      const registerId = row.f.register_id, date = row.f.date;
      if (!registerId || !date) continue;
      try { rollups.push({ registerId, date, totals: { ...emptyTotals(), ...JSON.parse(row.f.totals_json || '{}') } }); } catch { /* ignore a bad total */ }
    }
    if (!r.next) break;
    after = r.next;
  }
  const cur = st();
  cur.patchPos({ shared: afterPull(cur.pos.shared ?? emptySharedHistory(), fresh, rollups, own, new Date().toISOString()) });
}

// ── saved carts ──────────────────────────────────────────────────────────────────────────────────
const cartFields = (c: SavedCart) => ({
  cart_uuid: c.id, name: c.name, note: c.note, customer_json: c.cart.customer ? JSON.stringify(c.cart.customer) : '', employee: c.employee, register_id: st().settings.registerId,
  status: c.status === 'void' ? 'void' : c.assignedTo ? `assigned:${c.assignedTo}` : 'open', lines_json: JSON.stringify(c.cart.lines), discount_json: c.cart.discount ? JSON.stringify(c.cart.discount) : '',
  created_at: c.ts, updated_at: new Date().toISOString(), version: (c.version ?? 0) + 1,
});
export function saveCartLocal(c: Omit<SavedCart, 'dirty' | 'status'> & { status?: SavedCart['status'] }) {
  const s = st(); const rec: SavedCart = { status: 'open', ...c, dirty: true };
  s.patchPos({ saved: [rec, ...s.pos.saved.filter(x => x.id !== rec.id)] });
  void pushSaved();
}
export const updateSaved = (id: string, p: Partial<SavedCart>) => {
  st().patchPos({ saved: st().pos.saved.map(c => (c.id === id ? { ...c, ...p, dirty: true } : c)) }); void pushSaved();
};
export async function pushSaved() {
  if (!hasCreds()) return;
  for (const c of st().pos.saved.filter(x => x.dirty)) {
    try {
      const row = await meta.upsert(meta.TYPES.cart, c.id, cartFields(c));
      st().patchPos({ saved: st().pos.saved.map(x => (x.id === c.id ? { ...x, dirty: false, remoteId: row.id, version: Number(row.f.version) || 1 } : x)) });
    } catch (e) { if (isNetworkError(e)) return; }
  }
  // void carts that have synced can be dropped locally
  st().patchPos({ saved: st().pos.saved.filter(x => !(x.status === 'void' && !x.dirty)) });
}
async function pullSaved() {
  const { rows } = await meta.list(meta.TYPES.cart, { first: 100 });
  const local = st().pos.saved; const byId = new Map(local.map(c => [c.id, c]));
  const next: SavedCart[] = [...local];
  for (const r of rows) {
    const id = r.f.cart_uuid || r.handle; const mine = byId.get(id);
    if (mine?.dirty) continue; // our unsent change wins until pushed
    const status = r.f.status === 'void' ? 'void' : 'open';
    if (status === 'void') { const i = next.findIndex(c => c.id === id); if (i >= 0) next.splice(i, 1); continue; }
    const cart: Cart = { id, lines: JSON.parse(r.f.lines_json || '[]'), discount: r.f.discount_json ? JSON.parse(r.f.discount_json) : undefined, customer: r.f.customer_json ? JSON.parse(r.f.customer_json) : undefined };
    const rec: SavedCart = { id, name: r.f.name, note: r.f.note || undefined, cart, ts: r.f.created_at || r.updatedAt, employee: r.f.employee || undefined, status: 'open',
      assignedTo: r.f.status?.startsWith('assigned:') ? r.f.status.slice(9) : undefined, remoteId: r.id, version: Number(r.f.version) || 1 };
    const i = next.findIndex(c => c.id === id); if (i >= 0) next[i] = rec; else next.push(rec);
  }
  // carts deleted remotely (not in the newest 100 AND not dirty) are left alone - no destructive guesses.
  st().patchPos({ saved: next.sort((a, b) => b.ts.localeCompare(a.ts)) });
}

// ── layout + shared settings ─────────────────────────────────────────────────────────────────────
export async function pushLayout() {
  if (!hasCreds()) return;
  const s = st(); const version = s.gridVersion + 1;
  await meta.upsert(meta.TYPES.layout, 'main', { layout_key: 'main', layout_json: JSON.stringify(s.grid), version, updated_by: s.settings.registerName, updated_at: new Date().toISOString() });
  s.setGrid(s.grid, version);
}
async function pullLayout() {
  const row = await meta.getByHandle(meta.TYPES.layout, 'main'); if (!row) return;
  const v = Number(row.f.version) || 0;
  if (v > st().gridVersion) { try { st().setGrid(parseGrid(row.f.layout_json).grid, v); } catch { /* ignore a bad layout */ } }
}
export async function pushSharedSettings() {
  const snapshot = st().settings;
  const shared = { staff: snapshot.staff, bundlesJson: snapshot.bundlesJson, fees: snapshot.fees, cashRounding: snapshot.cashRounding, requirePin: snapshot.requirePin, adjustPerms: snapshot.adjustPerms, cartWarnings: snapshot.cartWarnings ?? [] };
  st().patchSettings({ sharedSettingsPending: true });
  if (!hasCreds()) return;
  const version = snapshot.sharedVersion + 1;
  try {
    await meta.upsert(meta.TYPES.settings, 'shared', { settings_key: 'shared', version, settings_json: JSON.stringify(shared) });
  } catch (error) {
    st().set({ sync: { state: isNetworkError(error) ? 'offline' : 'error', at: st().sync.at, error: `Shared settings not uploaded: ${String((error as Error)?.message ?? error)}` } });
    throw error;
  }
  const current = st().settings;
  const stillMatches = JSON.stringify(shared) === JSON.stringify({ staff: current.staff, bundlesJson: current.bundlesJson, fees: current.fees, cashRounding: current.cashRounding, requirePin: current.requirePin, adjustPerms: current.adjustPerms, cartWarnings: current.cartWarnings ?? [] });
  st().patchSettings({ sharedVersion: version, sharedSettingsPending: !stillMatches });
}
async function pullSettings() {
  if (st().settings.sharedSettingsPending) return;
  const row = await meta.getByHandle(meta.TYPES.settings, 'shared'); if (!row) return;
  const v = Number(row.f.version) || 0;
  if (v > st().settings.sharedVersion) { try { st().patchSettings({ ...JSON.parse(row.f.settings_json), sharedVersion: v }); } catch {} }
}
// ── scanner calibration (Settings ▸ Hardware ▸ Calibrate) ──────────────────────────────────────────
// Its own record in the pos_settings metaobject (handle `scanner`), so it never collides with the shared settings above and needs no new definition.
/** Save a calibration on this register and share it. Kept locally and retried if Shopify cannot be reached. `null` goes back to the manual's ranges. */
export async function saveScannerCalibration(cal: ScannerCalibration | null) {
  st().patchSettings({ scannerCal: cal ?? undefined, scannerCalPending: true });
  await pushScannerCalibration();
}
export async function pushScannerCalibration() {
  if (!hasCreds()) return;
  const cal = st().settings.scannerCal ?? null;
  try {
    // Number it after whatever is already there, so another register's newer copy is never mistaken for older.
    const remote = await meta.getByHandle(meta.TYPES.settings, 'scanner');
    const version = Math.max(st().settings.scannerCalVersion ?? 0, Number(remote?.f.version) || 0) + 1;
    await meta.upsert(meta.TYPES.settings, 'scanner', { settings_key: 'scanner', version, settings_json: JSON.stringify({ calibration: cal }) });
    st().patchSettings({ scannerCalVersion: version, scannerCalPending: false });
  } catch (error) {
    st().set({ sync: { state: isNetworkError(error) ? 'offline' : 'error', at: st().sync.at, error: `Scanner calibration not uploaded: ${String((error as Error)?.message ?? error)}` } });
    throw error;
  }
}
async function pullScannerCalibration() {
  if (st().settings.scannerCalPending) return; // our unsent change wins until it is pushed
  const row = await meta.getByHandle(meta.TYPES.settings, 'scanner'); if (!row) return;
  const v = Number(row.f.version) || 0;
  if (v <= (st().settings.scannerCalVersion ?? 0)) return;
  try { const j = JSON.parse(row.f.settings_json); st().patchSettings({ scannerCal: j.calibration ? readCalibration(j.calibration) ?? undefined : undefined, scannerCalVersion: v }); } catch { /* ignore a bad record */ }
}

// ── shared cash drawer (0168) ─────────────────────────────────────────────────────────────────────
// One physical drawer for the shop, so its state is shared between registers the same way settings are: a versioned
// record in the pos_settings metaobject (handle `drawer`, like `shared` and `scanner`, so no new definition is needed).
// A change is written locally first (the drawer keeps working offline, exactly as before) and uploaded here. Another
// register's entries are folded in before we write, so a push never drops their history.
/** A drawer change on this register. `shift` marks a change to open/paid in/out/close, which a push must keep over an older copy. */
export function drawerChanged(shift = false) {
  st().patchSettings({ drawerPending: true, ...(shift ? { drawerShiftPending: true } : {}) });
  void pushDrawer();
}

export async function pushDrawer() {
  const s = st();
  if (isTraining()) return; // practice data is never sent
  s.patchSettings({ drawerPending: true });
  if (!hasCreds()) return;
  const pos = st().pos;
  let shift = pos.shift; let ledger = pos.ledger;
  let version = (st().settings.drawerVersion ?? 0) + 1;
  try {
    const remote = await meta.getByHandle(meta.TYPES.settings, 'drawer');
    const remoteV = Number(remote?.f.version) || 0;
    version = Math.max(st().settings.drawerVersion ?? 0, remoteV) + 1;
    if (remote?.f.settings_json) {
      let r: { shift?: Shift; ledger?: unknown } | null = null; try { r = JSON.parse(remote.f.settings_json); } catch { r = null; }
      if (r?.ledger) ledger = mergeDrawer(ledger, readLedger(r.ledger));
      // Another register changed the shift after our last look and we made no shift change of our own: follow theirs,
      // so a cash sale here never reverts a drawer another register just opened.
      if (!st().settings.drawerShiftPending && remoteV > (st().settings.drawerVersion ?? 0) && r?.shift) shift = r.shift;
    }
  } catch { /* a read that fails leaves our own copy to upload */ }
  try {
    await meta.upsert(meta.TYPES.settings, 'drawer', { settings_key: 'drawer', version, settings_json: JSON.stringify({ shift, ledger }) });
  } catch (error) {
    st().set({ sync: { state: isNetworkError(error) ? 'offline' : 'error', at: st().sync.at, error: `Drawer not uploaded: ${String((error as Error)?.message ?? error)}` } });
    throw error;
  }
  st().patchPos({ ledger, shift });
  st().patchSettings({ drawerVersion: version, drawerPending: false, drawerShiftPending: false });
}

async function pullDrawer() {
  if (isTraining() || st().settings.drawerPending) return; // our unsent change wins until it is pushed
  const row = await meta.getByHandle(meta.TYPES.settings, 'drawer'); if (!row) return;
  const v = Number(row.f.version) || 0;
  if (v <= (st().settings.drawerVersion ?? 0)) return;
  try {
    const j = JSON.parse(row.f.settings_json) as { shift?: Shift; ledger?: unknown };
    const local = st().pos; const remoteLedger = readLedger(j.ledger);
    // Merge, never replace: our own entries the shared copy has not seen are kept and applied onto the shared counts' history.
    const ledger = mergeDrawer(local.ledger, remoteLedger);
    const ours = missingEntries(remoteLedger.entries, local.ledger.entries).length > 0;
    // First look at the shared drawer: whichever register has an open drawer keeps it open. After that the newer shared shift wins.
    const first = !(st().settings.drawerVersion ?? 0);
    const shift = first && local.shift.open && !j.shift?.open ? local.shift : (j.shift ?? local.shift);
    st().patchPos({ shift, ledger });
    st().patchSettings({ drawerVersion: v, ...(ours || shift !== j.shift ? { drawerPending: true, drawerShiftPending: shift !== j.shift } : {}) });
    if (ours || shift !== j.shift) void pushDrawer().catch(() => {}); // share what only we had
  } catch { /* ignore a bad record */ }
}
export const bundleConfig = (): BundleConfig | null => { try { return st().settings.bundlesJson ? parseBundleConfig(st().settings.bundlesJson).cfg ?? null : null; } catch { return null; } };

// ── the warning list (Settings ▸ Cart warnings, "Add to the list") ──────────────────────────────────
// A warning set to the list is not shown on Charge; it is recorded here instead, and can be read later from a Quick
// Menu tile or the cart menu ("someone bought an item from a fixed number display, put another out"). The list is
// shared between registers through the same pos_settings metaobject as the shared settings (handle `warning_list`),
// merged by entry id, so a sale recorded on two registers is never listed twice.
const warningCatalog = () => {
  const data = st().data; const collectionsOfProduct: Record<string, string[]> = {};
  for (const c of data.collections) for (const p of c.productIds) (collectionsOfProduct[p] ??= []).push(c.id);
  return { variants: data.variants, collectionsOfProduct };
};

/** A line was added to the list: remember it must be shared, and upload it now. */
export function warningListChanged() {
  st().patchSettings({ warningListPending: true });
  void pushWarningList();
}

/**
 * Adds the lines this sale queued to the list, then shares them. Call it once the sale is paid, so what the cart held
 * and what the list says line up. Records nothing in practice mode.
 */
export function recordWarningListEntries(cart: Cart, o: { cartTotalCents?: number } = {}) {
  if (isTraining()) return;
  const s = st().settings;
  const entries = buildWarningListEntries(cart, s.cartWarnings, warningCatalog(), { staff: currentStaff()?.name, register: s.registerName, cartTotalCents: o.cartTotalCents });
  if (!entries.length) return;
  st().patchSettings({ warningList: mergeWarningList(entries, s.warningList) });
  warningListChanged();
}

/** Forgets the whole list, everywhere. */
export async function clearWarningList() {
  if (isTraining()) return;
  st().patchSettings({ warningList: [] });
  await pushWarningList().catch(() => {});
}

export async function pushWarningList() {
  const s = st();
  if (isTraining()) return; // practice data is never sent
  s.patchSettings({ warningListPending: true });
  if (!hasCreds()) return;
  let list = st().settings.warningList ?? [];
  let version = (st().settings.warningListVersion ?? 0) + 1;
  try {
    // Fold in lines another register added before we write, so a push never drops their history.
    const remote = await meta.getByHandle(meta.TYPES.settings, 'warning_list');
    version = Math.max(st().settings.warningListVersion ?? 0, Number(remote?.f.version) || 0) + 1;
    if (remote?.f.settings_json) {
      let r: { entries?: unknown } | null = null; try { r = JSON.parse(remote.f.settings_json); } catch { r = null; }
      if (Array.isArray(r?.entries)) list = mergeWarningList(list, r.entries as Parameters<typeof mergeWarningList>[0]);
    }
  } catch { /* a read that fails leaves our own copy to upload */ }
  try {
    await meta.upsert(meta.TYPES.settings, 'warning_list', { settings_key: 'warning_list', version, settings_json: JSON.stringify({ entries: list }) });
  } catch (error) {
    st().set({ sync: { state: isNetworkError(error) ? 'offline' : 'error', at: st().sync.at, error: `Warning list not uploaded: ${String((error as Error)?.message ?? error)}` } });
    throw error;
  }
  st().patchSettings({ warningList: list, warningListVersion: version, warningListPending: false });
}

async function pullWarningList() {
  if (isTraining() || st().settings.warningListPending) return; // our unsent change wins until it is pushed
  const row = await meta.getByHandle(meta.TYPES.settings, 'warning_list'); if (!row) return;
  const v = Number(row.f.version) || 0;
  if (v <= (st().settings.warningListVersion ?? 0)) return;
  try {
    const j = JSON.parse(row.f.settings_json) as { entries?: unknown };
    st().patchSettings({ warningList: mergeWarningList(st().settings.warningList, Array.isArray(j.entries) ? j.entries as Parameters<typeof mergeWarningList>[0] : undefined), warningListVersion: v });
  } catch { /* ignore a bad record */ }
}

/** Stock for sold lines (sales only): Shopify orderCreate with DECREMENT_IGNORING_POLICY already adjusts stock, so we only mirror locally. */
export function applyLocalStock(sale: SaleRecord) {
  const d = st().data; const variants = { ...d.variants }; const sign = sale.type === 'sale' ? -1 : 1;
  for (const l of sale.lines) if (l.variantId && variants[l.variantId]?.stock !== null && variants[l.variantId]) variants[l.variantId] = { ...variants[l.variantId], stock: (variants[l.variantId].stock ?? 0) + sign * l.qty };
  st().patchData({ variants });
}
void adjustStock;
