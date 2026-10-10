// Location: src/screens/CartPane.tsx
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Btn, Card, IconBtn, Money, Row, Sheet, Thumb, Txt, alertMsg, confirm } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { useCatalogue, usePriced } from '../state/selectors';
import { useNav } from '../ui/nav';
import * as ops from '../lib/cartOps';
import { fmt } from '../lib/money';
import { invoiceRows, unitLine } from '../lib/invoiceRows';
import SwipeRow from '../ui/SwipeRow';
import { bundleReviewKey, bundleUnitName, needsBundleCheck, oddBundles } from '../lib/bundles';
import { CheckChangeSheet } from './CheckChange';
import { useUi } from '../ui/uiProfile';
import { cartEmptyText, chargeHint, customerRowText } from '../lib/simpleLabels';
import { CustomAmountSheet, CustomerSheet, DiscountSheet, GiftCheckSheet, GiftSellSheet, LineEditor, SaveCartSheet } from './sheets';
import type { CartLine } from '../lib/types';

export default function CartPane({ onClose }: { onClose?: () => void }) {
  const { c } = useTheme(); const ui = useUi(); const nav = useNav(); const cart = useApp(s => s.pos.cart); const setCart = useApp(s => s.setCart); const priced = usePriced(); const cat = useCatalogue(); const consolidate = useApp(s => s.settings.consolidate);
  const [bundleCheck, setBundleCheck] = useState(false); const [ackKey, setAckKey] = useState('');
  const [menu, setMenu] = useState(false); const [edit, setEdit] = useState<CartLine | null>(null); const [sheet, setSheet] = useState<'none' | 'custom' | 'discount' | 'gift' | 'check' | 'save' | 'customer' | 'newcustomer' | 'change'>('none');
  const locked = !!cart.tenders?.length; const empty = cart.lines.length === 0; const qty = ops.itemCount(cart);
  const open = (s: typeof sheet) => { setMenu(false); setTimeout(() => setSheet(s), 250); };
  // A8.4: a bundle made from variations that aren't a recommended pair is shown to the cashier once before payment.
  const charge = () => { if (needsBundleCheck(priced.bundles, ackKey)) setBundleCheck(true); else nav.push('pay'); };
  const doClear = async () => { setMenu(false); if (locked) return alertMsg('Payment in progress', 'Cancel the payment first.'); if (empty || await confirm('Clear cart?', 'All items will be removed.', 'Clear', true)) setCart(ops.emptyCart()); };

  return (
    <View style={{ flex: 1, backgroundColor: c.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: onClose ? 54 : 12, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.line }}>
        {onClose ? <IconBtn icon="chevron-back" label="Back" onPress={onClose} /> : null}
        <Pressable onPress={() => setSheet('customer')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 }} accessibilityRole="button" accessibilityLabel="Attach customer">
          <Ionicons name={cart.customer ? 'person-circle' : 'person-add-outline'} size={22} color={c.text} />
          <Txt weight="600" numberOfLines={1} style={{ flex: 1 }}>{customerRowText(ui.explain, cart.customer?.name, !!cart.customer)}</Txt>
          {cart.customer ? <Pressable onPress={() => setCart(cc => ({ ...cc, customer: undefined }))} hitSlop={10} accessibilityLabel="Remove customer"><Ionicons name="close-circle" size={20} color={c.sub} /></Pressable> : null}
        </Pressable>
        <IconBtn icon="ellipsis-horizontal" label="Cart menu" onPress={() => setMenu(true)} />
      </View>

      {empty ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }}><Ionicons name="cart-outline" size={44} color={c.sub} /><Txt sub style={{ textAlign: 'center', paddingHorizontal: 24 }}>{cartEmptyText(ui.explain)}</Txt></View> : (
        <ScrollView style={{ flex: 1 }}>
          {locked ? <View style={{ backgroundColor: c.fill, padding: 10 }}><Txt size={13} weight="600" style={{ textAlign: 'center' }}>Part-paid sale — finish payment to edit</Txt></View> : null}
          {priced.lines.map(pl => {
            const l = pl.line; const struck = pl.discountCents > 0; const rows = invoiceRows(pl);
            return (
              // A13: swipe left to remove the line. A12.8: invoice-style rows, one per discount with its own amount.
              <SwipeRow key={l.id} disabled={locked} label="Remove" onDelete={() => setCart(cc => ops.removeLine(cc, l.id))}>
                <Pressable disabled={locked} onPress={() => setEdit(l)} accessibilityRole="button" accessibilityLabel={`${l.title}, quantity ${l.qty}`}
                  style={({ pressed }) => ({ padding: 14, gap: 6, backgroundColor: pressed ? c.fill : 'transparent', borderBottomWidth: 1, borderBottomColor: c.line })}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {l.kind === 'item' ? <Thumb uri={l.variantId ? cat.variants[l.variantId]?.image : undefined} size={48} /> : null}
                    <View style={{ flex: 1 }}>
                      <Txt weight="600" numberOfLines={2}>{l.title}</Txt>
                      {l.variantTitle ? <Txt size={13} sub>{l.variantTitle}</Txt> : null}
                      <Txt size={13} sub>{unitLine(pl)}</Txt>
                      {l.note ? <Txt size={12} sub numberOfLines={1}>“{l.note}”</Txt> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {struck ? <Txt size={13} sub style={{ textDecorationLine: 'line-through' }}>{fmt(pl.grossCents)}</Txt> : null}
                      <Money cents={pl.netCents} weight="600" />
                    </View>
                  </View>
                  {rows.map((r, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingLeft: l.kind === 'item' ? 58 : 0 }}>
                      <Txt size={13} color={c.good} weight="600" style={{ flex: 1 }}>{r.label}</Txt>
                      <Txt size={13} color={c.good} weight="600">−{fmt(r.cents)}</Txt>
                    </View>
                  ))}
                </Pressable>
              </SwipeRow>
            );
          })}
          {priced.bundles.length ? <View style={{ padding: 14, gap: 8, backgroundColor: c.fill }}>
            <Txt size={13} sub weight="600" style={{ textTransform: 'uppercase' }}>Bundle deals</Txt>
            {priced.bundles.map((b, i) => <BundleRow key={i} b={b} />)}
          </View> : null}
        </ScrollView>
      )}

      <View style={{ padding: 16, gap: 6, borderTopWidth: 1, borderTopColor: c.line }}>
        {priced.discountCents > 0 ? <><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt sub>Items</Txt><Money cents={priced.itemsCents} /></View>
          {priced.deals.map((d, i) => <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt color={c.good}>{d.label}</Txt><Money cents={-d.cents} color={c.good} /></View>)}</> : null}
        {cart.discount ? <Txt size={13} sub>{cart.discount.label} applied to the cart</Txt> : null}
        <Btn title={empty ? 'Charge' : `Charge  ${fmt(priced.netCents)}`} disabled={empty} onPress={charge} />
        {!empty ? <Txt size={12} sub style={{ textAlign: 'center' }}>{qty} item{qty === 1 ? '' : 's'}{!consolidate ? '' : ''}</Txt> : null}
        {!empty && chargeHint(ui.explain) ? <Txt size={12} sub style={{ textAlign: 'center' }}>{chargeHint(ui.explain)}</Txt> : null}
      </View>

      <Sheet visible={menu} onClose={() => setMenu(false)} title="Cart">
        <Row icon="trash-outline" title="Clear cart" danger onPress={doClear} />
        <Row icon="bookmark-outline" title="Save cart" onPress={() => (empty || locked ? alertMsg(locked ? 'Payment in progress' : 'Cart is empty') : open('save'))} />
        <Row icon="person-add-outline" title="Create customer" onPress={() => open('newcustomer')} />
        <Row icon="calculator-outline" title="Custom amount" onPress={() => open('custom')} />
        <Row icon="pricetag-outline" title="Apply cart discount" sub={cart.discount?.label} onPress={() => open('discount')} />
        <Row icon="gift-outline" title="Sell gift card" onPress={() => open('gift')} />
        <Row icon="search-outline" title="Check gift card" onPress={() => open('check')} />
        <Row icon="cash-outline" title="Check change" sub="Can we make change for this cart?" last onPress={() => open('change')} />
      </Sheet>
      <Sheet visible={bundleCheck} onClose={() => setBundleCheck(false)} title="Check these bundles">
        <Txt sub style={{ marginBottom: 10 }}>{oddBundles(priced.bundles).length === 1 ? 'This bundle deal is' : 'These bundle deals are'} applied, but the variations aren’t a recommended pair. The customer still gets the deal. Check it’s what they want.</Txt>
        <View style={{ gap: 10 }}>{oddBundles(priced.bundles).map((b, i) => <BundleRow key={i} b={b} />)}</View>
        <View style={{ gap: 8, marginTop: 16 }}>
          <Btn title="Continue to payment" onPress={() => { setAckKey(bundleReviewKey(priced.bundles)); setBundleCheck(false); setTimeout(() => nav.push('pay'), 250); }} />
          <Btn title="Edit cart" kind="secondary" onPress={() => setBundleCheck(false)} />
        </View>
      </Sheet>
      <LineEditor line={edit ? cart.lines.find(l => l.id === edit.id) ?? null : null} onClose={() => setEdit(null)} />
      <CustomAmountSheet visible={sheet === 'custom'} onClose={() => setSheet('none')} />
      <DiscountSheet visible={sheet === 'discount'} onClose={() => setSheet('none')} current={cart.discount} title="Cart discount" onApply={d => setCart(cc => ops.setCartDiscount(cc, d))} />
      <GiftSellSheet visible={sheet === 'gift'} onClose={() => setSheet('none')} />
      <GiftCheckSheet visible={sheet === 'check'} onClose={() => setSheet('none')} />
      <CheckChangeSheet visible={sheet === 'change'} onClose={() => setSheet('none')} />
      <SaveCartSheet visible={sheet === 'save'} onClose={() => setSheet('none')} onSaved={() => setCart(ops.emptyCart())} />
      <CustomerSheet startCreating={sheet === 'newcustomer'} visible={sheet === 'customer' || sheet === 'newcustomer'} onClose={() => setSheet('none')} onPick={cu => setCart(cc => ({ ...cc, customer: { id: cu.id, name: cu.name, email: cu.email, phone: cu.phone } }))} />
    </View>
  );
}

/** One bundle application: names the items and variations in it, the saving, and whether it is a recommended pair. */
export function BundleRow({ b }: { b: import('../lib/types').AppliedBundle }) {
  const { c } = useTheme();
  return (
    <Card style={{ padding: 12, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="layers-outline" size={18} color={c.good} />
        <Txt weight="700" style={{ flex: 1 }} numberOfLines={2}>{b.label}</Txt>
        <Txt weight="700" color={c.good}>−{fmt(b.discountCents)}</Txt>
      </View>
      {b.units.map((u, i) => <Txt key={i} size={13} sub numberOfLines={1}>{bundleUnitName(u)}  ·  {fmt(u.unitCents)}</Txt>)}
      {b.status === 'recommended' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="checkmark-circle" size={15} color={c.good} /><Txt size={12} color={c.good} weight="600">Recommended pair</Txt></View> : null}
      {b.status === 'other' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="alert-circle" size={15} color={c.warn} /><Txt size={12} color={c.warn} weight="600">Not a recommended pair</Txt></View> : null}
    </Card>
  );
}
