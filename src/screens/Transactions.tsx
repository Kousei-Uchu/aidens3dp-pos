import { signedSaving } from '../lib/adjustReview';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { Btn, Card, Chip, Empty, Field, IconBtn, Money, Page, Row, Txt, alertMsg } from '../ui/kit';
import { useLayout, useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { listOrders, type PosOrder } from '../lib/shopify/orders';
import { hasCreds } from '../lib/shopify/client';
import { fmt } from '../lib/money';
import { ReceiptPrompt, receiptText } from './Receipt';
import RefundScreen from './Refund';
import type { SaleRecord } from '../lib/types';
import { Share } from 'react-native';
import { loadSquareSales } from '../lib/squareHistoryIO';

type Entry = { key: string; ts: string; name: string; totalCents: number; customer?: string; kind: 'sale' | 'refund'; summary: string; order?: PosOrder; sale?: SaleRecord; pending: boolean; haystack: string };

const tenderWord = (k: string) => (k === 'card' ? 'Card' : k === 'cash' ? 'Cash' : k === 'gift_card' ? 'Gift card' : 'Credit');
const dayLabel = (ts: string) => { const d = new Date(ts); const t = new Date(); const y = new Date(Date.now() - 86400000); const same = (a: Date, b: Date) => a.toDateString() === b.toDateString(); return same(d, t) ? 'Today' : same(d, y) ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }); };

export default function Transactions() {
  const { c } = useTheme(); const { tablet } = useLayout(); const nav = useNav(); const sales = useApp(s => s.pos.sales); const outbox = useApp(s => s.pos.outbox);
  const [orders, setOrders] = useState<PosOrder[]>([]); const [next, setNext] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [q, setQ] = useState(''); const [remoteQ, setRemoteQ] = useState<PosOrder[] | null>(null);
  const [showSq, setShowSq] = useState(false); const [sqSales, setSqSales] = useState<SaleRecord[]>([]); const [sqBusy, setSqBusy] = useState(false);
  const toggleSq = async () => { if (showSq) { setShowSq(false); return; } setShowSq(true); if (!sqSales.length) { setSqBusy(true); try { setSqSales(await loadSquareSales()); } catch (e: any) { alertMsg('Could not load Square history', e.message); } setSqBusy(false); } };
  const [sel, setSel] = useState<Entry | null>(null); const [refund, setRefund] = useState<PosOrder | null>(null); const [receipt, setReceipt] = useState<SaleRecord | null>(null);

  const load = useCallback(async (more = false) => {
    if (!hasCreds()) return; setBusy(true);
    try { const r = await listOrders({ query: 'tag:pos', first: 25, after: more ? next : null }); setOrders(o => (more ? [...o, ...r.orders] : r.orders)); setNext(r.next); } catch (e: any) { if (!/network|connection/i.test(e.message)) alertMsg('Could not load orders', e.message); }
    setBusy(false);
  }, [next]);
  useEffect(() => { void load(false); }, []);

  const entries = useMemo<Entry[]>(() => {
    const byUuid = new Map<string, PosOrder>(); for (const o of [...orders, ...(remoteQ ?? [])]) if (o.saleUuid) byUuid.set(o.saleUuid, o);
    const out: Entry[] = []; const seen = new Set<string>(); const pending = new Set(outbox.map(o => o.id));
    for (const s of sales) { const o = byUuid.get(s.uuid); seen.add(s.uuid);
      out.push({ key: s.uuid, ts: s.ts, name: s.orderName ?? o?.name ?? (s.type === 'refund' ? 'Refund' : 'Sale'), totalCents: s.netCents, customer: s.customer?.name, kind: s.type, order: o, sale: s, pending: pending.has(s.uuid) && !o,
        summary: s.tenders.map(t => tenderWord(t.kind)).join(' + ') || '—', haystack: [s.orderName, s.customer?.name, s.note, ...s.lines.map(l => l.title)].join(' ').toLowerCase() }); }
    for (const o of [...orders, ...(remoteQ ?? [])]) { const k = o.saleUuid ?? o.id; if (seen.has(k)) continue; seen.add(k);
      out.push({ key: k, ts: o.createdAt, name: o.name, totalCents: o.totalCents, customer: o.customer?.name, kind: 'sale', order: o, pending: false, summary: o.tenders.map(t => tenderWord(t.kind)).join(' + ') || 'Order', haystack: [o.name, o.customer?.name, o.note, ...o.lines.map(l => l.title)].join(' ').toLowerCase() }); }
    if (showSq) for (const s of sqSales) out.push({ key: s.uuid, ts: s.ts, name: s.orderName ?? 'Square', totalCents: s.netCents, customer: s.customer?.name, kind: s.type, sale: s, pending: false,
      summary: `Square · ${s.tenders.map(t => tenderWord(t.kind)).join(' + ') || '—'}`, haystack: [s.orderName, s.customer?.name, s.note, ...s.lines.map(l => l.title)].join(' ').toLowerCase() });
    return out.sort((a, b) => b.ts.localeCompare(a.ts));
  }, [sales, orders, remoteQ, outbox, showSq, sqSales]);
  const shown = useMemo(() => { const t = q.trim().toLowerCase().replace(/^#/, ''); return t ? entries.filter(e => e.haystack.replace(/#/g, '').includes(t)) : entries; }, [entries, q]);
  const rows = useMemo(() => { const out: ({ h: string } | Entry)[] = []; let last = ''; for (const e of shown) { const d = dayLabel(e.ts); if (d !== last) { out.push({ h: d }); last = d; } out.push(e); } return out; }, [shown]);

  const searchRemote = async () => { if (!q.trim()) return; setBusy(true); try { setRemoteQ((await listOrders({ query: `tag:pos ${q.trim()}`, first: 25 })).orders); } catch (e: any) { alertMsg('Search failed', e.message); } setBusy(false); };

  const list = (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: 54, paddingHorizontal: 12, paddingBottom: 8, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <Txt size={24} weight="700" style={{ marginBottom: 8, marginLeft: 4 }}>Transactions</Txt>
        <Field kind="search" placeholder="Receipt #, customer, note or item" value={q} onChangeText={t => { setQ(t); setRemoteQ(null); }} onSubmitEditing={searchRemote} style={{ marginBottom: 0 }} />
        <View style={{ flexDirection: 'row', marginTop: 8, marginLeft: 4 }}><Chip label={sqBusy ? 'Loading Square history…' : 'Square history'} icon="archive-outline" active={showSq} onPress={() => void toggleSq()} /></View>
      </View>
      <FlatList data={rows} keyExtractor={(r, i) => ('h' in r ? `h${r.h}${i}` : r.key)} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void load(false)} />}
        ListEmptyComponent={<Empty icon="receipt-outline" title="No transactions yet" sub={q ? 'Press search to look in Shopify.' : 'Completed sales appear here.'} />}
        ListFooterComponent={<View style={{ padding: 16, gap: 8 }}>{q.trim() ? <Btn title="Search Shopify" kind="secondary" small onPress={searchRemote} /> : null}{next && !q ? <Btn title="Load more" kind="secondary" small onPress={() => void load(true)} /> : null}</View>}
        renderItem={({ item: r }) => 'h' in r ? <Txt size={13} sub weight="600" style={{ marginTop: 14, marginBottom: 4, marginHorizontal: 20, textTransform: 'uppercase' }}>{r.h}</Txt> : (
          <View style={{ marginHorizontal: 16 }}><Card style={{ borderRadius: 0, borderTopWidth: 0, backgroundColor: sel?.key === r.key ? c.fill : c.card }}>
            <Row title={`${r.name}${r.customer ? ' · ' + r.customer : ''}`} sub={`${new Date(r.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${r.summary}${r.pending ? ' · waiting to sync' : ''}`} last
              right={<Money cents={r.kind === 'refund' ? -r.totalCents : r.totalCents} weight="600" color={r.kind === 'refund' ? c.bad : undefined} />} onPress={() => (tablet ? setSel(r) : (setSel(r)))} /></Card></View>)} />
    </View>
  );

  const detail = sel ? <Detail e={sel} onClose={() => setSel(null)} onRefund={o => setRefund(o)} onReceipt={s => setReceipt(s)} embedded={tablet} /> : null;
  if (refund) return <RefundScreen order={refund} onClose={() => setRefund(null)} onGoPay={() => nav.push('pay')} />;
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {!tablet && sel ? detail : <View style={{ flex: tablet ? 4 : 1 }}>{list}</View>}
      {tablet ? <View style={{ flex: 6, borderLeftWidth: 1, borderLeftColor: c.line }}>{detail ?? <Empty icon="receipt-outline" title="Select a transaction" />}</View> : null}
      {receipt ? <ReceiptPrompt sale={receipt} onDone={() => setReceipt(null)} /> : null}
    </View>
  );
}

const orderAsSale = (o: PosOrder): SaleRecord => ({ uuid: o.saleUuid ?? o.id, type: 'sale', ts: o.createdAt, registerId: '', registerName: o.registerName ?? '', customer: o.customer, orderName: o.name, receiptLink: o.receiptLink,
  lines: o.lines.map(l => ({ title: l.title, variantTitle: l.variantTitle, qty: l.qty, baseUnitCents: l.originalUnitCents, grossCents: l.originalUnitCents * l.qty, discountCents: (l.originalUnitCents - l.unitCents) * l.qty, netCents: l.unitCents * l.qty, costCents: 0, discountLabels: [], kind: 'item' as const })),
  itemsCents: o.totalCents, discountCents: 0, netCents: o.totalCents, tipCents: 0, totalCents: o.totalCents, cogsCents: 0, feesCents: 0, roundingCents: o.roundingCents, tenders: o.tenders, deals: [], adjustments: o.adjustments?.length ? o.adjustments : undefined });

function Detail({ e, onClose, onRefund, onReceipt, embedded }: { e: Entry; onClose: () => void; onRefund: (o: PosOrder) => void; onReceipt: (s: SaleRecord) => void; embedded: boolean }) {
  const { c } = useTheme(); const sale = e.sale ?? (e.order ? orderAsSale(e.order) : null); if (!sale) return null;
  const lines = e.sale?.lines ?? sale.lines; const tenders = e.sale?.tenders ?? sale.tenders;
  const body = (
    <View style={{ padding: 16, gap: 14 }}>
      <View style={{ alignItems: 'center' }}><Money cents={sale.netCents} size={36} weight="700" color={e.kind === 'refund' ? c.bad : undefined} /><Txt sub>{new Date(sale.ts).toLocaleString()}</Txt>{e.pending ? <Txt size={13} color={c.warn}>Waiting to sync to Shopify</Txt> : null}</View>
      <Card>{lines.map((l, i) => <Row key={i} last={i === lines.length - 1} title={`${l.qty} × ${l.title}`} sub={[l.variantTitle, l.discountLabels?.join(', ')].filter(Boolean).join(' · ') || undefined} right={<Money cents={l.netCents} />} />)}</Card>
      {sale.adjustments?.length ? <Card>{sale.adjustments.map((a, i, all) => <Row key={i} last={i === all.length - 1} icon="cut-outline" title={`${a.kind === 'item' ? 'Item price' : a.kind === 'line' ? 'Line price' : 'Whole order price'} · ${a.title}`} sub={a.reason ? `Reason: ${a.reason}` : 'No reason given'} right={<Txt weight="600">{signedSaving(a.cents)}</Txt>} />)}</Card> : null}
      <Card>{tenders.map((t, i) => <Row key={t.id + i} last={i === tenders.length - 1} icon={t.kind === 'card' ? 'card-outline' : t.kind === 'cash' ? 'cash-outline' : 'gift-outline'}
        title={t.kind === 'card' ? `Card${t.card?.scheme ? ' · ' + t.card.scheme : ''}${t.card?.panMasked ? ' •••• ' + t.card.panMasked : ''}` : tenderWord(t.kind)} sub={t.card?.approvalCode ? `Approval ${t.card.approvalCode}` : t.roundingCents ? `Rounding ${fmt(t.roundingCents)}` : undefined} right={<Money cents={t.amountCents} />} />)}</Card>
      {sale.customer ? <Txt sub>Customer: {sale.customer.name}</Txt> : null}
      {e.order?.note ? <Txt sub>Note: {e.order.note}</Txt> : null}
      <Btn title="New receipt" icon="receipt-outline" kind="secondary" onPress={() => onReceipt(sale)} />
      {e.kind === 'sale' && sale.registerId !== 'square' ? <Btn title="Return or exchange" icon="return-down-back-outline" disabled={!e.order} onPress={() => e.order && onRefund(e.order)} /> : null}
      {e.kind === 'sale' && !e.order && sale.registerId !== 'square' ? <Txt size={12} sub style={{ textAlign: 'center' }}>Returns unlock once this sale has synced to Shopify.</Txt> : null}
      {sale.registerId === 'square' ? <Txt size={12} sub style={{ textAlign: 'center' }}>Imported from Square. Read-only: it can’t be returned or refunded here.</Txt> : null}
      <Btn title="Share receipt text" kind="ghost" onPress={() => void Share.share({ message: receiptText(sale) })} />
    </View>
  );
  return embedded ? <View style={{ flex: 1, backgroundColor: c.bg }}><View style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line }}><Txt size={20} weight="700" style={{ flex: 1 }}>{e.name}</Txt><IconBtn icon="close" label="Close" onPress={onClose} /></View>{body}</View>
    : <Page title={e.name} onBack={onClose}>{body}</Page>;
}
void Chip;
