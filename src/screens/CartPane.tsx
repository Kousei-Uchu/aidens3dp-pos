// Location: src/screens/CartPane.tsx
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Btn, IconBtn, Money, Row, Sheet, Thumb, Txt, alertMsg, confirm } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { useCatalogue, usePriced } from '../state/selectors';
import { useNav } from '../ui/nav';
import * as ops from '../lib/cartOps';
import { fmt } from '../lib/money';
import { CustomAmountSheet, CustomerSheet, DiscountSheet, GiftCheckSheet, GiftSellSheet, LineEditor, SaveCartSheet } from './sheets';
import type { CartLine } from '../lib/types';

export default function CartPane({ onClose }: { onClose?: () => void }) {
  const { c } = useTheme(); const nav = useNav(); const cart = useApp(s => s.pos.cart); const setCart = useApp(s => s.setCart); const priced = usePriced(); const cat = useCatalogue(); const consolidate = useApp(s => s.settings.consolidate);
  const [menu, setMenu] = useState(false); const [edit, setEdit] = useState<CartLine | null>(null); const [sheet, setSheet] = useState<'none' | 'custom' | 'discount' | 'gift' | 'check' | 'save' | 'customer' | 'newcustomer'>('none');
  const locked = !!cart.tenders?.length; const empty = cart.lines.length === 0; const qty = ops.itemCount(cart);
  const open = (s: typeof sheet) => { setMenu(false); setTimeout(() => setSheet(s), 250); };
  const doClear = async () => { setMenu(false); if (locked) return alertMsg('Payment in progress', 'Cancel the payment first.'); if (empty || await confirm('Clear cart?', 'All items will be removed.', 'Clear', true)) setCart(ops.emptyCart()); };

  return (
    <View style={{ flex: 1, backgroundColor: c.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: onClose ? 54 : 12, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.line }}>
        {onClose ? <IconBtn icon="chevron-back" label="Back" onPress={onClose} /> : null}
        <Pressable onPress={() => setSheet('customer')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 }} accessibilityRole="button" accessibilityLabel="Attach customer">
          <Ionicons name={cart.customer ? 'person-circle' : 'person-add-outline'} size={22} color={c.text} />
          <Txt weight="600" numberOfLines={1} style={{ flex: 1 }}>{cart.customer?.name || (cart.customer ? 'Customer' : 'Add customer')}</Txt>
          {cart.customer ? <Pressable onPress={() => setCart(cc => ({ ...cc, customer: undefined }))} hitSlop={10} accessibilityLabel="Remove customer"><Ionicons name="close-circle" size={20} color={c.sub} /></Pressable> : null}
        </Pressable>
        <IconBtn icon="ellipsis-horizontal" label="Cart menu" onPress={() => setMenu(true)} />
      </View>

      {empty ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }}><Ionicons name="cart-outline" size={44} color={c.sub} /><Txt sub>Cart is empty</Txt></View> : (
        <ScrollView style={{ flex: 1 }}>
          {locked ? <View style={{ backgroundColor: c.fill, padding: 10 }}><Txt size={13} weight="600" style={{ textAlign: 'center' }}>Part-paid sale — finish payment to edit</Txt></View> : null}
          {priced.lines.map(pl => {
            const l = pl.line; const struck = pl.discountCents > 0;
            return (
              <Pressable key={l.id} disabled={locked} onPress={() => setEdit(l)} accessibilityRole="button" accessibilityLabel={`${l.title}, quantity ${l.qty}`} style={({ pressed }) => ({ flexDirection: 'row', padding: 14, gap: 10, backgroundColor: pressed ? c.fill : 'transparent', borderBottomWidth: 1, borderBottomColor: c.line })}>
                {l.kind === 'item' ? <Thumb uri={l.variantId ? cat.variants[l.variantId]?.image : undefined} size={48} /> : null}
                <View style={{ flex: 1 }}>
                  <Txt weight="600" numberOfLines={2}>{l.title}</Txt>
                  {l.variantTitle ? <Txt size={13} sub>{l.variantTitle}</Txt> : null}
                  <Txt size={13} sub>{l.qty} × {fmt(pl.baseUnitCents)}{l.overrideCents !== undefined ? ' (adjusted)' : ''}</Txt>
                  {pl.discounts.map((d, i) => <Txt key={i} size={13} color={c.good} weight="600">{d.label}  −{fmt(d.cents)}</Txt>)}
                  {l.note ? <Txt size={12} sub numberOfLines={1}>“{l.note}”</Txt> : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {struck ? <Txt size={13} sub style={{ textDecorationLine: 'line-through' }}>{fmt(pl.grossCents)}</Txt> : null}
                  <Money cents={pl.netCents} weight="600" />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={{ padding: 16, gap: 6, borderTopWidth: 1, borderTopColor: c.line }}>
        {priced.discountCents > 0 ? <><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt sub>Items</Txt><Money cents={priced.itemsCents} /></View>
          {priced.deals.map((d, i) => <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt color={c.good}>{d.label}</Txt><Money cents={-d.cents} color={c.good} /></View>)}</> : null}
        {cart.discount ? <Txt size={13} sub>{cart.discount.label} applied to the cart</Txt> : null}
        <Btn title={empty ? 'Charge' : `Charge  ${fmt(priced.netCents)}`} disabled={empty} onPress={() => nav.push('pay')} />
        {!empty ? <Txt size={12} sub style={{ textAlign: 'center' }}>{qty} item{qty === 1 ? '' : 's'}{!consolidate ? '' : ''}</Txt> : null}
      </View>

      <Sheet visible={menu} onClose={() => setMenu(false)} title="Cart">
        <Row icon="trash-outline" title="Clear cart" danger onPress={doClear} />
        <Row icon="bookmark-outline" title="Save cart" onPress={() => (empty || locked ? alertMsg(locked ? 'Payment in progress' : 'Cart is empty') : open('save'))} />
        <Row icon="person-add-outline" title="Create customer" onPress={() => open('newcustomer')} />
        <Row icon="calculator-outline" title="Custom amount" onPress={() => open('custom')} />
        <Row icon="pricetag-outline" title="Apply cart discount" sub={cart.discount?.label} onPress={() => open('discount')} />
        <Row icon="gift-outline" title="Sell gift card" onPress={() => open('gift')} />
        <Row icon="search-outline" title="Check gift card" last onPress={() => open('check')} />
      </Sheet>
      <LineEditor line={edit ? cart.lines.find(l => l.id === edit.id) ?? null : null} onClose={() => setEdit(null)} />
      <CustomAmountSheet visible={sheet === 'custom'} onClose={() => setSheet('none')} />
      <DiscountSheet visible={sheet === 'discount'} onClose={() => setSheet('none')} current={cart.discount} title="Cart discount" onApply={d => setCart(cc => ops.setCartDiscount(cc, d))} />
      <GiftSellSheet visible={sheet === 'gift'} onClose={() => setSheet('none')} />
      <GiftCheckSheet visible={sheet === 'check'} onClose={() => setSheet('none')} />
      <SaveCartSheet visible={sheet === 'save'} onClose={() => setSheet('none')} onSaved={() => setCart(ops.emptyCart())} />
      <CustomerSheet startCreating={sheet === 'newcustomer'} visible={sheet === 'customer' || sheet === 'newcustomer'} onClose={() => setSheet('none')} onPick={cu => setCart(cc => ({ ...cc, customer: { id: cu.id, name: cu.name, email: cu.email, phone: cu.phone } }))} />
    </View>
  );
}
