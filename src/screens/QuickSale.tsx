// Location: src/screens/QuickSale.tsx
// The companion's selling screen (docs/COMPANION_PLAN.md): search or scan an item, type an amount, see the cart, then pay or send it
// to a register. It works on the same cart as the full checkout, so expanding to the full POS (and coming back) loses nothing.
// Two flavours: 'sell' (Selling is on: Pay and Expand) and 'handoff' (Selling is off: build a cart and send it to a register as a
// saved cart, which every register already syncs). Every action reuses what the checkout uses: cart ops, pricing, scanners and the
// save-cart sheet. Pure choices (which flavour, which payment methods) are in src/lib/appMode.ts.
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Btn, Card, Empty, Field, Keypad, Money, Row, Txt, alertMsg, useToast } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { usePriced, useCatalogue } from '../state/selectors';
import { CameraScanner, HidScanner } from './Scanner';
import { SaveCartSheet } from './sheets';
import { resolveScan, searchVariants, stockText } from '../lib/lookup';
import { digitsToCents, fmt } from '../lib/money';
import { pushSaved } from '../lib/sync';
import * as ops from '../lib/cartOps';
import type { Variant } from '../lib/types';

export type QuickSaleKind = 'sell' | 'handoff';

export default function QuickSale({ kind, onExpand, onBack }: { kind: QuickSaleKind; onExpand?: () => void; onBack?: () => void }) {
  const { c } = useTheme(); const nav = useNav(); const toast = useToast();
  const cart = useApp(s => s.pos.cart); const setCart = useApp(s => s.setCart); const consolidate = useApp(s => s.settings.consolidate);
  const cat = useCatalogue(); const priced = usePriced();
  const [q, setQ] = useState(''); const [digits, setDigits] = useState(''); const [cam, setCam] = useState(false); const [saving, setSaving] = useState(false);
  const locked = !!cart.tenders?.length; // a payment has started: the cart is fixed until it is finished or cancelled, as at the checkout
  const results = useMemo(() => searchVariants(cat.list, q, 8), [cat.list, q]);
  const count = ops.itemCount(cart);
  const guard = (): boolean => { if (locked) { alertMsg('Payment in progress', 'Finish or cancel the payment before changing the cart.'); return true; } return false; };
  const add = (v: Variant) => { if (guard()) return; setCart(cc => ops.addVariant(cc, v, 1, consolidate)); toast.show(`Added ${v.productTitle}`); setQ(''); };
  const onScan = (code: string): string | null => {
    if (locked) return null;
    const r = resolveScan(code, Object.values(useApp.getState().data.variants), useApp.getState().data.presets);
    if (r.kind !== 'variant') return null; // a pass, a gift card or a discount means nothing here
    setCart(cc => ops.addVariant(cc, r.variant, 1, consolidate)); toast.show(`Added ${r.variant.productTitle}`);
    return `Added ${r.variant.productTitle}${r.variant.variantTitle ? ' · ' + r.variant.variantTitle : ''}`;
  };
  const addAmount = () => { if (guard()) return; const cents = digitsToCents(digits); if (cents <= 0) return; setCart(cc => ops.addCustom(cc, cents)); setDigits(''); };
  const clear = () => { if (guard()) return; setCart(ops.emptyCart()); };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <HidScanner enabled={!cam && !saving} onScan={code => { void onScan(code); }} />
      <View style={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {onBack ? <Btn small kind="ghost" title="Back" icon="chevron-back" onPress={onBack} /> : null}
        <Txt size={24} weight="700" style={{ flex: 1 }}>{kind === 'sell' ? 'Quick sale' : 'Cart for a register'}</Txt>
        {kind === 'sell' && onExpand ? <Btn small kind="ghost" title="Full checkout" icon="expand-outline" onPress={onExpand} /> : null}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14 }}>
        {kind === 'handoff' ? <Txt size={13} sub>Build a cart here and send it to a register. It shows up in Saved carts on every register, ready to open and take payment.</Txt> : null}
        <Card style={{ padding: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}><Field kind="text" label="Find an item" placeholder="Name, SKU or barcode" value={q} onChangeText={setQ} /></View>
            <Btn kind="secondary" icon="barcode-outline" title="Scan" onPress={() => setCam(true)} />
          </View>
          {results.map((v, i) => <Row key={v.id} last={i === results.length - 1} title={v.productTitle + (v.variantTitle ? ` · ${v.variantTitle}` : '')} sub={stockText(v.stock)} right={<Money cents={v.priceCents} size={15} weight="600" />} onPress={() => add(v)} />)}
          {q.trim() && !results.length ? <Txt size={13} sub>Nothing matches.</Txt> : null}
        </Card>
        <Card style={{ padding: 12 }}>
          <Txt size={13} sub weight="600">Add an amount</Txt>
          <Txt size={40} weight="700" style={{ textAlign: 'center', paddingVertical: 8 }}>{fmt(digitsToCents(digits))}</Txt>
          <Keypad value={digits} onChange={setDigits} submitLabel={`Add ${fmt(digitsToCents(digits))}`} onSubmit={addAmount} />
        </Card>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <View style={{ padding: 14, paddingBottom: 6 }}><Txt size={13} sub weight="600">Cart</Txt></View>
          {cart.lines.length ? priced.lines.map((pl, i) => (
            <Row key={pl.line.id} last={i === priced.lines.length - 1} title={pl.line.title ?? 'Item'} sub={pl.line.note}
              right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Btn small kind="ghost" title="-" onPress={() => { if (guard()) return; setCart(cc => (pl.line.qty <= 1 ? ops.removeLine(cc, pl.line.id) : ops.setQty(cc, pl.line.id, pl.line.qty - 1))); }} />
                <Txt weight="700">{pl.line.qty}</Txt>
                <Btn small kind="ghost" title="+" onPress={() => { if (guard()) return; setCart(cc => ops.setQty(cc, pl.line.id, pl.line.qty + 1)); }} />
                <Money cents={pl.netCents} size={15} weight="600" />
              </View>} />
          )) : <View style={{ padding: 14, paddingTop: 0 }}><Empty title="Nothing in the cart yet" /></View>}
        </Card>
      </ScrollView>
      <View style={{ padding: 16, gap: 10, backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><Txt style={{ flex: 1 }} weight="600">{count} item{count === 1 ? '' : 's'}</Txt><Money cents={priced.netCents} size={26} weight="700" /></View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {kind === 'sell' ? <View style={{ flex: 1 }}><Btn title="Pay" icon="card-outline" disabled={!count} onPress={() => nav.push('pay')} /></View> : null}
          <View style={{ flex: 1 }}><Btn title="Send to register" icon="paper-plane-outline" kind={kind === 'sell' ? 'secondary' : 'primary'} disabled={!count || locked} onPress={() => setSaving(true)} /></View>
          {count ? <Btn kind="ghost" title="Clear" onPress={clear} /> : null}
        </View>
      </View>
      <CameraScanner visible={cam} onClose={() => setCam(false)} title="Scan an item" onScan={code => { const t = onScan(code); return t; }} />
      <SaveCartSheet visible={saving} onClose={() => setSaving(false)} onSaved={() => { setCart(ops.emptyCart()); void pushSaved().catch(() => {}); toast.show('Sent to the registers'); }} />
    </View>
  );
}
