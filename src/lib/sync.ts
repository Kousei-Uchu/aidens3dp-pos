// Location: src/lib/sync.ts
// Outbox + polling. Cash and saved carts work offline; sales queue locally and upload later; card needs internet.
// Every outbox step is idempotent, so a crash or retry never double-books.
import { useApp, currentStaff, setNoticeSink, type OutboxItem, type SavedCart, type Shift } from '../state/store';
import { csv, setEventSink } from './csvStore';
import { applyRecord, emptyTotals, rollupKey, type RollupRow, type Totals } from './rollup';
import { afterPull, decodeSaleRow, emptySharedHistory, SALES_PULL_MS } from './salesHistory';
import { parseBundleConfig } from './bundles';
import { parseGrid, type Grid } from './grid';
import { adoptAfterSend, gridText, planLayout } from './gridMerge';
import { readLedger } from './cashLedger';
import { mergeDrawer, missingEntries } from './drawerSync';
import { buildWarningListEntries, mergeWarningList } from './warningList';
import { isTraining } from './trainingGuard';
import { hasCreds, isNetworkError, ShopifyUserError } from './shopify/client';
import * as shop from './shopify/catalogue';
import { activeBackendKind, getShared, listShared, putShared, detailReadyShared, type BackendRow } from './syncBackend';
import { applyPulled, baseOf, mergeSaved, parseSavedRow } from './savedMerge';
import { applyShared, canon, mergeShared, needsSending, parseShared, pickShared, readBase, samePayload, type SharedKind } from './sharedSettings';
import { pullCloudDrawerState, pushCloudDrawer, type DrawerNative } from './cloudkit/drawerCloud';
import { createAttemptSync } from './cloudkit/attemptSync';
import { resolvedElsewhereNotice } from './attemptShared';
import { createEventSync } from './cloudkit/eventSync';
import { createNoticeSync } from './cloudkit/noticeSync';
import type { NoticeNative } from './cloudkit/noticeCloud';
import { createLogoSync } from './cloudkit/logoSync';
import type { LogoNative } from './cloudkit/logoCloud';
import { createSquareSync } from './cloudkit/squareSync';
import { createTrainingSync } from './cloudkit/trainingSync';
import { createAuditSync } from './cloudkit/auditSync';
import { createMigrationControl } from './cloudkit/migrationControl';
import type { MigrationNative } from './cloudkit/migrationCloud';
import type { VerifyTarget } from './cloudkit/migrationVerify';
import type { SharedBackend } from './syncBackend';
import type { AuditNative } from './cloudkit/auditCloud';
import { setAuditHook } from './auditHook';
import type { TrainingNative } from './cloudkit/trainingSync';
import type { SquareNative } from './cloudkit/squareCloud';
import type { EventNative } from './cloudkit/eventCloud';
import { readCalibration, type ScannerCalibration } from './scanSpeed';
import { createOrderForSale } from './shopify/orders';
import { createGiftCard } from './shopify/giftcards';
import { ReceiptConfigError, receiptsEnabled, uploadReceipt } from './receiptSync';
import { adjustStock } from './shopify/inventory';
import type { BundleConfig, Cart, SaleRecord } from './types';
import { featureOn, noticeAllowed } from './appMode';

const st = () => useApp.getState();
let running = false;

// CloudKit patch 4: every event written to events.csv is also written to CloudKit, once, when CloudKit is the active backend.
const events = createEventSync({
  active: () => activeBackendKind() === 'cloudkit',
  training: isTraining,
  who: () => ({ id: st().settings.registerId, name: st().settings.registerName }),
  native: async () => (await import('../../modules/cloudkit-sync')) as unknown as EventNative,
  readCsv: () => csv.readEvents(),
});
setEventSink(e => { void events.upload(e); });
/** The same instance, for the Cloud sync page's export of every register's events. */
export const eventSync = events;
// CloudKit patch 4: payment attempts the same way. Pay.tsx calls `attemptSync.push` after each change to an attempt.
export const attemptSync = createAttemptSync({
  active: () => activeBackendKind() === 'cloudkit',
  training: isTraining,
  who: () => ({ id: st().settings.registerId, name: st().settings.registerName }),
  native: async () => (await import('../../modules/cloudkit-sync')) as unknown as EventNative,
  local: () => st().pos.attempts,
  setShared: list => st().set({ sharedAttempts: list }),
  setLocal: list => st().patchPos({ attempts: list }),
  notifyResolved: a => { const n = resolvedElsewhereNotice(a); st().notify({ kind: 'info', title: n.title, body: n.body }); },
});

// CloudKit patch 6a: cash and refund notices are shared with the other registers (decisions item 10). A notice raised here is handed over by
// `notify` through the store's sink; the poll sends any that were missed and takes in the ones other registers raised. Reading or clearing
// one stays on this iPad: `noticesSeen` remembers what was taken in, so a cleared notice does not return.
const noticeSync = createNoticeSync({
  active: () => activeBackendKind() === 'cloudkit',
  training: isTraining,
  who: () => ({ id: st().settings.registerId, name: st().settings.registerName }),
  native: async () => (await import('../../modules/cloudkit-sync')) as unknown as NoticeNative,
  local: () => st().pos.notices,
  setLocal: list => st().patchPos({ notices: list }),
  seen: () => st().settings.noticesSeen ?? [],
  setSeen: names => st().patchSettings({ noticesSeen: names }),
  allowed: kind => noticeAllowed(st().settings.appMode, st().settings.registerFeatures, kind),
});
setNoticeSink(n => { void noticeSync.upload(n); });

// CloudKit patch 6a: the uploaded logo image is shared (decisions item 14). Once per poll this register's logo is compared with the shop's:
// a change made here is sent, a change made elsewhere is taken, and a removal goes both ways. `logoBase` is the hash both last agreed on.
// The file work lives in logoFiles.ts and is loaded on demand, so this file still imports in the node tests.
const logoSync = createLogoSync({
  active: () => activeBackendKind() === 'cloudkit',
  training: isTraining,
  who: () => ({ id: st().settings.registerId, name: st().settings.registerName }),
  native: async () => (await import('../../modules/cloudkit-sync')) as unknown as LogoNative,
  readLocal: async () => (await import('./logoFiles')).readLocalLogo(),
  inspect: async p => (await import('./logoFiles')).inspectDownloadedLogo(p),
  install: async (p, t) => (await import('./logoFiles')).installDownloadedLogo(p, t),
  clear: async () => (await import('./logoFiles')).clearLocalLogo(),
  base: () => st().settings.logoBase ?? null,
  setBase: h => { if ((st().settings.logoBase ?? null) !== h) st().patchSettings({ logoBase: h }); },
});

// CloudKit patch 6a: the imported Square history is shared one month at a time (plan, "Square history structure and size"). Once per poll
// this register's month files are compared with the shop's: a month changed here is sent (with customer names, emails and phones taken
// out), a month changed elsewhere is taken, and a removal goes both ways. `squareBase` is what both last agreed on, month by month.
// The file work lives in squareHistorySyncIO.ts and is loaded on demand, so this file still imports in the node tests.
const squareSync = createSquareSync({
  active: () => activeBackendKind() === 'cloudkit',
  training: isTraining,
  who: () => ({ id: st().settings.registerId, name: st().settings.registerName }),
  native: async () => (await import('../../modules/cloudkit-sync')) as unknown as SquareNative,
  listLocal: async () => (await import('./squareHistorySyncIO')).listLocalMonths(),
  prepare: async m => (await import('./squareHistorySyncIO')).prepareShard(m),
  inspect: async p => (await import('./squareHistorySyncIO')).inspectDownloadedShard(p),
  install: async (m, p) => (await import('./squareHistorySyncIO')).installShard(m, p),
  removeLocal: async m => (await import('./squareHistorySyncIO')).removeLocalMonth(m),
  finish: async (meta, sales) => (await import('./squareHistorySyncIO')).finishSquareChange(meta, sales),
  base: () => st().settings.squareBase,
  setBase: t => { if ((st().settings.squareBase ?? '') !== t) st().patchSettings({ squareBase: t }); },
});

// CloudKit patch 6c: training progress follows the person across registers (decisions item 15). Once per poll the shop's marks are joined with
// this register's and the differences are written back. Nothing is sent during a practice run. The session store is loaded on demand.
const trainingSync = createTrainingSync({
  active: () => activeBackendKind() === 'cloudkit',
  training: isTraining,
  who: () => ({ id: st().settings.registerId, name: st().settings.registerName }),
  native: async () => (await import('../../modules/cloudkit-sync')) as unknown as TrainingNative,
  getLocal: async () => { const t = (await import('../state/trainingSession')).useTraining.getState(); await t.loadProgress(); return (await import('../state/trainingSession')).useTraining.getState().progress; },
  setLocal: async p => (await import('../state/trainingSession')).useTraining.getState().adoptProgress(p),
});

// CloudKit patch 6c: the assistant's audit log is shared, encrypted (decisions item 13, Q4, N2). Each event is handed over as it is logged; the poll sends
// any that were missed, and a register's own log is sent once after it joins (Q13). Nothing is sent until the encrypted switch is on (`mode`).
// The log files are read on demand, so this file still imports in the node tests. The manager's viewer reads the other registers through `auditSync.others`.
export const auditSync = createAuditSync({
  active: () => activeBackendKind() === 'cloudkit',
  training: isTraining,
  who: () => ({ id: st().settings.registerId, name: st().settings.registerName }),
  native: async () => (await import('../../modules/cloudkit-sync')) as unknown as AuditNative,
  mode: async () => (await import('./cloudkit/cloudkitBackend')).saleCardMode(),
  readLocal: async () => (await (await import('./assistantLogIO')).assistantLog.events()).events,
});
setAuditHook(e => { void auditSync.upload(e); });

// CloudKit patch 7: the one-off import of the shop's Shopify records into CloudKit. Nothing starts it by itself; the "Setting up sync" screen
// (next piece) calls `migrationControl.start()` on the owner's iPad. Shopify is always read through the metaobject backend and CloudKit
// written through the CloudKit backend, whichever of them the app is using. Both are loaded on demand so the node tests still import this file.
const loadBackend = async (kind: 'metaobject' | 'cloudkit'): Promise<SharedBackend> => kind === 'cloudkit' ? (await import('./cloudkit/cloudkitBackend')).cloudkitBackend : (await import('./shopify/metaobjectBackend')).metaobjectBackend;
const lazyBackend = (kind: 'metaobject' | 'cloudkit'): VerifyTarget => ({
  list: async (t, o) => (await loadBackend(kind)).list(t, o),
  get: async (t, h) => (await loadBackend(kind)).get(t, h),
  put: async (t, h, f) => (await loadBackend(kind)).put(t, h, f),
});
export const migrationControl = createMigrationControl({
  native: async () => (await import('../../modules/cloudkit-sync')) as unknown as MigrationNative & DrawerNative,
  source: () => lazyBackend('metaobject'),
  target: () => lazyBackend('cloudkit') as unknown as VerifyTarget,
  ensure: async () => { await (await loadBackend('metaobject')).ensure(); await (await loadBackend('cloudkit')).ensure(); },
  who: () => ({ id: st().settings.registerId, name: st().settings.registerName }),
  role: async () => (await (await import('../../modules/cloudkit-sync')).getState()).role,
  training: isTraining,
});

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
    const detailed = await detailReadyShared('sale');
    await putShared('sale', cur.uuid, {
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
    const row = await getShared('rollup', key);
    const base: Totals = row?.f.totals_json ? { ...emptyTotals(), ...JSON.parse(row.f.totals_json) } : emptyTotals();
    const next = applyRecord(base, cur); // idempotent via `applied`
    await putShared('rollup', key, { rollup_key: key, register_id: cur.registerId, date: key.split('|')[1], totals_json: JSON.stringify(next) });
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
    // Practice data is never sent: the seam refuses these writes in training anyway, and skipping them here keeps a course
    // from showing a sync error for a push that was never meant to happen.
    if (!isTraining()) {
      if (s.settings.sharedSettingsPending) await pushSharedSettings();
      if (s.settings.scannerCalPending) await pushScannerCalibration().catch(() => {});
      if (s.settings.drawerPending) await pushDrawer().catch(() => {});
      if (s.settings.warningListPending) await pushWarningList().catch(() => {});
      await events.catchUp(); // events the live upload missed, and a register's own history once after it joins (never throws)
      await attemptSync.catchUp(); // the same for payment attempts
      await attemptSync.pull(); // then read every register's attempts back (the shop-wide list, and a payment another register resolved)
      await noticeSync.catchUp(); // cash and refund notices the live upload missed (never throws)
      await noticeSync.pull(); // and take in the ones other registers raised
      await logoSync.run(); // the logo image, both ways (never throws)
      await squareSync.run(); // the Square history months, both ways (never throws)
      await trainingSync.run(); // training marks, both ways (never throws)
      await auditSync.catchUp(); // assistant log events the live upload missed, encrypted (never throws)
    }
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
    const r = await listShared('sale', { first: 100, after });
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
    const r = await listShared('rollup', { first: 100, after });
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
  created_at: c.ts, updated_at: c.updatedAt ?? new Date().toISOString(), version: (c.version ?? 0) + 1,
});
export function saveCartLocal(c: Omit<SavedCart, 'dirty' | 'status'> & { status?: SavedCart['status'] }) {
  const s = st(); const rec: SavedCart = { status: 'open', ...c, dirty: true, updatedAt: new Date().toISOString() };
  s.patchPos({ saved: [rec, ...s.pos.saved.filter(x => x.id !== rec.id)] });
  void pushSaved();
}
export const updateSaved = (id: string, p: Partial<SavedCart>) => {
  st().patchPos({ saved: st().pos.saved.map(c => (c.id === id ? { ...c, ...p, dirty: true, updatedAt: new Date().toISOString() } : c)) }); void pushSaved();
};
let pushingSaved = false; let pushSavedAgain = false;
/**
 * Send the saved carts changed here. Each is read back first and merged with any change another register made since (savedMerge.ts),
 * so a save does not overwrite their edit, and a cart they deleted is not brought back. One run at a time: a call made while one is
 * going asks for another pass when it ends.
 */
export async function pushSaved() {
  if (!hasCreds()) return;
  if (pushingSaved) { pushSavedAgain = true; return; }
  pushingSaved = true;
  try {
    do {
      pushSavedAgain = false;
      for (const c of st().pos.saved.filter(x => x.dirty)) {
        try {
          let send = c;
          if ((c.version ?? 0) > 0) {
            const row = await getShared('cart', c.id); const remote = row ? parseSavedRow(row) : null;
            if (remote) {
              const m = mergeSaved(c, remote);
              if (!m.cart) { st().patchPos({ saved: st().pos.saved.filter(x => x.id !== c.id) }); continue; }
              if (!m.push) { st().patchPos({ saved: st().pos.saved.map(x => (x.id === c.id ? m.cart! : x)) }); continue; }
              send = m.cart;
            }
          }
          const row = await putShared('cart', c.id, cartFields(send));
          const version = Number(row.f.version) || 1; const base = baseOf(send);
          // If the cart was changed again while this was being sent, it stays unsent; only the version it is based on moves on.
          st().patchPos({ saved: st().pos.saved.map(x => (x.id !== c.id ? x : baseOf(x) === base && x.status === send.status ? { ...x, dirty: false, remoteId: row.id, version, base } : { ...x, remoteId: row.id, version, base })) });
        } catch (e) { if (isNetworkError(e)) return; }
      }
      // void carts that have synced can be dropped locally
      st().patchPos({ saved: st().pos.saved.filter(x => !(x.status === 'void' && !x.dirty)) });
    } while (pushSavedAgain);
  } finally { pushingSaved = false; }
}
const MAX_CART_PAGES = 10; // 1000 carts, open and deleted
async function pullSaved() {
  // Every page, not just the newest 100: deleted carts stay in the store as records, so the open ones can be past the first page.
  const rows: BackendRow[] = []; let after: string | null = null;
  for (let page = 0; page < MAX_CART_PAGES; page++) {
    const r = await listShared('cart', { first: 100, after }); rows.push(...r.rows);
    if (!r.next) break; after = r.next;
  }
  const { next, push } = applyPulled(st().pos.saved, rows);
  st().patchPos({ saved: next });
  if (push) void pushSaved();
}

// ── layout + shared settings ─────────────────────────────────────────────────────────────────────
export async function pushLayout() {
  if (!hasCreds()) return;
  if (sharedKind() === 'cloudkit') { await reconcileLayout(); return; }
  const s = st(); const version = s.gridVersion + 1;
  await putShared('layout', 'main', { layout_key: 'main', layout_json: JSON.stringify(s.grid), version, updated_by: s.settings.registerName, updated_at: new Date().toISOString() });
  s.setGrid(s.grid, version);
}
async function pullLayout() {
  if (sharedKind() === 'cloudkit') { await reconcileLayout(); return; }
  const row = await getShared('layout', 'main'); if (!row) return;
  const v = Number(row.f.version) || 0;
  if (v > st().gridVersion) { try { st().setGrid(parseGrid(row.f.layout_json).grid, v); } catch { /* ignore a bad layout */ } }
}
// 0208: on CloudKit the layout is joined page by page against `gridBase`, not replaced by whichever register wrote last, and the version
// counter is not used to tell what is newer (decisions item 27). One function serves the push after an edit and the poll, so an edit made
// offline (never sent) is sent at the next poll instead of waiting for another edit. Rules and tests: lib/gridMerge.ts.
let reconcilingLayout = false;
async function reconcileLayout() {
  if (reconcilingLayout || isTraining()) return; reconcilingLayout = true;
  try {
    const row = await getShared('layout', 'main'); const snapshot = st().grid;
    let remote: Grid | null = null; if (row) { try { remote = parseGrid(row.f.layout_json).grid; } catch { remote = null; } }
    const plan = planLayout(st().settings.gridBase, snapshot, remote);
    if (plan.action === 'same') { rememberGrid(snapshot); return; }
    if (plan.action === 'take') { st().setGrid(plan.grid, Math.max(st().gridVersion, Number(row?.f.version) || 0)); rememberGrid(plan.grid); return; }
    const version = Math.max(st().gridVersion, Number(row?.f.version) || 0) + 1;
    await putShared('layout', 'main', { layout_key: 'main', layout_json: JSON.stringify(plan.grid), version, updated_by: st().settings.registerName, updated_at: new Date().toISOString() });
    const next = adoptAfterSend(snapshot, st().grid, plan.grid); // an edit made while this was sending is kept, and sent next time
    st().setGrid(next, version); st().patchSettings({ gridBase: gridText(plan.grid) });
  } finally { reconcilingLayout = false; }
}
const rememberGrid = (g: Grid) => { const t = gridText(g); if (st().settings.gridBase !== t) st().patchSettings({ gridBase: t }); };
/** Which set of settings is shared: the original seven on Shopify, the wider set on CloudKit (0205, lib/sharedSettings.ts). */
const sharedKind = (): SharedKind => (activeBackendKind() === 'cloudkit' ? 'cloudkit' : 'metaobject');
// 0205: the settings only CloudKit shares (shop name, receipt details, server addresses, auto-receipt, smart change, consolidate,
// assistant connection) are edited in many places, some a field per keystroke. Rather than every screen remembering to send them, this
// watches the store and sends once typing has paused. It does nothing on Shopify (those settings stay per device there), in practice
// mode, or while an earlier send is waiting to be retried (the poll does that).
let settingsTimer: ReturnType<typeof setTimeout> | undefined;
export const SETTINGS_SEND_DELAY_MS = 1500;
useApp.subscribe(state => {
  if (sharedKind() !== 'cloudkit' || isTraining() || state.settings.sharedSettingsPending || !needsSending(state.settings, 'cloudkit')) return;
  if (settingsTimer) clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => { settingsTimer = undefined; const s = st().settings; if (!s.sharedSettingsPending && needsSending(s, 'cloudkit')) void pushSharedSettings().catch(() => {}); }, SETTINGS_SEND_DELAY_MS);
  (settingsTimer as { unref?: () => void }).unref?.();
});
export async function pushSharedSettings() {
  const kind = sharedKind();
  const snapshot = st().settings;
  const shared = pickShared(snapshot, kind);
  st().patchSettings({ sharedSettingsPending: true });
  if (!hasCreds()) return;
  let version = snapshot.sharedVersion + 1; let outgoing = shared;
  try {
    if (kind === 'cloudkit') { // another register may have written since we last looked: merge their edits in rather than overwrite them
      const remote = await getShared('settings', 'shared'); const remoteV = Number(remote?.f.version) || 0;
      if (remote && remoteV > snapshot.sharedVersion) outgoing = mergeShared(readBase(snapshot.sharedBase), shared, parseShared(remote.f.settings_json, kind) ?? {});
      version = Math.max(snapshot.sharedVersion, remoteV) + 1;
    }
    await putShared('settings', 'shared', { settings_key: 'shared', version, settings_json: JSON.stringify(outgoing) });
  } catch (error) {
    st().set({ sync: { state: isNetworkError(error) ? 'offline' : 'error', at: st().sync.at, error: `Shared settings not uploaded: ${String((error as Error)?.message ?? error)}` } });
    throw error;
  }
  const current = st().settings;
  if (kind === 'cloudkit') {
    // What was merged in is taken here too, except for keys edited while the upload ran; those stay as typed and are sent again.
    const next = mergeShared(shared, pickShared(current, kind), outgoing);
    st().patchSettings({ ...applyShared(next, current), sharedVersion: version, sharedBase: canon(outgoing), sharedSettingsPending: !samePayload(next, outgoing) });
    return;
  }
  const stillMatches = samePayload(shared, pickShared(current, kind));
  st().patchSettings({ sharedVersion: version, sharedSettingsPending: !stillMatches });
}
async function pullSettings() {
  if (st().settings.sharedSettingsPending) return;
  const row = await getShared('settings', 'shared'); if (!row) return;
  const v = Number(row.f.version) || 0;
  if (v <= st().settings.sharedVersion) return;
  const kind = sharedKind(); const parsed = parseShared(row.f.settings_json, kind); if (!parsed) return; // an unreadable record changes nothing
  st().patchSettings({ ...applyShared(parsed, st().settings), sharedVersion: v });
  if (kind === 'cloudkit') st().patchSettings({ sharedBase: canon(pickShared(st().settings, kind)) });
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
    const remote = await getShared('settings', 'scanner');
    const version = Math.max(st().settings.scannerCalVersion ?? 0, Number(remote?.f.version) || 0) + 1;
    await putShared('settings', 'scanner', { settings_key: 'scanner', version, settings_json: JSON.stringify({ calibration: cal }) });
    st().patchSettings({ scannerCalVersion: version, scannerCalPending: false });
  } catch (error) {
    st().set({ sync: { state: isNetworkError(error) ? 'offline' : 'error', at: st().sync.at, error: `Scanner calibration not uploaded: ${String((error as Error)?.message ?? error)}` } });
    throw error;
  }
}
async function pullScannerCalibration() {
  if (st().settings.scannerCalPending) return; // our unsent change wins until it is pushed
  const row = await getShared('settings', 'scanner'); if (!row) return;
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
  if (!drawerOn()) return; // a companion without the Cash drawer group has no drawer to change (and must not mark one as pending)
  st().patchSettings({ drawerPending: true, ...(shift ? { drawerShiftPending: true } : {}) });
  void pushDrawer();
}

/** The CloudKit module as the drawer's native interface. Loaded on demand so a build or test without it never imports it. */
const cloudDrawerNative = async (): Promise<DrawerNative> => (await import('../../modules/cloudkit-sync')) as unknown as DrawerNative;

const drawerOn = (): boolean => { const x = st().settings; return featureOn(x.appMode, x.registerFeatures, 'cashDrawer'); };

export async function pushDrawer() {
  const s = st();
  if (isTraining()) return; // practice data is never sent
  // A companion without the Cash drawer group never writes the shared drawer, except to finish an unsent change it made earlier as a register.
  if (!drawerOn() && !s.settings.drawerPending) return;
  s.patchSettings({ drawerPending: true });
  if (!hasCreds()) return;
  const pos = st().pos;
  if (activeBackendKind() === 'cloudkit') { // 6b: the drawer is records in the shop's CloudKit zone, not one settings blob
    try {
      const out = await pushCloudDrawer(await cloudDrawerNative(), { shift: pos.shift, ledger: pos.ledger, version: st().settings.drawerVersion ?? 0, shiftPending: !!st().settings.drawerShiftPending });
      st().patchPos({ ledger: out.ledger, shift: out.shift });
      st().patchSettings({ drawerVersion: out.version, drawerPending: false, drawerShiftPending: false });
    } catch (error) {
      st().set({ sync: { state: isNetworkError(error) ? 'offline' : 'error', at: st().sync.at, error: `Drawer not uploaded: ${String((error as Error)?.message ?? error)}` } });
      throw error;
    }
    return;
  }
  let shift = pos.shift; let ledger = pos.ledger;
  let version = (st().settings.drawerVersion ?? 0) + 1;
  try {
    const remote = await getShared('settings', 'drawer');
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
    await putShared('settings', 'drawer', { settings_key: 'drawer', version, settings_json: JSON.stringify({ shift, ledger }) });
  } catch (error) {
    st().set({ sync: { state: isNetworkError(error) ? 'offline' : 'error', at: st().sync.at, error: `Drawer not uploaded: ${String((error as Error)?.message ?? error)}` } });
    throw error;
  }
  st().patchPos({ ledger, shift });
  st().patchSettings({ drawerVersion: version, drawerPending: false, drawerShiftPending: false });
}

async function pullDrawer() {
  if (isTraining() || !drawerOn() || st().settings.drawerPending) return; // our unsent change wins until it is pushed
  if (activeBackendKind() === 'cloudkit') {
    const remote = await pullCloudDrawerState(await cloudDrawerNative()); if (!remote) return;
    const local = st().pos; const have = st().settings.drawerVersion ?? 0; const first = !have;
    // The ledger is always taken (a sale on another register adds entries without moving the shift version). The shift follows
    // the shared one only when it is newer, except that on a first look an open drawer here stays open, as with the old drawer.
    const follow = remote.shift && remote.version > have && !(first && local.shift.open && !remote.shift.open);
    const shift = follow ? remote.shift! : local.shift;
    st().patchPos({ shift, ledger: remote.ledger });
    st().patchSettings({ drawerVersion: Math.max(have, follow ? remote.version : have), ...(shift !== remote.shift && first && local.shift.open ? { drawerPending: true, drawerShiftPending: true } : {}) });
    if (shift !== remote.shift && first && local.shift.open) void pushDrawer().catch(() => {});
    return;
  }
  const row = await getShared('settings', 'drawer'); if (!row) return;
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
    const remote = await getShared('settings', 'warning_list');
    version = Math.max(st().settings.warningListVersion ?? 0, Number(remote?.f.version) || 0) + 1;
    if (remote?.f.settings_json) {
      let r: { entries?: unknown } | null = null; try { r = JSON.parse(remote.f.settings_json); } catch { r = null; }
      if (Array.isArray(r?.entries)) list = mergeWarningList(list, r.entries as Parameters<typeof mergeWarningList>[0]);
    }
  } catch { /* a read that fails leaves our own copy to upload */ }
  try {
    await putShared('settings', 'warning_list', { settings_key: 'warning_list', version, settings_json: JSON.stringify({ entries: list }) });
  } catch (error) {
    st().set({ sync: { state: isNetworkError(error) ? 'offline' : 'error', at: st().sync.at, error: `Warning list not uploaded: ${String((error as Error)?.message ?? error)}` } });
    throw error;
  }
  st().patchSettings({ warningList: list, warningListVersion: version, warningListPending: false });
}

async function pullWarningList() {
  if (isTraining() || st().settings.warningListPending) return; // our unsent change wins until it is pushed
  const row = await getShared('settings', 'warning_list'); if (!row) return;
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
