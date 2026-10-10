import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Chip, Field, Keypad, Money, Page, Row, Segmented, Sheet, Toggle, Txt, alertMsg, confirm } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp, currentStaff } from '../state/store';
import { useCatalogue } from '../state/selectors';
import { priceCart } from '../lib/pricing';
import { bundleConfig } from '../lib/sync';
import * as ops from '../lib/cartOps';
import { digitsToCents, fmt } from '../lib/money';
import { exchangeSummary, refundableByGateway, type RefundMethod } from '../lib/returns';
import { executeRefund, REFUND_REASONS } from '../lib/refundFlow';
import { GiveCashSheet } from './CashSheet';
import { postCashRefund } from '../lib/cashSale';
import { getTerminal } from '../zellerBridge';
import { uid } from '../lib/ids';
import type { PosOrder } from '../lib/shopify/orders';
import type { Cart, Variant } from '../lib/types';

/** Return or exchange: pick items or an amount, add replacement items; button reads "Refund $X" or "Even exchange". */
export default function RefundScreen({ order, onClose, onGoPay }: { order: PosOrder; onClose: () => void; onGoPay: () => void }) {
  const { c } = useTheme(); const cat = useCatalogue(); const autos = useApp(s => s.data.autos); const setCart = useApp(s => s.setCart);
  const [mode, setMode] = useState<'items' | 'amount'>('items'); const [qty, setQty] = useState<Record<string, number>>({}); const [digits, setDigits] = useState('');
  const [method, setMethod] = useState<RefundMethod>('original'); const [reason, setReason] = useState<string>(REFUND_REASONS[0]); const [restock, setRestock] = useState(true);
  const [repl, setRepl] = useState<Cart>(ops.emptyCart()); const [pick, setPick] = useState(false); const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [result, setResult] = useState<string | null>(null); const [cashGive, setCashGive] = useState<{ amount: number; text: string; uuid?: string } | null>(null);
  const refundable = refundableByGateway(order.transactions); const maxMoney = refundable.card + refundable.cash + refundable.gift_card;

  const returnCents = mode === 'items' ? order.lines.reduce((s, l) => s + (qty[l.id] ?? 0) * l.unitCents, 0) : Math.min(digitsToCents(digits), maxMoney);
  const replPriced = useMemo(() => priceCart(repl, { variants: cat.variants, collectionsOfProduct: cat.collectionsOfProduct, autoDiscounts: autos, bundles: bundleConfig() }), [repl, cat, autos]);
  const sum = exchangeSummary(returnCents, replPriced.netCents);
  const picked = order.lines.filter(l => (qty[l.id] ?? 0) > 0);
  const hits = useMemo(() => { const t = q.trim().toLowerCase(); return cat.list.filter(v => !t || `${v.productTitle} ${v.variantTitle} ${v.sku ?? ''} ${v.barcode ?? ''}`.toLowerCase().includes(t)).slice(0, 40); }, [q, cat.list]);
  const label = returnCents <= 0 && !repl.lines.length ? 'Nothing selected' : sum.mode === 'even' ? 'Even exchange' : sum.mode === 'refund' ? `Refund ${fmt(sum.amountCents)}` : `Charge ${fmt(sum.amountCents)}`;

  const go = async () => {
    if (returnCents <= 0) return alertMsg('Select something to return');
    if (mode === 'amount' && digitsToCents(digits) > maxMoney) return alertMsg('Too much', `This order only has ${fmt(maxMoney)} left to refund.`);
    const credit = Math.min(returnCents, replPriced.netCents); const cashOut = Math.max(0, returnCents - replPriced.netCents);
    if (!(await confirm(label, `${reason}${picked.length ? ` · ${picked.length} item type(s)` : ''}${cashOut ? `\n${fmt(cashOut)} returns to ${method === 'original' ? 'the original payment' : method === 'cash' ? 'cash' : 'a gift card'}.` : ''}`, 'Confirm'))) return;
    setBusy(true);
    const out = await executeRefund({ order, lines: picked.map(l => ({ lineId: l.id, qty: qty[l.id] })), amountCents: cashOut, method, reason, restock, terminal: getTerminal(), exchangeCreditCents: credit });
    setBusy(false);
    if (!out.ok) return alertMsg('Refund problem', out.message);
    if (repl.lines.length) {
      // replacement items become a normal sale paid (in part) by exchange credit; Pay completes it
      const uuid = uid();
      setCart({ ...repl, id: uid(), customer: order.customer, saleUuid: uuid, tenders: credit > 0 ? [{ id: uid(), kind: 'exchange_credit', amountCents: credit, at: new Date().toISOString() }] : [] });
      onClose(); onGoPay(); return;
    }
    const text = [out.cashOwedCents ? `Give the customer ${fmt(out.cashOwedCents)} cash.` : '', out.newGiftCode ? `New gift card code: ${out.newGiftCode}` : '', out.message ?? ''].filter(Boolean).join('\n') || 'Refund complete.';
    if (out.cashOwedCents > 0) setCashGive({ amount: out.cashOwedCents, text, uuid: out.record?.uuid }); else setResult(text);
  };

  return (
    <Page title={`Return · ${order.name}`} onBack={onClose}>
      <View style={{ padding: 16 }}><Segmented value={mode} onChange={setMode} options={[{ v: 'items', label: 'Items' }, { v: 'amount', label: 'Amount' }]} /></View>
      {mode === 'items' ? <Card style={{ marginHorizontal: 16 }}>{order.lines.map((l, i) => (
        <Row key={l.id} last={i === order.lines.length - 1} title={l.title} sub={`${l.variantTitle ? l.variantTitle + ' · ' : ''}${fmt(l.unitCents)} each · ${l.refundableQty} refundable`}
          right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Btn title="−" small kind="secondary" disabled={!(qty[l.id] > 0)} onPress={() => setQty(s => ({ ...s, [l.id]: Math.max(0, (s[l.id] ?? 0) - 1) }))} /><Txt weight="700" style={{ minWidth: 18, textAlign: 'center' }}>{qty[l.id] ?? 0}</Txt><Btn title="+" small kind="secondary" disabled={(qty[l.id] ?? 0) >= l.refundableQty} onPress={() => setQty(s => ({ ...s, [l.id]: Math.min(l.refundableQty, (s[l.id] ?? 0) + 1) }))} /></View>} />))}</Card>
        : <View style={{ padding: 16 }}><Txt size={36} weight="700" style={{ textAlign: 'center', marginBottom: 10 }}>{fmt(digitsToCents(digits))}</Txt><Keypad value={digits} onChange={setDigits} /><Txt size={12} sub style={{ textAlign: 'center', marginTop: 8 }}>Up to {fmt(maxMoney)} can be refunded.</Txt></View>}

      <View style={{ padding: 16, gap: 8 }}>
        <Txt weight="700">Replacement items</Txt>
        {repl.lines.map(l => <Row key={l.id} title={`${l.qty} × ${l.title}`} sub={l.variantTitle} right={<Money cents={l.unitCents * l.qty} />} onPress={() => setRepl(r => ops.removeLine(r, l.id))} />)}
        <Btn title="Add replacement item" icon="add" kind="secondary" onPress={() => setPick(true)} />
        {repl.lines.length ? <Txt size={13} sub>Replacement total {fmt(replPriced.netCents)} (discounts applied). Tap a line to remove it.</Txt> : null}
      </View>

      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        <Txt weight="700">Reason</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{REFUND_REASONS.map(r => <Chip key={r} label={r} active={reason === r} onPress={() => setReason(r)} />)}</View>
        {sum.mode === 'refund' || (repl.lines.length === 0) ? <><Txt weight="700" style={{ marginTop: 6 }}>Refund to</Txt>
          <Segmented value={method} onChange={setMethod} options={[{ v: 'original', label: 'Original' }, { v: 'cash', label: 'Cash' }, { v: 'gift_card', label: 'Gift card' }]} />
          {method === 'original' ? <Txt size={12} sub>Card refunds return exactly what the customer paid, via the terminal. Card {fmt(refundable.card)} · Cash {fmt(refundable.cash)} · Gift card {fmt(refundable.gift_card)} refundable.</Txt> : null}</> : null}
        <Card><Toggle label="Restock returned items" sub="Adds the quantity back to stock" value={restock} onChange={setRestock} /></Card>
        <Btn title={label} busy={busy} disabled={returnCents <= 0 && !repl.lines.length} onPress={() => void go()} style={{ marginTop: 6 }} />
      </View>

      <Sheet visible={pick} onClose={() => setPick(false)} title="Replacement item" full>
        <Field kind="search" placeholder="Search products" value={q} onChangeText={setQ} />
        {hits.map((v: Variant) => <Row key={v.id} title={v.productTitle + (v.variantTitle ? ` · ${v.variantTitle}` : '')} right={<Money cents={v.priceCents} />} onPress={() => { setRepl(r => ops.addVariant(r, v, 1, true)); setPick(false); }} />)}
      </Sheet>
      <GiveCashSheet visible={!!cashGive} amount={cashGive?.amount ?? 0} onDone={given => { const g = cashGive; setCashGive(null); if (!g) return; if (given) useApp.getState().patchPos({ ledger: postCashRefund(useApp.getState().pos.ledger, { saleUuid: g.uuid, given, staff: currentStaff()?.name }) }); setResult(g.text); }} />
      <Sheet visible={!!result} onClose={() => { setResult(null); onClose(); }} title="Done"><Txt size={16} style={{ marginBottom: 14 }}>{result}</Txt><Btn title="OK" onPress={() => { setResult(null); onClose(); }} /></Sheet>
      <View style={{ height: 0, backgroundColor: c.bg }} />
    </Page>
  );
}
