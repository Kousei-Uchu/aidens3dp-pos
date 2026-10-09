import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Btn, Card, Empty, Money, Page, Row, Segmented, Sheet, Txt, alertMsg } from '../ui/kit';
import { useNav } from '../ui/nav';
import { fulfillOrder, listOrders, type PosOrder } from '../lib/shopify/orders';
import RefundScreen from './Refund';
import { ReceiptPrompt } from './Receipt';
import { fmt } from '../lib/money';
import type { SaleRecord } from '../lib/types';

const Q = { open: 'tag:pos status:open', unfulfilled: 'tag:pos fulfillment_status:unfulfilled', completed: 'tag:pos fulfillment_status:fulfilled' } as const;
/** Orders: Open | Unfulfilled | Completed – Mark fulfilled, refund and receipt. */
export default function Orders() {
  const nav = useNav(); const [tab, setTab] = useState<keyof typeof Q>('open'); const [orders, setOrders] = useState<PosOrder[]>([]); const [busy, setBusy] = useState(false); const [sel, setSel] = useState<PosOrder | null>(null); const [refund, setRefund] = useState<PosOrder | null>(null); const [receipt, setReceipt] = useState<SaleRecord | null>(null);
  const load = useCallback(async () => { setBusy(true); try { setOrders((await listOrders({ query: Q[tab], first: 30 })).orders); } catch (e: any) { alertMsg('Could not load orders', e.message); } setBusy(false); }, [tab]);
  useEffect(() => { void load(); }, [tab]);
  if (refund) return <RefundScreen order={refund} onClose={() => setRefund(null)} onGoPay={() => nav.push('pay')} />;
  const mark = async (o: PosOrder) => { try { await fulfillOrder(o.id); setSel(null); void load(); } catch (e: any) { alertMsg('Could not fulfil', e.message); } };
  return (
    <Page title="Orders" onBack={nav.pop} scroll={false}>
      <View style={{ padding: 16 }}><Segmented value={tab} onChange={setTab} options={[{ v: 'open', label: 'Open' }, { v: 'unfulfilled', label: 'Unfulfilled' }, { v: 'completed', label: 'Completed' }]} /></View>
      <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void load()} />}>
        {orders.length === 0 && !busy ? <Empty icon="file-tray-outline" title="No orders here" /> : <Card style={{ marginHorizontal: 16 }}>{orders.map((o, i) => <Row key={o.id} last={i === orders.length - 1} title={`${o.name}${o.customer ? ' · ' + o.customer.name : ''}`} sub={`${new Date(o.createdAt).toLocaleString()} · ${o.financial.toLowerCase()} · ${o.fulfillment.toLowerCase()}`} right={<Money cents={o.totalCents} weight="600" />} onPress={() => setSel(o)} />)}</Card>}
      </ScrollView>
      <Sheet visible={!!sel} onClose={() => setSel(null)} title={sel?.name}>
        {sel?.lines.map(l => <Txt key={l.id} sub>{l.qty} × {l.title} — {fmt(l.unitCents * l.qty)}</Txt>)}
        <View style={{ gap: 8, marginTop: 14 }}>
          {sel && !/^fulfilled$/i.test(sel.fulfillment) ? <Btn title="Mark fulfilled" onPress={() => void mark(sel)} /> : null}
          <Btn title="Refund or return" kind="secondary" onPress={() => { setRefund(sel); setSel(null); }} />
          <Btn title="Receipt" kind="secondary" onPress={() => { if (!sel) return; setReceipt({ uuid: sel.id, type: 'sale', ts: sel.createdAt, registerId: '', registerName: '', customer: sel.customer, orderName: sel.name, receiptLink: sel.receiptLink, lines: sel.lines.map(l => ({ title: l.title, variantTitle: l.variantTitle, qty: l.qty, baseUnitCents: l.originalUnitCents, grossCents: l.originalUnitCents * l.qty, discountCents: 0, netCents: l.unitCents * l.qty, costCents: 0, discountLabels: [], kind: 'item' as const })), itemsCents: sel.totalCents, discountCents: 0, netCents: sel.totalCents, tipCents: 0, totalCents: sel.totalCents, cogsCents: 0, feesCents: 0, roundingCents: 0, tenders: sel.tenders, deals: [] }); setSel(null); }} />
        </View>
      </Sheet>
      {receipt ? <ReceiptPrompt sale={receipt} onDone={() => setReceipt(null)} /> : null}
    </Page>
  );
}
